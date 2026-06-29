import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  Company,
  LeadSource,
  LeadStage,
  SalesDisposition,
  SaleStatus,
  SaleType,
  StageState,
  SystemType,
} from '@astra/shared';
import { PrismaService } from '../prisma/prisma.service';
import { ScopeService } from '../common/scope.service';
import { AuditService } from '../common/audit.service';
import { SaleHistoryService } from '../history/sale-history.service';
import { assertOwnership } from '../common/ownership';
import type { AuthUser } from '../common/auth-user';
import type {
  AddExtraDto,
  CreateSaleFormDto,
  UpdatePaymentDetailsDto,
  UpdateSaleCoreDto,
  UpdateSaleStatusDto,
  UpdateStatusDetailsDto,
  UpdateSystemDetailsDto,
} from './dto';

// ---------------------------------------------------------------------------
// Sales Form (astrasolar-app port) — map raw form strings to v2 enums/records.
// ---------------------------------------------------------------------------
function mapCompany(v?: string): Company {
  return (v ?? '').toUpperCase().includes('DC') ? Company.DC : Company.ASTRA;
}

function mapLeadSource(v?: string): LeadSource {
  if (v && (Object.values(LeadSource) as string[]).includes(v)) {
    return v as LeadSource;
  }
  switch ((v ?? '').toLowerCase()) {
    case 'bloom astra':
      return LeadSource.BLOOM_ASTRA;
    case 'brighte':
      return LeadSource.BRIGHTE;
    case 'referral':
      return LeadSource.REFERRAL;
    case 'astra web':
      return LeadSource.WEBSITE;
    case 'inbound':
      return LeadSource.INBOUND;
    default:
      return LeadSource.INBOUND;
  }
}

function mapSaleType(v?: string): SaleType | undefined {
  if (!v) return undefined;
  if ((Object.values(SaleType) as string[]).includes(v)) return v as SaleType;
  const s = v.toLowerCase();
  const solar = s.includes('solar');
  const battery = s.includes('battery');
  if (solar && battery) return SaleType.SOLAR_BATTERY;
  if (battery) return SaleType.BATTERY_ONLY;
  if (solar) return SaleType.SOLAR_ONLY;
  return undefined;
}

function mapSystemType(v?: string): SystemType | undefined {
  if (!v) return undefined;
  if ((Object.values(SystemType) as string[]).includes(v)) {
    return v as SystemType;
  }
  switch (v.toLowerCase()) {
    case 'new':
      return SystemType.NEW;
    case 'replacement':
      return SystemType.REPLACEMENT;
    case 'additional':
      return SystemType.ADDITIONAL;
    case 'additional + replacement':
      return SystemType.ADDITIONAL_REPLACEMENT;
    default:
      return undefined;
  }
}

function parseStoreys(v?: string): number | undefined {
  if (!v) return undefined;
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : undefined;
}

function parseKwh(label?: string): number | undefined {
  if (!label) return undefined;
  const m = label.match(/([\d.]+)\s*kwh/i);
  return m ? Number(m[1]) : undefined;
}

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
        lead: { include: { leadGen: { select: { id: true, name: true } } } },
        owner: { select: { id: true, name: true } },
        statusDetails: true,
        systemDetails: true,
        installation: true,
        paymentDetails: true,
        finance: true,
      },
    });
  }

  /**
   * Create a Sale from the "Generate Sales Form" wizard. Because a Sale is 1:1
   * with a Lead in v2, this also creates the backing Lead (CONVERTED / SOLD,
   * owned by the submitting consultant) and the system / finance / payment
   * detail records, all in one transaction.
   */
  async createFromForm(user: AuthUser, dto: CreateSaleFormDto) {
    const company = mapCompany(dto.company);
    const consultantId = dto.consultantId || user.id;
    const leadGenId = dto.leadGenId || user.id;
    const saleDate = dto.saleDate ? new Date(dto.saleDate) : new Date();
    const address =
      [dto.address, dto.suburb].filter(Boolean).join(', ') || undefined;
    const financeLegs = (dto.financeOptions ?? [])
      .filter((f) => f && f.toLowerCase() !== 'cash')
      .map((lender) => ({ lender, status: StageState.PENDING }));

    // Resolve selected catalogue extras → SaleExtra rows (price snapshot).
    const extraProducts = dto.extraIds?.length
      ? await this.prisma.extraProduct.findMany({
          where: { id: { in: dto.extraIds } },
        })
      : [];
    const extrasCreate = extraProducts.map((e) => ({
      itemName: e.itemName,
      itemRef: e.id,
      itemPrice: e.unitPrice ?? 0,
      profit: undefined,
    }));

    return this.prisma.$transaction(async (tx) => {
      const lead = await tx.lead.create({
        data: {
          firstName: dto.firstName,
          surName: dto.surName,
          phone: dto.phone || null,
          email: dto.email || null,
          address: address ?? null,
          postCode: dto.postcode || null,
          state: dto.state || null,
          company,
          source: mapLeadSource(dto.leadSource),
          leadGenId,
          consultantId,
          stage: LeadStage.CONVERTED,
          disposition: SalesDisposition.SOLD,
          convertedAt: new Date(),
        },
      });

      const year = new Date().getFullYear();
      const count = await tx.sale.count();
      const saleRef = `S-${year}-${String(count + 1).padStart(4, '0')}`;
      const sale = await tx.sale.create({
        data: {
          saleRef,
          leadId: lead.id,
          ownerId: consultantId,
          company,
          status: SaleStatus.NEGOTIATION,
          saleType: mapSaleType(dto.saleType),
          systemType: mapSystemType(dto.systemType),
          energyProvider: dto.energyProvider || undefined,
          referral: dto.referral || undefined,
          soldPrice: dto.soldPrice ?? undefined,
          saleDate,
          installNotes: dto.installNotes || undefined,
          statusDetails: { create: {} },
          systemDetails: {
            create: {
              panelModel: dto.panelModel || undefined,
              numPanels: dto.numPanels ?? undefined,
              systemSize: dto.systemSize ?? undefined,
              solarSTC: dto.solarStc ?? undefined,
              batterySTC: dto.batteryStc ?? undefined,
              tilts: dto.tilts ?? undefined,
              optimisers:
                dto.optimisers != null ? dto.optimisers > 0 : undefined,
              roofType: dto.roofType || undefined,
              storeys: parseStoreys(dto.storeys),
              switchboard: dto.switchboard || undefined,
              nmi: dto.nmi || undefined,
              phase: dto.phase || undefined,
              inverterModel: dto.inverter || undefined,
              batteryModel: dto.batteryBrand || undefined,
              batterySize: parseKwh(dto.batteryBrand) ?? undefined,
            },
          },
          paymentDetails: {
            create: {
              paymentNotes: financeLegs.length
                ? `Finance: ${financeLegs.map((f) => f.lender).join(', ')}`
                : 'Cash',
            },
          },
          ...(financeLegs.length ? { finance: { create: financeLegs } } : {}),
          ...(extrasCreate.length ? { extras: { create: extrasCreate } } : {}),
        },
        include: { lead: true },
      });

      await tx.saleStageHistory.create({
        data: {
          saleId: sale.id,
          toStage: SaleStatus.NEGOTIATION,
          changedBy: user.id,
        },
      });
      await this.audit.record(
        {
          userId: user.id,
          action: 'SALE_CREATED',
          entity: 'Sale',
          entityId: sale.id,
          metadata: { via: 'sales-form', leadId: lead.id },
        },
        tx,
      );
      return sale;
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
  /** Owner-only: payment date + finance notes (Sale Details modal). */
  async updatePaymentDetails(
    user: AuthUser,
    id: string,
    dto: UpdatePaymentDetailsDto,
  ) {
    await this.getOwned(user, id);
    const data: { paymentNotes?: string; paymentDate?: Date | null } = {};
    if (dto.paymentNotes !== undefined) data.paymentNotes = dto.paymentNotes;
    if (dto.paymentDate !== undefined) {
      data.paymentDate = dto.paymentDate ? new Date(dto.paymentDate) : null;
    }
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.paymentDetails.upsert({
        where: { saleId: id },
        create: { saleId: id, ...data },
        update: data,
      });
      await this.history.recordFieldChanges(
        tx,
        id,
        Object.keys(data).map((field) => ({
          section: 'paymentDetails',
          field,
          newValue: stringify((data as any)[field]),
        })),
        user.id,
      );
      return updated;
    });
  }

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
