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
        roles: { create: roleConnect },
      },
      include: USER_WITH_ROLES,
    });

    // Email the new user their credentials (best-effort — never blocks
    // creation). `emailSent` lets the admin UI warn if delivery was skipped.
    const emailSent = await this.mail.sendWelcomeEmail({
      to: user.email,
      name: user.name,
      password: input.password,
    });

    return { ...user, emailSent };
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
      isActive: u.isActive,
      teamId: u.teamId,
      roleKeys: u.roles.map((r) => r.role.name),
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
    input: { name?: string; email?: string; password?: string; teamId?: string },
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
    } = {};
    if (input.name !== undefined) data.name = input.name;
    if (input.email !== undefined) data.email = input.email;
    if (input.teamId !== undefined) data.teamId = input.teamId;
    if (input.password) data.password = await bcrypt.hash(input.password, 10);

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

  async setRefreshToken(userId: string, hashed: string | null) {
    await this.prisma.user.update({
      where: { id: userId },
      data: { refreshToken: hashed },
    });
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
