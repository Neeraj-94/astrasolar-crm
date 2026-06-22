// ─────────────────────────────────────────────────────────────────────────────
// nova-tools — the tools Nova can call to read v2's LIVE data.
//
// This is the "she can see all the specs in the app" layer. Where the legacy
// Nova read Aircall transcripts from Firebase, the v2 Nova reads the real CRM:
// the product catalogue (panel watts, STC, inverter phase/MPPT, battery
// compatibility), individual leads and sales, the system quoted on a sale, the
// caller's own recent records, and dashboard analytics.
//
// SECURITY: every tool re-applies the caller's RBAC + visibility scope through
// the existing ScopeService / domain services — exactly the discipline the old
// nova-tools.mjs used. We NEVER trust the model to respect role boundaries; the
// server gates each read. A consultant asking about leads sees only their own.
// ─────────────────────────────────────────────────────────────────────────────

import { Injectable, Logger } from '@nestjs/common';
import type Anthropic from '@anthropic-ai/sdk';
import { PrismaService } from '../prisma/prisma.service';
import { ScopeService } from '../common/scope.service';
import { ProductsService } from '../products/products.service';
import { SalesService } from '../sales/sales.service';
import { AnalyticsService } from '../analytics/analytics.service';
import { NovaKnowledgeService } from './nova-knowledge.service';
import type { AuthUser } from '../common/auth-user';

type ToolResult = { ok: boolean; content: string };

const CATALOGUE_TYPES = ['solar', 'inverter', 'battery', 'extras'] as const;

export const TOOL_DEFINITIONS: Anthropic.Tool[] = [
  {
    name: 'search_products',
    description:
      "Search the Astrasolar product catalogue. Returns matching products with their key specs. " +
      "Use for 'what 10kW systems do we sell?', 'show me three-phase hybrid inverters', 'which batteries do we stock?'. " +
      "Optionally filter by catalogue type and a free-text query (matches name, brand, model).",
    input_schema: {
      type: 'object',
      properties: {
        type: { type: 'string', enum: [...CATALOGUE_TYPES], description: 'Catalogue: solar | inverter | battery | extras. Omit to search all.' },
        query: { type: 'string', description: 'Free-text filter on name/brand/model (e.g. "Jinko", "GoodWe", "10kW").' },
        limit: { type: 'integer', description: 'Max results (default 15, max 40).' },
      },
    },
  },
  {
    name: 'get_product_specs',
    description:
      "Fetch the full spec sheet for one product by id (and catalogue type). Returns every spec field: " +
      "for panels — wattage, system size, STC, RRP, number of panels; for inverters — phase, type, MPPT, " +
      "max PV array; for batteries — capacity and pricing. Use after search_products when the user wants detail.",
    input_schema: {
      type: 'object',
      properties: {
        type: { type: 'string', enum: [...CATALOGUE_TYPES], description: 'Catalogue type the product belongs to.' },
        id: { type: 'string', description: 'Product id.' },
      },
      required: ['type', 'id'],
    },
  },
  {
    name: 'check_compatibility',
    description:
      "List which batteries are approved to pair with a given inverter (the battery↔inverter compatibility allow-list). " +
      "Use for 'can this battery run on a GoodWe GW9.999?' or 'what batteries pair with inverter X?'.",
    input_schema: {
      type: 'object',
      properties: {
        inverterId: { type: 'string', description: 'Inverter product id to list compatible batteries for. Omit for the full allow-list.' },
      },
    },
  },
  {
    name: 'lookup_lead',
    description:
      "Find a lead by customer name (or lead id) and return its current status, stage, owner, consultant and booking. " +
      "RBAC: only returns leads the caller is allowed to see (a consultant sees only their own).",
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Customer name fragment or lead id.' },
      },
      required: ['query'],
    },
  },
  {
    name: 'lookup_sale',
    description:
      "Fetch a sale and the exact system quoted on it (system details: panel/inverter/battery models, system size, " +
      "prices, status). Look up by sale id, or by customer name to find the sale. RBAC-scoped to the caller.",
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Sale id or customer name fragment.' },
      },
      required: ['query'],
    },
  },
  {
    name: 'list_my_recent',
    description:
      "List the caller's own recent leads or sales. Use for 'what did I sell this week?', 'show my recent leads'.",
    input_schema: {
      type: 'object',
      properties: {
        kind: { type: 'string', enum: ['leads', 'sales'], description: 'Which records to list.' },
        limit: { type: 'integer', description: 'Max results (default 15, max 40).' },
      },
      required: ['kind'],
    },
  },
  {
    name: 'get_dashboard_summary',
    description:
      "Get the dashboard summary figures (pipeline, conversion, sales counts) computed over the data the caller is " +
      "allowed to see. Use for 'how's the team doing this month?', 'what's our conversion?'. Optional date range.",
    input_schema: {
      type: 'object',
      properties: {
        from: { type: 'string', description: 'ISO date (YYYY-MM-DD) start of range.' },
        to: { type: 'string', description: 'ISO date (YYYY-MM-DD) end of range.' },
      },
    },
  },
  {
    name: 'search_knowledge',
    description:
      "Search Nova's curated company knowledge base (process, policy, rebates, product FAQs). Use for company-specific " +
      "facts that aren't live CRM data.",
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'What to look up.' },
      },
      required: ['query'],
    },
  },
];

@Injectable()
export class NovaToolsService {
  private readonly logger = new Logger(NovaToolsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly scope: ScopeService,
    private readonly products: ProductsService,
    private readonly sales: SalesService,
    private readonly analytics: AnalyticsService,
    private readonly knowledge: NovaKnowledgeService,
  ) {}

  private ok(payload: unknown): ToolResult {
    return { ok: true, content: safeJson(payload) };
  }
  private err(error: string, extra?: Record<string, unknown>): ToolResult {
    return { ok: false, content: safeJson({ error, ...(extra || {}) }) };
  }

  /** Single entry point used by NovaService's tool loop. Never throws. */
  async execute(user: AuthUser, name: string, input: Record<string, any>): Promise<ToolResult> {
    try {
      switch (name) {
        case 'search_products':
          return await this.searchProducts(input);
        case 'get_product_specs':
          return await this.getProductSpecs(input);
        case 'check_compatibility':
          return await this.checkCompatibility(input);
        case 'lookup_lead':
          return await this.lookupLead(user, input);
        case 'lookup_sale':
          return await this.lookupSale(user, input);
        case 'list_my_recent':
          return await this.listMyRecent(user, input);
        case 'get_dashboard_summary':
          return await this.dashboardSummary(user, input);
        case 'search_knowledge':
          return await this.searchKnowledge(input);
        default:
          return this.err('unknown_tool', { tool: name });
      }
    } catch (e: any) {
      this.logger.error(`tool ${name} failed: ${e?.message}`);
      return this.err('internal', { tool: name, message: String(e?.message).slice(0, 200) });
    }
  }

  // ── Catalogue ─────────────────────────────────────────────────────────────

  private async searchProducts(input: Record<string, any>): Promise<ToolResult> {
    const q = String(input?.query || '').toLowerCase().trim();
    const limit = clamp(input?.limit, 15, 40);
    const types = input?.type ? [String(input.type)] : [...CATALOGUE_TYPES];
    const out: any[] = [];
    for (const type of types) {
      if (!CATALOGUE_TYPES.includes(type as any)) continue;
      const rows: any[] = await this.products.list(type, false);
      for (const r of rows) {
        const hay = `${r.productName || r.itemName || ''} ${r.brand || ''} ${r.panelModel || ''} ${r.inverterModel || ''} ${r.model || ''}`.toLowerCase();
        if (q && !hay.includes(q)) continue;
        out.push({ type, ...slimProduct(type, r) });
        if (out.length >= limit) break;
      }
      if (out.length >= limit) break;
    }
    return this.ok({ count: out.length, query: q || null, products: out });
  }

  private async getProductSpecs(input: Record<string, any>): Promise<ToolResult> {
    const type = String(input?.type || '');
    const id = String(input?.id || '');
    if (!CATALOGUE_TYPES.includes(type as any)) return this.err('invalid_type', { type });
    if (!id) return this.err('missing_id');
    const row = await this.products.get(type, id).catch(() => null);
    if (!row) return this.err('not_found', { type, id });
    return this.ok({ type, specs: row });
  }

  private async checkCompatibility(input: Record<string, any>): Promise<ToolResult> {
    const inverterId = input?.inverterId ? String(input.inverterId) : undefined;
    const rows = await this.products.listCompat(inverterId);
    return this.ok({ inverterId: inverterId || null, compatibilities: rows });
  }

  // ── Leads / sales (scoped) ──────────────────────────────────────────────────

  private async lookupLead(user: AuthUser, input: Record<string, any>): Promise<ToolResult> {
    const query = String(input?.query || '').trim();
    if (!query) return this.err('missing_query');
    const scopeWhere = await this.scope.leadWhere(user);
    const lead = await this.prisma.lead.findFirst({
      where: {
        AND: [
          scopeWhere,
          {
            OR: [
              { id: query },
              { firstName: { contains: query, mode: 'insensitive' } },
              { surName: { contains: query, mode: 'insensitive' } },
            ],
          },
        ],
      },
      include: {
        leadGen: { select: { id: true, name: true } },
        consultant: { select: { id: true, name: true } },
        booking: true,
      },
      orderBy: { timestamp: 'desc' },
    });
    if (!lead) return this.err('not_found', { query, note: 'No matching lead in your access scope.' });
    return this.ok({ lead });
  }

  private async lookupSale(user: AuthUser, input: Record<string, any>): Promise<ToolResult> {
    const query = String(input?.query || '').trim();
    if (!query) return this.err('missing_query');
    const scopeWhere = await this.scope.saleWhere(user);
    const sale = await this.prisma.sale.findFirst({
      where: {
        AND: [
          scopeWhere,
          {
            OR: [
              { id: query },
              { lead: { is: { firstName: { contains: query, mode: 'insensitive' } } } },
              { lead: { is: { surName: { contains: query, mode: 'insensitive' } } } },
            ],
          },
        ],
      },
      include: {
        owner: { select: { id: true, name: true } },
        systemDetails: true,
        statusDetails: true,
        lead: true,
      },
      orderBy: { saleDate: 'desc' },
    });
    if (!sale) return this.err('not_found', { query, note: 'No matching sale in your access scope.' });
    return this.ok({ sale });
  }

  private async listMyRecent(user: AuthUser, input: Record<string, any>): Promise<ToolResult> {
    const kind = String(input?.kind || '');
    const limit = clamp(input?.limit, 15, 40);
    if (kind === 'sales') {
      const all = await this.sales.list(user, user.id);
      return this.ok({ kind, count: Math.min(all.length, limit), sales: all.slice(0, limit) });
    }
    if (kind === 'leads') {
      const where = await this.scope.leadWhere(user, user.id);
      const leads = await this.prisma.lead.findMany({
        where,
        include: { booking: true, consultant: { select: { id: true, name: true } } },
        orderBy: { timestamp: 'desc' },
        take: limit,
      });
      return this.ok({ kind, count: leads.length, leads });
    }
    return this.err('invalid_kind', { kind });
  }

  private async dashboardSummary(user: AuthUser, input: Record<string, any>): Promise<ToolResult> {
    const filters = {
      from: input?.from ? String(input.from) : undefined,
      to: input?.to ? String(input.to) : undefined,
    };
    const summary = await this.analytics.summary(user, filters);
    return this.ok({ filters, summary });
  }

  private async searchKnowledge(input: Record<string, any>): Promise<ToolResult> {
    const query = String(input?.query || '').trim();
    if (!query) return this.err('missing_query');
    const results = await this.knowledge.searchKb(query, 6);
    return this.ok({
      query,
      count: results.length,
      entries: results.map((r) => ({ category: r.category, question: r.question, answer: r.answer, source: r.source })),
    });
  }
}

// ── helpers ───────────────────────────────────────────────────────────────────

function clamp(v: unknown, dflt: number, max: number): number {
  const n = parseInt(String(v ?? ''), 10);
  if (!Number.isFinite(n) || n < 1) return dflt;
  return Math.min(n, max);
}

function safeJson(payload: unknown): string {
  try {
    return JSON.stringify(payload, (_k, v) => (typeof v === 'bigint' ? Number(v) : v));
  } catch {
    return JSON.stringify({ error: 'unserialisable_result' });
  }
}

/** A compact spec view for list results (full row available via get_product_specs). */
function slimProduct(type: string, r: any): Record<string, unknown> {
  if (type === 'solar') {
    return {
      id: r.id, name: r.productName, brand: r.brand, panelModel: r.panelModel,
      panelWatt: r.panelWatt, systemSize: r.systemSize, numOfPanels: r.numOfPanels,
      solarStc: r.solarStc, solarRrp: r.solarRrp, states: r.states, status: r.status,
    };
  }
  if (type === 'inverter') {
    return {
      id: r.id, name: r.productName, brand: r.brand, inverterModel: r.inverterModel,
      type: r.type, phase: r.phase, systemSize: r.systemSize, maxPVArray: r.maxPVArray,
      mppt: r.mppt, strings: r.strings, states: r.states, status: r.status,
    };
  }
  if (type === 'battery') {
    return { id: r.id, name: r.productName, brand: r.brand, ...stripTimestamps(r) };
  }
  return { id: r.id, name: r.itemName || r.productName, ...stripTimestamps(r) };
}

function stripTimestamps(r: any): Record<string, unknown> {
  const { createdAt, updatedAt, logs, ...rest } = r || {};
  return rest;
}
