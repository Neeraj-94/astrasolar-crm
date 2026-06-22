import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import {
  getEffectivePermissions,
  resolveVisibilityScope,
} from '@astra/shared';
import type { Prisma } from '../db';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import type { AuthUser } from '../common/auth-user';

const USER_WITH_ROLES = {
  roles: {
    include: {
      role: {
        include: { permissions: { include: { permission: true } } },
      },
    },
  },
} as const;

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
  ) {}

  /** Assemble the request principal: identity + UNION permissions + scope. */
  async buildAuthUser(userId: string): Promise<AuthUser | null> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: USER_WITH_ROLES,
    });
    if (!user || !user.isActive) return null;

    const roles = user.roles.map((ur) => ({
      key: ur.role.name,
      permissions: ur.role.permissions.map((rp) => ({ key: rp.permission.key })),
    }));
    const perms = getEffectivePermissions(roles);

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      teamId: user.teamId,
      roleKeys: user.roles.map((ur) => ur.role.name),
      permissions: perms,
      scope: resolveVisibilityScope(perms),
    };
  }

  findByEmail(email: string) {
    return this.prisma.user.findUnique({
      where: { email },
      include: USER_WITH_ROLES,
    });
  }

  findById(id: string) {
    return this.prisma.user.findUnique({
      where: { id },
      include: USER_WITH_ROLES,
    });
  }

  async create(input: {
    email: string;
    password: string;
    name: string;
    teamId?: string;
    region?: string;
    aliases?: string[];
    roleKeys?: string[];
  }) {
    const existing = await this.prisma.user.findUnique({
      where: { email: input.email },
    });
    if (existing) throw new BadRequestException('Email already registered');

    const passwordHash = await bcrypt.hash(input.password, 10);
    const roleConnect = await this.resolveRoleConnect(input.roleKeys ?? []);

    const user = await this.prisma.user.create({
      data: {
        email: input.email,
        password: passwordHash,
        name: input.name,
        teamId: input.teamId,
        region: input.region,
        aliases: normaliseAliases(input.aliases ?? []),
        // Retain the plaintext temp password so a super admin can manually send
        // the welcome email later from the Users tab. The email is NOT sent
        // automatically on creation.
        welcomePassword: input.password,
        roles: { create: roleConnect },
      },
      include: USER_WITH_ROLES,
    });

    return user;
  }

  /**
   * Manually send (or resend) the welcome email to a user, on demand from the
   * admin Users tab. Uses the temp password retained at creation / last admin
   * reset. Returns whether delivery succeeded so the UI can flash accordingly.
   */
  async sendWelcomeEmail(id: string) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('User not found');
    if (!user.welcomePassword) {
      throw new BadRequestException(
        'No temporary password on file for this user (they may have already ' +
          'changed it). Reset their password first, then resend.',
      );
    }

    const emailSent = await this.mail.sendWelcomeEmail({
      to: user.email,
      name: user.name,
      password: user.welcomePassword,
    });

    if (emailSent) {
      await this.prisma.user.update({
        where: { id },
        data: { welcomeEmailSentAt: new Date() },
      });
    }

    return { emailSent };
  }

  async setActive(id: string, isActive: boolean) {
    await this.ensureExists(id);
    return this.prisma.user.update({ where: { id }, data: { isActive } });
  }

  /** Full directory for the admin console — includes inactive users + email. */
  async listAll() {
    const users = await this.prisma.user.findMany({
      include: { roles: { include: { role: true } } },
      orderBy: [
        { sortOrder: { sort: 'asc', nulls: 'last' } },
        { isActive: 'desc' },
        { name: 'asc' },
      ],
    });
    return users.map((u) => ({
      id: u.id,
      email: u.email,
      name: u.name,
      aliases: u.aliases,
      isActive: u.isActive,
      teamId: u.teamId,
      roleKeys: u.roles.map((r) => r.role.name),
      // Welcome-email UI hints: whether a temp password is on file to send, and
      // when the welcome email was last sent.
      canSendWelcome: !!u.welcomePassword,
      welcomeEmailSentAt: u.welcomeEmailSentAt,
    }));
  }

  /** Persist a drag-and-drop row order (admin directory). */
  async reorder(ids: string[]) {
    const existing = await this.prisma.user.findMany({
      where: { id: { in: ids } },
      select: { id: true },
    });
    const known = new Set(existing.map((u) => u.id));
    await this.prisma.$transaction(
      ids
        .filter((id) => known.has(id))
        .map((id, index) =>
          this.prisma.user.update({
            where: { id },
            data: { sortOrder: index },
          }),
        ),
    );
    return { ok: true };
  }

  async update(
    id: string,
    input: {
      name?: string;
      email?: string;
      password?: string;
      teamId?: string;
      region?: string;
      aliases?: string[];
    },
  ) {
    await this.ensureExists(id);

    if (input.email) {
      const clash = await this.prisma.user.findUnique({
        where: { email: input.email },
      });
      if (clash && clash.id !== id) {
        throw new BadRequestException('Email already registered');
      }
    }

    const data: {
      name?: string;
      email?: string;
      password?: string;
      teamId?: string;
      region?: string;
      aliases?: string[];
      welcomePassword?: string;
    } = {};
    if (input.name !== undefined) data.name = input.name;
    if (input.email !== undefined) data.email = input.email;
    if (input.teamId !== undefined) data.teamId = input.teamId;
    if (input.region !== undefined) data.region = input.region;
    if (input.aliases !== undefined) data.aliases = normaliseAliases(input.aliases);
    if (input.password) {
      data.password = await bcrypt.hash(input.password, 10);
      // Admin reset → keep the plaintext so the welcome email can be resent.
      data.welcomePassword = input.password;
    }

    await this.prisma.user.update({ where: { id }, data });
    return this.findById(id);
  }

  /**
   * Hard-delete a user. Removes role links first; the DB blocks deletion when
   * the user still owns domain records (leads/sales/etc.) — in that case we
   * surface a clear message steering the admin to deactivate instead.
   */
  async remove(id: string) {
    await this.ensureExists(id);
    try {
      await this.prisma.$transaction([
        this.prisma.userRole.deleteMany({ where: { userId: id } }),
        this.prisma.user.delete({ where: { id } }),
      ]);
    } catch (e) {
      const code = (e as { code?: string }).code;
      if (code === 'P2003' || code === 'P2014') {
        throw new BadRequestException(
          'User has linked records and cannot be deleted. Deactivate the user instead.',
        );
      }
      throw e;
    }
    return { ok: true };
  }

  async assignRoles(userId: string, roleNames: string[]) {
    await this.ensureExists(userId);
    const roles = await this.prisma.role.findMany({
      where: { name: { in: roleNames } },
    });
    await this.prisma.$transaction(
      roles.map((role) =>
        this.prisma.userRole.upsert({
          where: { userId_roleId: { userId, roleId: role.id } },
          create: { userId, roleId: role.id },
          update: {},
        }),
      ),
    );
    return this.findById(userId);
  }

  async removeRole(userId: string, roleName: string) {
    const role = await this.prisma.role.findUnique({
      where: { name: roleName },
    });
    if (!role) throw new NotFoundException('Role not found');
    await this.prisma.userRole.delete({
      where: { userId_roleId: { userId, roleId: role.id } },
    });
    return this.findById(userId);
  }

  /**
   * Active sales consultants — the directory used by Team Availability and
   * the Leads Schedule. Not scope-filtered: any staff member who can open
   * those tabs needs the full consultant list to book against.
   */
  async consultants() {
    const users = await this.prisma.user.findMany({
      where: {
        isActive: true,
        roles: { some: { role: { name: 'sales_consultant' } } },
      },
      select: { id: true, name: true, email: true, region: true },
      orderBy: [{ name: 'asc' }, { email: 'asc' }],
    });
    return users;
  }

  /** Users the viewer may select in a dashboard scope-selector. */
  async selectable(visibleIds: string[] | 'all') {
    const where = visibleIds === 'all' ? {} : { id: { in: visibleIds } };
    const users = await this.prisma.user.findMany({
      where: { ...where, isActive: true },
      include: { roles: { include: { role: true } } },
      orderBy: { name: 'asc' },
    });
    return users.map((u) => ({
      id: u.id,
      name: u.name,
      roleKeys: u.roles.map((r) => r.role.name),
    }));
  }

  // ---- self-service profile ------------------------------------------------

  async updateProfile(
    userId: string,
    input: {
      name?: string;
      phones?: Array<{ label: string; number: string; isPrimary: boolean }>;
    },
  ) {
    await this.ensureExists(userId);
    const data: { name?: string; phones?: Prisma.InputJsonValue } = {};
    if (input.name !== undefined) data.name = input.name.trim();
    if (input.phones !== undefined) {
      // Normalise: at most one primary; first phone primary by default.
      const phones = input.phones
        .map((p) => ({
          label: ['mobile', 'work', 'home', 'other'].includes(p.label)
            ? p.label
            : 'mobile',
          number: p.number.trim(),
          isPrimary: !!p.isPrimary,
        }))
        .filter((p) => p.number.length > 0);
      let seenPrimary = false;
      for (const p of phones) {
        if (p.isPrimary && !seenPrimary) seenPrimary = true;
        else p.isPrimary = false;
      }
      if (phones.length > 0 && !seenPrimary) phones[0].isPrimary = true;
      data.phones = phones;
    }
    return this.prisma.user.update({ where: { id: userId }, data });
  }

  async updateAvatar(userId: string, avatarUrl: string) {
    await this.ensureExists(userId);
    return this.prisma.user.update({ where: { id: userId }, data: { avatarUrl } });
  }

  async changePassword(userId: string, currentPassword: string, newPassword: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    const ok = await bcrypt.compare(currentPassword, user.password);
    if (!ok) throw new BadRequestException('Current password is incorrect');
    const hashed = await bcrypt.hash(newPassword, 10);
    await this.prisma.user.update({
      where: { id: userId },
      // Drop the retained temp password — it's no longer valid once the user
      // sets their own — and invalidate other sessions.
      data: { password: hashed, refreshToken: null, welcomePassword: null },
    });
  }

  async setRefreshToken(userId: string, hashed: string | null) {
    await this.prisma.user.update({
      where: { id: userId },
      data: { refreshToken: hashed },
    });
  }

  /**
   * Active users indexed by lowercased name AND each lowercased alias, for
   * matching free-text setter/agent names (e.g. the Bloome sheet's `agent` /
   * lead-gen name) to a CRM user. Build once and reuse across a batch import.
   * A real name takes precedence over an alias on collision.
   */
  async nameAliasIndex(): Promise<Map<string, { id: string; name: string }>> {
    const users = await this.prisma.user.findMany({
      where: { isActive: true },
      select: { id: true, name: true, aliases: true },
    });
    const index = new Map<string, { id: string; name: string }>();
    // Aliases first, so canonical names override any alias collisions below.
    for (const u of users) {
      for (const alias of u.aliases) {
        const key = alias.trim().toLowerCase();
        if (key && !index.has(key)) index.set(key, { id: u.id, name: u.name });
      }
    }
    for (const u of users) {
      const key = u.name.trim().toLowerCase();
      if (key) index.set(key, { id: u.id, name: u.name });
    }
    return index;
  }

  /** Resolve a single free-text name to a user via exact name OR alias match. */
  async resolveByNameOrAlias(
    name?: string | null,
  ): Promise<{ id: string; name: string } | null> {
    const key = name?.trim().toLowerCase();
    if (!key) return null;
    const index = await this.nameAliasIndex();
    return index.get(key) ?? null;
  }

  private async resolveRoleConnect(roleNames: string[]) {
    if (roleNames.length === 0) return [];
    const roles = await this.prisma.role.findMany({
      where: { name: { in: roleNames } },
    });
    return roles.map((r) => ({ roleId: r.id }));
  }

  private async ensureExists(id: string) {
    const u = await this.prisma.user.findUnique({ where: { id } });
    if (!u) throw new NotFoundException('User not found');
  }
}

/** Trim, drop blanks and de-duplicate aliases (case-insensitive) while keeping
 *  the first-seen casing. */
function normaliseAliases(aliases: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of aliases) {
    const value = raw.trim();
    if (!value) continue;
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(value);
  }
  return out;
}
