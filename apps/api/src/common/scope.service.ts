import { Injectable } from '@nestjs/common';
import type { Prisma } from '../db';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthUser } from './auth-user';

/**
 * Stage 3 of the authorization pipeline: row-level visibility.
 *
 * Translates a user's resolved scope ('all' | 'team' | 'own') into a Prisma
 * WHERE fragment, applied to every list/read query. This is independent from
 * the coarse @RequirePermissions gate — a user can be allowed to hit a route
 * yet only see a subset of rows.
 *
 * 'team' resolves the manager's team members once and caches nothing (cheap,
 * indexed query). Built so an out-of-scope ?userId= can be intersected with
 * the user's own scope and never broaden it.
 */
@Injectable()
export class ScopeService {
  constructor(private readonly prisma: PrismaService) {}

  /** User ids the viewer is permitted to see (self + team if a manager). */
  async visibleUserIds(user: AuthUser): Promise<string[] | 'all'> {
    if (user.scope === 'all') return 'all';
    if (user.scope === 'own') return [user.id];

    // team scope: the team this user manages (managers) plus their own team.
    const managed = await this.prisma.team.findUnique({
      where: { managerId: user.id },
      select: { members: { select: { id: true } } },
    });
    const ids = new Set<string>([user.id]);
    managed?.members.forEach((m) => ids.add(m.id));
    if (user.teamId) {
      const team = await this.prisma.team.findUnique({
        where: { id: user.teamId },
        select: { members: { select: { id: true } } },
      });
      team?.members.forEach((m) => ids.add(m.id));
    }
    return [...ids];
  }

  /**
   * Resolve the effective set of user ids to filter by, honouring an optional
   * scope-selector `requestedUserId`. The requested id is INTERSECTED with the
   * viewer's scope: it can only narrow, never broaden. Throws nothing — an
   * out-of-scope id simply yields an empty set (caller decides to 403/empty).
   */
  async resolveTargetUserIds(
    user: AuthUser,
    requestedUserId?: string,
  ): Promise<{ ids: string[] | 'all'; outOfScope: boolean }> {
    const visible = await this.visibleUserIds(user);
    if (!requestedUserId) return { ids: visible, outOfScope: false };

    if (visible === 'all') return { ids: [requestedUserId], outOfScope: false };
    if (visible.includes(requestedUserId)) {
      return { ids: [requestedUserId], outOfScope: false };
    }
    return { ids: [], outOfScope: true };
  }

  /** WHERE fragment for Lead lists (owner or current consultant). */
  async leadWhere(
    user: AuthUser,
    requestedUserId?: string,
  ): Promise<Prisma.LeadWhereInput> {
    const { ids } = await this.resolveTargetUserIds(user, requestedUserId);
    if (ids === 'all') return {};
    return {
      OR: [
        { leadGenId: { in: ids } },
        { consultantId: { in: ids } },
      ],
    };
  }

  /** WHERE fragment for Sale lists (owning consultant). */
  async saleWhere(
    user: AuthUser,
    requestedUserId?: string,
  ): Promise<Prisma.SaleWhereInput> {
    const { ids } = await this.resolveTargetUserIds(user, requestedUserId);
    if (ids === 'all') return {};
    return { ownerId: { in: ids } };
  }

  /** WHERE fragment for Installation lists (assigned installer). */
  async installationWhere(
    user: AuthUser,
    requestedUserId?: string,
  ): Promise<Prisma.InstallationWhereInput> {
    const { ids } = await this.resolveTargetUserIds(user, requestedUserId);
    if (ids === 'all') return {};
    return { installerId: { in: ids } };
  }
}
