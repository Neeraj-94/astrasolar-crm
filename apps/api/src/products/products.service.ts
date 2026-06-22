import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  ProductHistoryService,
  type FieldChange,
} from '../history/product-history.service';
import type {
  BatteryPriceInput,
  CatalogueInput,
  ComboPriceInput,
  CompatInput,
} from './dto';

type Catalogue = 'solar' | 'battery' | 'inverter' | 'extras';

interface CatalogueConfig {
  /** Prisma model delegate name. */
  key: string;
  /** Whether the model has the ACTIVE/DISCONTINUED/ARCHIVED status field. */
  hasStatus: boolean;
  /** Required name field. */
  nameField: string;
  /** Whitelisted writable fields (also the diff set for history). */
  fields: string[];
  /** ProductHistoryService method that writes this catalogue's log. */
  record: 'recordSolar' | 'recordBattery' | 'recordInverter' | 'recordExtra';
}

const CATALOGUES: Record<Catalogue, CatalogueConfig> = {
  solar: {
    key: 'solarProduct',
    hasStatus: true,
    nameField: 'productName',
    fields: [
      'productName',
      'brand',
      'panelModel',
      'panelWatt',
      'systemSize',
      'solarStc',
      'states',
      'status',
      'solarRrp',
      'solarCommission',
      'profit',
      'effectiveDate',
      'notes',
    ],
    record: 'recordSolar',
  },
  inverter: {
    key: 'inverterProduct',
    hasStatus: true,
    nameField: 'productName',
    fields: [
      'productName',
      'brand',
      'inverterModel',
      'type',
      'phase',
      'systemSize',
      'maxPVArray',
      'mppt',
      'strings',
      'notes',
      'states',
      'status',
    ],
    record: 'recordInverter',
  },
  battery: {
    key: 'batteryProduct',
    hasStatus: true,
    nameField: 'productName',
    fields: [
      'productName',
      'brand',
      'batteryModel',
      'batterySize',
      'modules',
      'batteryStc',
      'phase',
      'states',
      'status',
      'grossPrice',
      'batteryCommission',
      'profit',
      'effectiveDate',
      'notes',
    ],
    record: 'recordBattery',
  },
  extras: {
    key: 'extraProduct',
    hasStatus: false,
    nameField: 'itemName',
    fields: ['itemName', 'category', 'unit', 'unitPrice', 'notes'],
    record: 'recordExtra',
  },
};

const STATUS_ACTIONS: Record<string, string> = {
  discontinue: 'DISCONTINUED',
  archive: 'ARCHIVED',
  reactivate: 'ACTIVE',
};

@Injectable()
export class ProductsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly history: ProductHistoryService,
  ) {}

  // ---- generic catalogue CRUD (dispatched by type) ------------------------

  list(type: string, all: boolean) {
    const c = this.cfg(type);
    const where = c.hasStatus && !all ? { status: 'ACTIVE' } : {};
    return this.model(c.key).findMany({
      where,
      orderBy: [
        { sortOrder: { sort: 'asc', nulls: 'last' } },
        { createdAt: 'asc' },
      ],
    });
  }

  async get(type: string, id: string) {
    const c = this.cfg(type);
    const row = await this.model(c.key).findUnique({
      where: { id },
      include: { logs: { orderBy: { changedAt: 'desc' }, take: 50 } },
    });
    if (!row) throw new NotFoundException('Product not found');
    return row;
  }

  create(type: string, dto: CatalogueInput) {
    const c = this.cfg(type);
    const data = this.buildData(c, dto);
    if (!data[c.nameField]) {
      throw new BadRequestException(`${c.nameField} is required`);
    }
    if (c.key === 'solarProduct') {
      const n = this.solarPanels(data.systemSize, data.panelWatt);
      if (n !== undefined) data.numOfPanels = n;
    }
    return this.model(c.key).create({ data });
  }

  async update(
    type: string,
    id: string,
    dto: CatalogueInput,
    changedBy: string,
  ) {
    const c = this.cfg(type);
    const existing = await this.model(c.key).findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Product not found');
    const data = this.buildData(c, dto);
    if (c.key === 'solarProduct') {
      const n = this.solarPanels(
        data.systemSize ?? existing.systemSize,
        data.panelWatt ?? existing.panelWatt,
      );
      if (n !== undefined) data.numOfPanels = n;
    }
    return this.prisma.$transaction(async (tx) => {
      const updated = await this.model(c.key, tx).update({
        where: { id },
        data,
      });
      const changes = this.diff(existing, updated, c.fields);
      const eff =
        data.effectiveDate instanceof Date ? data.effectiveDate : new Date();
      await this.history[c.record](tx, id, changes, changedBy, eff);
      return updated;
    });
  }

  /** Map a status action (discontinue/archive/reactivate) to a status. */
  statusAction(type: string, id: string, action: string, changedBy: string) {
    const status = STATUS_ACTIONS[action];
    if (!status) throw new BadRequestException(`Unknown action: ${action}`);
    return this.setStatus(type, id, status, changedBy);
  }

  /** Hard delete — only for catalogues without a status (extras). */
  async remove(type: string, id: string) {
    const c = this.cfg(type);
    if (c.hasStatus) {
      throw new BadRequestException(`Use archive for ${type}, not delete`);
    }
    await this.model(c.key).delete({ where: { id } });
    return { ok: true };
  }

  async reorder(type: string, ids: string[]) {
    const c = this.cfg(type);
    const existing = await this.model(c.key).findMany({
      where: { id: { in: ids } },
      select: { id: true },
    });
    const known = new Set(existing.map((p: { id: string }) => p.id));
    await this.prisma.$transaction(
      ids
        .filter((id) => known.has(id))
        .map((id, index) =>
          this.model(c.key).update({
            where: { id },
            data: { sortOrder: index },
          }),
        ),
    );
    return { ok: true };
  }

  // ---- battery context pricing -------------------------------------------

  listBatteryPrices(batteryId: string) {
    return this.prisma.batteryContextPrice.findMany({
      where: { batteryId },
      orderBy: { context: 'asc' },
    });
  }

  async upsertBatteryPrice(
    batteryId: string,
    dto: BatteryPriceInput,
    changedBy: string,
  ) {
    if (!dto?.context) throw new BadRequestException('context is required');
    const eff = dto.effectiveDate ? new Date(dto.effectiveDate) : null;
    const rrp = dto.batteryRrp ?? null;
    const existing = await this.prisma.batteryContextPrice.findUnique({
      where: { batteryId_context: { batteryId, context: dto.context } },
    });
    return this.prisma.$transaction(async (tx) => {
      const row = await tx.batteryContextPrice.upsert({
        where: { batteryId_context: { batteryId, context: dto.context } },
        create: {
          batteryId,
          context: dto.context,
          batteryRrp: rrp,
          effectiveDate: eff,
        },
        update: { batteryRrp: rrp, effectiveDate: eff },
      });
      const changes = this.diff(existing ?? {}, row, [
        'batteryRrp',
        'effectiveDate',
      ]);
      await this.history.recordBatteryContextPrice(
        tx,
        row.id,
        changes,
        changedBy,
        eff ?? new Date(),
      );
      return row;
    });
  }

  // ---- battery combo (inverter+battery) context pricing ------------------

  /**
   * Aggregate priced-battery matrix for the price calculator. Returns every
   * ACTIVE battery with its active inverter pairings (combos) and per-context
   * RRP, plus battery-level context prices as a fallback. One query — the
   * client builds the phase → inverter → battery → RRP cascade from this.
   */
  async pricedBatteries() {
    const numOrNull = (v: unknown) => (v == null ? null : Number(v));
    const rows = await this.prisma.batteryProduct.findMany({
      where: { status: 'ACTIVE' },
      include: {
        contextPrices: true,
        compatibleInverters: {
          where: { isActive: true },
          include: {
            inverter: {
              select: {
                id: true,
                productName: true,
                inverterModel: true,
                phase: true,
                status: true,
              },
            },
            comboPrices: true,
          },
        },
      },
      orderBy: [
        { sortOrder: { sort: 'asc', nulls: 'last' } },
        { createdAt: 'asc' },
      ],
    });

    return rows.map((b) => ({
      id: b.id,
      productName: b.productName,
      brand: b.brand,
      batteryModel: b.batteryModel,
      batterySize: numOrNull(b.batterySize),
      modules: b.modules,
      batteryStc: numOrNull(b.batteryStc),
      phase: b.phase,
      states: b.states,
      batteryCommission: numOrNull(b.batteryCommission),
      grossPrice: numOrNull(b.grossPrice),
      contextPrices: b.contextPrices.map((cp) => ({
        context: cp.context,
        batteryRrp: numOrNull(cp.batteryRrp),
      })),
      combos: b.compatibleInverters
        .filter((ci) => ci.inverter && ci.inverter.status === 'ACTIVE')
        .map((ci) => ({
          compatId: ci.id,
          inverterId: ci.inverter.id,
          inverterModel: ci.inverter.inverterModel,
          inverterName: ci.inverter.productName,
          phase: ci.inverter.phase,
          prices: ci.comboPrices.map((cp) => ({
            context: cp.context,
            batteryRrp: numOrNull(cp.batteryRrp),
          })),
        })),
    }));
  }

  /** All inverter pairings for a battery, each with its per-context combo prices. */
  listBatteryCombos(batteryId: string) {
    return this.prisma.batteryInverterCompat.findMany({
      where: { batteryId },
      include: {
        inverter: {
          select: { id: true, productName: true, inverterModel: true },
        },
        comboPrices: { orderBy: { context: 'asc' } },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  /** Upsert the gross + RRP for one combo (compat row) in one context. */
  async upsertComboPrice(
    compatId: string,
    dto: ComboPriceInput,
    changedBy: string,
  ) {
    if (!dto?.context) throw new BadRequestException('context is required');
    const eff = dto.effectiveDate ? new Date(dto.effectiveDate) : null;
    const gross = dto.grossPrice ?? null;
    const rrp = dto.batteryRrp ?? null;
    const existing = await this.prisma.batteryComboContextPrice.findUnique({
      where: { compatId_context: { compatId, context: dto.context } },
    });
    return this.prisma.$transaction(async (tx) => {
      const row = await tx.batteryComboContextPrice.upsert({
        where: { compatId_context: { compatId, context: dto.context } },
        create: {
          compatId,
          context: dto.context,
          grossPrice: gross,
          batteryRrp: rrp,
          effectiveDate: eff,
        },
        update: { grossPrice: gross, batteryRrp: rrp, effectiveDate: eff },
      });
      const changes = this.diff(existing ?? {}, row, [
        'grossPrice',
        'batteryRrp',
        'effectiveDate',
      ]);
      await this.history.recordBatteryComboPrice(
        tx,
        row.id,
        changes,
        changedBy,
        eff ?? new Date(),
      );
      return row;
    });
  }

  // ---- battery <-> inverter compatibility (allow-list) -------------------

  listCompat(inverterId?: string) {
    return this.prisma.batteryInverterCompat.findMany({
      where: inverterId ? { inverterId } : {},
      include: {
        inverter: {
          select: { id: true, productName: true, inverterModel: true },
        },
        battery: { select: { id: true, productName: true, batteryModel: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  addCompat(dto: CompatInput) {
    if (!dto?.inverterId || !dto?.batteryId) {
      throw new BadRequestException('inverterId and batteryId are required');
    }
    return this.prisma.batteryInverterCompat.upsert({
      where: {
        inverterId_batteryId: {
          inverterId: dto.inverterId,
          batteryId: dto.batteryId,
        },
      },
      create: {
        inverterId: dto.inverterId,
        batteryId: dto.batteryId,
        notes: dto.notes ?? null,
      },
      update: { isActive: true, notes: dto.notes ?? null },
    });
  }

  toggleCompat(id: string, isActive: boolean) {
    return this.prisma.batteryInverterCompat.update({
      where: { id },
      data: { isActive },
    });
  }

  async removeCompat(id: string) {
    await this.prisma.batteryInverterCompat.delete({ where: { id } });
    return { ok: true };
  }

  // ---- helpers ------------------------------------------------------------

  private async setStatus(
    type: string,
    id: string,
    status: string,
    changedBy: string,
  ) {
    const c = this.cfg(type);
    if (!c.hasStatus) throw new BadRequestException(`${type} has no status`);
    const existing = await this.model(c.key).findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Product not found');
    return this.prisma.$transaction(async (tx) => {
      const updated = await this.model(c.key, tx).update({
        where: { id },
        data: { status },
      });
      await this.history[c.record](
        tx,
        id,
        [{ field: 'status', oldValue: existing.status, newValue: status }],
        changedBy,
      );
      return updated;
    });
  }

  /** Derived solar panel count: round(systemSize kW * 1000 / panelWatt W). */
  private solarPanels(systemSize: unknown, panelWatt: unknown): number | undefined {
    const s = Number(systemSize);
    const w = Number(panelWatt);
    if (!s || !w) return undefined;
    return Math.round((s * 1000) / w);
  }

  private cfg(type: string): CatalogueConfig {
    const c = CATALOGUES[type as Catalogue];
    if (!c) throw new BadRequestException(`Unknown catalogue type: ${type}`);
    return c;
  }

  /** Prisma delegate for a model, optionally on a transaction client. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private model(key: string, tx?: any): any {
    return (tx ?? this.prisma)[key];
  }

  /** Whitelist writable fields and coerce effectiveDate string -> Date. */
  private buildData(c: CatalogueConfig, dto: CatalogueInput) {
    const data: Record<string, unknown> = {};
    for (const f of c.fields) {
      const v = dto[f];
      if (v === undefined) continue;
      data[f] = f === 'effectiveDate' && v ? new Date(v as string) : v;
    }
    return data;
  }

  private diff(
    before: Record<string, unknown>,
    after: Record<string, unknown>,
    fields: string[],
  ): FieldChange[] {
    const out: FieldChange[] = [];
    for (const f of fields) {
      const o = before[f];
      const n = after[f];
      const os = o == null ? '' : o instanceof Date ? o.toISOString() : String(o);
      const ns = n == null ? '' : n instanceof Date ? n.toISOString() : String(n);
      if (os !== ns) {
        out.push({
          field: f,
          oldValue: o == null ? null : os,
          newValue: n == null ? null : ns,
        });
      }
    }
    return out;
  }
}
