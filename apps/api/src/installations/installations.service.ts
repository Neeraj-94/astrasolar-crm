import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InstallationStatus, PERMISSIONS } from '@astra/shared';
import { PrismaService } from '../prisma/prisma.service';
import { ScopeService } from '../common/scope.service';
import { AuditService } from '../common/audit.service';
import type { AuthUser } from '../common/auth-user';
import type { AssignInstallerDto, UpdateInstallationDto } from './dto';

@Injectable()
export class InstallationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scope: ScopeService,
    private readonly audit: AuditService,
  ) {}

  async list(user: AuthUser, userId?: string) {
    const where = await this.scope.installationWhere(user, userId);
    return this.prisma.installation.findMany({
      where,
      orderBy: [
        { sortOrder: { sort: 'asc', nulls: 'last' } },
        { scheduledAt: 'asc' },
      ],
      include: {
        installer: { select: { id: true, name: true } },
        // systemDetails powers the Operations Manager "Stock" tab (weekly
        // panel / inverter / battery requirements per booked install).
        sale: {
          include: {
            lead: { select: { firstName: true, surName: true } },
            systemDetails: true,
          },
        },
      },
    });
  }

  /**
   * Persist a drag-and-drop row order: each id gets its array index as
   * `sortOrder`. Ids outside the caller's visibility scope are ignored.
   */
  async reorder(user: AuthUser, ids: string[]) {
    const where = await this.scope.installationWhere(user);
    const visible = await this.prisma.installation.findMany({
      where: { ...where, id: { in: ids } },
      select: { id: true },
    });
    const allowed = new Set(visible.map((i) => i.id));
    await this.prisma.$transaction(
      ids
        .filter((id) => allowed.has(id))
        .map((id, index) =>
          this.prisma.installation.update({
            where: { id },
            data: { sortOrder: index },
          }),
        ),
    );
    return { ok: true };
  }

  /**
   * Documents attached to the sales behind the installer's own jobs. Documents
   * are stored against the Sale (entity 'Sale'), so we gather the installer's
   * in-scope installations, map to their sale ids, and list those documents.
   */
  async documents(user: AuthUser, userId?: string) {
    const where = await this.scope.installationWhere(user, userId);
    const installs = await this.prisma.installation.findMany({
      where,
      select: {
        saleId: true,
        sale: {
          select: {
            saleRef: true,
            lead: { select: { firstName: true, surName: true } },
          },
        },
      },
    });
    const saleIds = installs.map((i) => i.saleId);
    const saleMeta = new Map(
      installs.map((i) => [
        i.saleId,
        {
          saleRef: i.sale.saleRef,
          customerName:
            `${i.sale.lead?.firstName ?? ''} ${i.sale.lead?.surName ?? ''}`.trim(),
        },
      ]),
    );

    if (saleIds.length === 0) return [];

    const docs = await this.prisma.document.findMany({
      where: { entity: 'Sale', entityId: { in: saleIds } },
      orderBy: { createdAt: 'desc' },
    });

    return docs.map((d) => ({
      id: d.id,
      fileName: d.fileName,
      contentType: d.contentType,
      sizeBytes: d.sizeBytes,
      createdAt: d.createdAt,
      saleId: d.entityId,
      saleRef: saleMeta.get(d.entityId)?.saleRef ?? null,
      customerName: saleMeta.get(d.entityId)?.customerName ?? null,
    }));
  }

  async get(id: string) {
    const inst = await this.prisma.installation.findUnique({
      where: { id },
      include: {
        installer: true,
        sale: {
          include: {
            lead: { select: { firstName: true, surName: true } },
          },
        },
      },
    });
    if (!inst) throw new NotFoundException('Installation not found');
    return inst;
  }

  /** Ops assigns an installer to a sale (creates the Installation row). */
  async assign(user: AuthUser, saleId: string, dto: AssignInstallerDto) {
    const inst = await this.prisma.installation.upsert({
      where: { saleId },
      create: {
        saleId,
        installerId: dto.installerId,
        scheduledAt: dto.scheduledAt ? new Date(dto.scheduledAt) : undefined,
        status: InstallationStatus.SCHEDULED,
      },
      update: {
        installerId: dto.installerId,
        scheduledAt: dto.scheduledAt ? new Date(dto.scheduledAt) : undefined,
      },
    });
    await this.audit.record({
      userId: user.id,
      action: 'INSTALL_ASSIGNED',
      entity: 'Installation',
      entityId: inst.id,
      metadata: { installerId: dto.installerId },
    });
    return inst;
  }

  /** Installer updates their own installation (installs:write:own + ownership). */
  async update(user: AuthUser, id: string, dto: UpdateInstallationDto) {
    const inst = await this.get(id);
    const isOwnInstaller = inst.installerId === user.id;
    const canManage = user.permissions.has(PERMISSIONS.SYSTEM_ADMIN) ||
      user.permissions.has(PERMISSIONS.RECORDS_READ_ALL); // ops oversight
    if (!isOwnInstaller && !canManage) {
      throw new ForbiddenException('Not your installation');
    }
    const updated = await this.prisma.installation.update({
      where: { id },
      data: {
        status: dto.status,
        installDate: dto.installDate ? new Date(dto.installDate) : undefined,
        scheduledAt: dto.scheduledAt ? new Date(dto.scheduledAt) : undefined,
        completedAt: dto.completedAt ? new Date(dto.completedAt) : undefined,
        notes: dto.notes,
        postInstallNotes: dto.postInstallNotes,
      },
    });
    await this.audit.record({
      userId: user.id,
      action: 'INSTALL_UPDATED',
      entity: 'Installation',
      entityId: id,
      metadata: { status: dto.status },
    });
    return updated;
  }
}
