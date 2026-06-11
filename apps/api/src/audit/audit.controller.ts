import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { PERMISSIONS } from '@astra/shared';
import { PrismaService } from '../prisma/prisma.service';
import { RequirePermissions } from '../common/decorators';

/**
 * Read access to the system-wide audit trail. Org-wide visibility, so gated by
 * records:read:all (super admin, CEO, finance, ops). Writes happen via
 * AuditService / AuditInterceptor elsewhere.
 */
@ApiTags('audit')
@Controller('audit')
export class AuditController {
  constructor(private readonly prisma: PrismaService) {}

  @RequirePermissions(PERMISSIONS.RECORDS_READ_ALL)
  @Get()
  async list(
    @Query('entity') entity?: string,
    @Query('action') action?: string,
    @Query('take') take = '100',
  ) {
    const rows = await this.prisma.auditLog.findMany({
      where: { entity: entity || undefined, action: action || undefined },
      orderBy: { createdAt: 'desc' },
      take: Math.min(Number(take) || 100, 500),
    });

    // Resolve actor names for display.
    const userIds = [...new Set(rows.map((r) => r.userId))];
    const users = await this.prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, name: true, email: true },
    });
    const byId = new Map(users.map((u) => [u.id, u]));
    return rows.map((r) => ({
      ...r,
      actorName: byId.get(r.userId)?.name ?? null,
      actorEmail: byId.get(r.userId)?.email ?? null,
    }));
  }
}
