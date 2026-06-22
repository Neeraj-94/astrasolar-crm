import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
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
        lead: true,
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
        lead: true,
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
   *
   * Battery RRP is CONTEXT-DEPENDENT: a battery sold as part of a solar+battery
   * deal (saleType = SOLAR_BATTERY) is priced from its SOLAR_BATTERY context row;
   * otherwise from its BATTERY_ONLY row (see BatteryContextPrice). All other
   * battery commercials (commission/STC/etc.) come straight off the product.
   */
  async updateSystemDetails(user: AuthUser, id: string, dto: UpdateSystemDetailsDto) {
    const sale = await this.getOwned(user, id);

    // Sale context drives which battery RRP applies.
    const context =
      sale.saleType === 'SOLAR_BATTERY' ? 'SOLAR_BATTERY' : 'BATTERY_ONLY';

    // Product ids are inputs, not SystemDetails columns — keep them out of the snapshot.
    const { batteryProductId, panelProductId, inverterProductId, ...rest } = dto;
    const snapshot: Record<string, unknown> = { ...rest };

    // A battery may only be paired with a compatible inverter (allow-list). The
    // pairing also carries the combo's context price: gross/RRP vary by inverter
    // AND context, so prefer the combo price over the legacy per-battery price.
    const combo =
      batteryProductId && inverterProductId
        ? await this.prisma.batteryInverterCompat.findUnique({
            where: {
              inverterId_batteryId: {
                inverterId: inverterProductId,
                batteryId: batteryProductId,
              },
            },
            include: { comboPrices: { where: { context } } },
          })
        : null;
    if (batteryProductId && inverterProductId && (!combo || !combo.isActive)) {
      throw new BadRequestException(
        'Selected battery is not compatible with the selected inverter',
      );
    }

    if (batteryProductId) {
      const b = await this.prisma.batteryProduct.findUnique({
        where: { id: batteryProductId },
        include: { contextPrices: { where: { context } } },
      });
      if (b) {
        snapshot.batteryBrand = b.brand;
        snapshot.batteryModel = b.batteryModel;
        // SystemDetails.batterySTC is Int; product STC is Decimal — round for the snapshot.
        snapshot.batterySTC =
          b.batteryStc != null ? Math.round(Number(b.batteryStc)) : null;
        snapshot.batteryModules = b.modules;
        snapshot.batterySize = b.batterySize;
        // Context-aware RRP. Prefer the inverter+battery combo price; fall back
        // to the legacy per-battery context price; else null (not offered here).
        snapshot.batteryRRP =
          combo?.comboPrices[0]?.batteryRrp ??
          b.contextPrices[0]?.batteryRrp ??
          null;
        snapshot.batteryCommission = b.batteryCommission;
        snapshot.batteryProfit = b.profit; // POS profit snapshot (for financials)
      }
    }
    if (panelProductId) {
      const s = await this.prisma.solarProduct.findUnique({
        where: { id: panelProductId },
      });
      if (s) {
        snapshot.panelModel = s.panelModel;
        snapshot.panelWatt = s.panelWatt;
        snapshot.solarRRP = s.solarRrp;
        snapshot.solarCommission = s.solarCommission;
        snapshot.solarProfit = s.profit; // POS profit snapshot (for financials)
        // SystemDetails.solarSTC is Int; product STC is Decimal — round for the snapshot.
        snapshot.solarSTC =
          s.solarStc != null ? Math.round(Number(s.solarStc)) : null;
        // Use the product's system size unless the caller supplied one.
        if (s.systemSize != null && rest.systemSize == null) {
          snapshot.systemSize = s.systemSize;
        }
      }
    }
    if (inverterProductId) {
      const inv = await this.prisma.inverterProduct.findUnique({
        where: { id: inverterProductId },
      });
      if (inv) {
        snapshot.inverterModel = inv.inverterModel;
        snapshot.inverterType = inv.type;
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
    // productId selects a catalogue extra; it is NOT a SaleExtra column.
    const { productId, ...rest } = dto;
    const data: {
      saleId: string;
      itemName: string;
      itemPrice: number;
      itemRef?: string | null;
    } = { saleId: id, ...rest };

    if (productId) {
      const ex = await this.prisma.extraProduct.findUnique({
        where: { id: productId },
      });
      if (ex) {
        // Snapshot from the catalogue (caller values win when provided).
        if (!data.itemName) data.itemName = ex.itemName;
        if (data.itemPrice == null && ex.unitPrice != null) {
          data.itemPrice = Number(ex.unitPrice);
        }
        data.itemRef = data.itemRef ?? productId;
      }
    }

    return this.prisma.saleExtra.create({ data });
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
