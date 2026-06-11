import { Injectable, NotFoundException } from '@nestjs/common';
import { SaleStatus } from '@astra/shared';
import { PrismaService } from '../prisma/prisma.service';
import { ScopeService } from '../common/scope.service';
import { AuditService } from '../common/audit.service';
import { SaleHistoryService } from '../history/sale-history.service';
import { assertOwnership } from '../common/ownership';
import type { AuthUser } from '../common/auth-user';
import type {
  AddExtraDto,
  UpdateSaleCoreDto,
  UpdateSaleStatusDto,
  UpdateStatusDetailsDto,
  UpdateSystemDetailsDto,
} from './dto';

@Injectable()
export class SalesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scope: ScopeService,
    private readonly audit: AuditService,
    private readonly history: SaleHistoryService,
  ) {}

  async list(user: AuthUser, userId?: string) {
    const where = await this.scope.saleWhere(user, userId);
    return this.prisma.sale.findMany({
      where,
      orderBy: [
        { sortOrder: { sort: 'asc', nulls: 'last' } },
        { saleDate: 'desc' },
      ],
      take: 200,
      include: {
        contact: true,
        owner: { select: { id: true, name: true } },
        statusDetails: true,
      },
    });
  }

  /**
   * Persist a drag-and-drop row order: each id gets its array index as
   * `sortOrder`. Ids outside the caller's visibility scope are ignored.
   */
  async reorder(user: AuthUser, ids: string[]) {
    const where = await this.scope.saleWhere(user);
    const visible = await this.prisma.sale.findMany({
      where: { ...where, id: { in: ids } },
      select: { id: true },
    });
    const allowed = new Set(visible.map((s) => s.id));
    await this.prisma.$transaction(
      ids
        .filter((id) => allowed.has(id))
        .map((id, index) =>
          this.prisma.sale.update({
            where: { id },
            data: { sortOrder: index },
          }),
        ),
    );
    return { ok: true };
  }

  async get(id: string) {
    const sale = await this.prisma.sale.findUnique({
      where: { id },
      include: {
        contact: true,
        owner: { select: { id: true, name: true } },
        systemDetails: true,
        statusDetails: true,
        installation: true,
        paymentDetails: true,
        commissioningDetails: true,
        extras: true,
        finance: true,
        postInstall: true,
        stageHistory: { orderBy: { changedAt: 'desc' } },
        salesLog: { orderBy: { changedAt: 'desc' }, take: 50 },
      },
    });
    if (!sale) throw new NotFoundException('Sale not found');
    return sale;
  }

  /** Owner-only: change lifecycle status (records SaleStageHistory). */
  async updateStatus(user: AuthUser, id: string, dto: UpdateSaleStatusDto) {
    const sale = await this.getOwned(user, id);
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.sale.update({
        where: { id },
        data: { status: dto.status, closedAt: dto.status === SaleStatus.COMPLETED ? new Date() : sale.closedAt },
      });
      await this.history.recordStageChange(tx, id, dto.status, user.id, sale.status);
      await this.audit.record(
        { userId: user.id, action: 'SALE_STATUS_CHANGED', entity: 'Sale', entityId: id, metadata: { status: dto.status } },
        tx,
      );
      return updated;
    });
  }

  /** Owner-only: edit core sale fields (records SaleLog). */
  async updateCore(user: AuthUser, id: string, dto: UpdateSaleCoreDto) {
    const sale = await this.getOwned(user, id);
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.sale.update({ where: { id }, data: dto });
      const changes = Object.keys(dto).map((field) => ({
        section: 'core',
        field,
        oldValue: stringify((sale as any)[field]),
        newValue: stringify((dto as any)[field]),
      }));
      await this.history.recordFieldChanges(tx, id, changes, user.id);
      return updated;
    });
  }

  /**
   * Owner-only: system spec. Selecting a catalogue product copies its spec/price
   * into the sale as a POINT-OF-SALE SNAPSHOT — later catalogue edits never
   * rewrite this sale.
   */
  async updateSystemDetails(user: AuthUser, id: string, dto: UpdateSystemDetailsDto) {
    await this.getOwned(user, id);

    const snapshot: Record<string, unknown> = { ...dto };

    if (dto.batteryProductId) {
      const p = await this.prisma.product.findUnique({ where: { id: dto.batteryProductId } });
      if (p) {
        snapshot.batteryBrand = p.name;
        snapshot.batteryModel = p.model;
        snapshot.batterySTC = p.stc;
        snapshot.batteryModules = p.batteryModules;
        snapshot.batterySize = p.batterySize;
        snapshot.batteryRRP = p.rrp;
        snapshot.batteryCommission = p.commission;
      }
    }
    if (dto.panelProductId) {
      const p = await this.prisma.product.findUnique({ where: { id: dto.panelProductId } });
      if (p) {
        snapshot.panelModel = p.model;
        snapshot.panelWatt = p.panelWatt;
        snapshot.solarRRP = p.rrp;
        snapshot.solarSTC = p.stc;
        snapshot.solarCommission = p.commission;
      }
    }
    if (dto.inverterProductId) {
      const p = await this.prisma.product.findUnique({ where: { id: dto.inverterProductId } });
      if (p) {
        snapshot.inverterModel = p.model;
        snapshot.inverterType = p.inverterType;
        snapshot.optimisers = p.optimisers;
      }
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.systemDetails.upsert({
        where: { saleId: id },
        create: { saleId: id, ...(snapshot as any) },
        update: snapshot as any,
      });
      await this.history.recordFieldChanges(
        tx,
        id,
        Object.keys(snapshot).map((field) => ({ section: 'systemDetails', field, newValue: stringify(snapshot[field]) })),
        user.id,
      );
      return updated;
    });
  }

  /** Owner-only: the 7 independent stage statuses. */
  async updateStatusDetails(user: AuthUser, id: string, dto: UpdateStatusDetailsDto) {
    await this.getOwned(user, id);
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.saleStatusDetails.upsert({
        where: { saleId: id },
        create: { saleId: id, ...dto },
        update: dto,
      });
      await this.history.recordFieldChanges(
        tx,
        id,
        Object.keys(dto).map((field) => ({ section: 'statusDetails', field, newValue: stringify((dto as any)[field]) })),
        user.id,
      );
      return updated;
    });
  }

  async addExtra(user: AuthUser, id: string, dto: AddExtraDto) {
    await this.getOwned(user, id);
    return this.prisma.saleExtra.create({ data: { saleId: id, ...dto } });
  }

  // ---- helpers ----

  private async getOwned(user: AuthUser, id: string) {
    const sale = await this.prisma.sale.findUnique({ where: { id } });
    if (!sale) throw new NotFoundException('Sale not found');
    assertOwnership(user, sale.ownerId); // owner-only (break-glass: super admin)
    return sale;
  }
}

function stringify(v: unknown): string | null {
  if (v == null) return null;
  return String(v);
}
