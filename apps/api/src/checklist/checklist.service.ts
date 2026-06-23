// ─────────────────────────────────────────────────────────────────────────────
// checklist.service — per-lead system-recommendation checklist.
//
// Lives at /api/v1/leads/:leadId/checklist. A consultant fills the checklist
// for a BOOKED lead, saves drafts, then asks Nova for 5 quote-ready packages.
//
// Access discipline (defence in depth, same as the rest of the API):
//   • Coarse capability gate on the controller (@RequirePermissions).
//   • Row scope here: the lead must fall inside the caller's visibility scope
//     (ScopeService) — a consultant only touches their own leads; managers/
//     admins with records:read:all may open any.
//   • The lead must be booked (or already converted) — non-booked leads have no
//     checklist, mirroring the Actions-column button visibility.
//   • Required fields are enforced only at generate-time, and NMI/prices are
//     never fabricated — generation is blocked instead.
// ─────────────────────────────────────────────────────────────────────────────

import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { LeadStage, PERMISSIONS } from '@astra/shared';
import type { LeadChecklistDto, SystemRecommendationResult } from '@astra/shared';
import { Prisma } from '../db';
import { PrismaService } from '../prisma/prisma.service';
import { ScopeService } from '../common/scope.service';
import { AuditService } from '../common/audit.service';
import { NovaRecommendationService } from '../nova/nova-recommendation.service';
import type { AuthUser } from '../common/auth-user';
import type { SaveChecklistDto } from './dto';

@Injectable()
export class ChecklistService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scope: ScopeService,
    private readonly audit: AuditService,
    private readonly recommender: NovaRecommendationService,
  ) {}

  // ── access helpers ──────────────────────────────────────────────────────

  /** Load the lead and confirm the caller may work its checklist. */
  private async loadLead(user: AuthUser, leadId: string) {
    const scopeWhere = await this.scope.leadWhere(user);
    const lead = await this.prisma.lead.findFirst({
      where: { AND: [scopeWhere, { id: leadId }] },
      include: { checklist: true },
    });
    if (!lead) {
      // Either the lead doesn't exist or it's outside the caller's scope — we
      // don't distinguish, to avoid leaking record existence.
      throw new NotFoundException('Lead not found');
    }
    return lead;
  }

  private assertBooked(lead: { stage: string }) {
    if (lead.stage !== LeadStage.BOOKED && lead.stage !== LeadStage.CONVERTED) {
      throw new BadRequestException(
        'A checklist can only be built for a lead that has been booked into an appointment.',
      );
    }
  }

  // ── reads ─────────────────────────────────────────────────────────────────

  async getByLead(user: AuthUser, leadId: string): Promise<LeadChecklistDto | null> {
    const lead = await this.loadLead(user, leadId);
    return lead.checklist ? toDto(lead.checklist) : null;
  }

  // ── save draft (no AI call) ────────────────────────────────────────────────

  async save(
    user: AuthUser,
    leadId: string,
    dto: SaveChecklistDto,
  ): Promise<LeadChecklistDto> {
    const lead = await this.loadLead(user, leadId);
    this.assertBooked(lead);

    const data = this.toColumnData(dto);
    const saved = await this.prisma.leadChecklist.upsert({
      where: { leadId },
      // Editing the captured fields never downgrades a COMPLETED checklist back
      // to DRAFT; the web prompts "Regenerate recommendations?" separately.
      update: data,
      create: { ...data, leadId, createdById: user.id },
    });

    await this.audit.record({
      userId: user.id,
      action: 'CHECKLIST_SAVED',
      entity: 'LeadChecklist',
      entityId: saved.id,
      metadata: { leadId },
    });

    return toDto(saved);
  }

  // ── generate recommendations (the AI call) ──────────────────────────────────

  async generate(
    user: AuthUser,
    leadId: string,
    dto: SaveChecklistDto,
  ): Promise<LeadChecklistDto> {
    const lead = await this.loadLead(user, leadId);
    this.assertBooked(lead);

    // Persist the latest capture first so the entered data is never lost even
    // if the AI call fails (spec §7).
    const data = this.toColumnData(dto);
    const checklist = await this.prisma.leadChecklist.upsert({
      where: { leadId },
      update: data,
      create: { ...data, leadId, createdById: user.id },
    });

    // Enforce the required-field set ONLY now (drafts may be partial).
    this.assertReadyForGeneration(checklist);

    const payload = this.toAiPayload(leadId, checklist);
    const result: SystemRecommendationResult = await this.recommender.generate(
      user,
      leadId,
      payload,
    );

    const completed = await this.prisma.leadChecklist.update({
      where: { leadId },
      data: {
        status: 'COMPLETED',
        result: result as unknown as Prisma.InputJsonValue,
        recommendedOptionId: result.recommended_option_id,
        generatedAt: new Date(),
      },
    });

    await this.audit.record({
      userId: user.id,
      action: 'CHECKLIST_RECOMMENDATIONS_GENERATED',
      entity: 'LeadChecklist',
      entityId: completed.id,
      metadata: {
        leadId,
        optionCount: result.options.length,
        recommended: result.recommended_option_id,
      },
    });

    return toDto(completed);
  }

  // ── select an option ────────────────────────────────────────────────────────

  async selectOption(
    user: AuthUser,
    leadId: string,
    optionId: string,
  ): Promise<LeadChecklistDto> {
    const lead = await this.loadLead(user, leadId);
    const checklist = lead.checklist;
    if (!checklist || checklist.status !== 'COMPLETED' || !checklist.result) {
      throw new BadRequestException('No recommendations have been generated yet.');
    }
    const result = checklist.result as unknown as SystemRecommendationResult;
    if (!result.options?.some((o) => o.option_id === optionId)) {
      throw new BadRequestException('Unknown option for this checklist.');
    }

    const updated = await this.prisma.leadChecklist.update({
      where: { leadId },
      data: { selectedOptionId: optionId },
    });

    await this.audit.record({
      userId: user.id,
      action: 'CHECKLIST_OPTION_SELECTED',
      entity: 'LeadChecklist',
      entityId: updated.id,
      metadata: { leadId, optionId },
    });

    return toDto(updated);
  }

  // ── mapping helpers ───────────────────────────────────────────────────────

  /** DTO → Prisma column data (only sets provided keys). */
  private toColumnData(dto: SaveChecklistDto): Prisma.LeadChecklistUncheckedUpdateInput {
    const d: Prisma.LeadChecklistUncheckedUpdateInput = {};
    const set = <K extends keyof SaveChecklistDto>(k: K, v: unknown) => {
      if (v !== undefined) (d as any)[k] = v;
    };
    set('state', dto.state);
    set('nmi', dto.nmi);
    set('roofType', dto.roofType);
    set('storeys', dto.storeys);
    set('orientation', dto.orientation);
    set('shadingNotes', dto.shadingNotes);
    set('phase', dto.phase);
    set('switchboard', dto.switchboard);
    if (dto.spendAmount !== undefined)
      d.spendAmount = new Prisma.Decimal(dto.spendAmount);
    set('spendPeriod', dto.spendPeriod);
    if (dto.usageSplit !== undefined)
      d.usageSplit = dto.usageSplit as unknown as Prisma.InputJsonValue;
    if (dto.drivers !== undefined) d.drivers = dto.drivers;
    set('budgetPosture', dto.budgetPosture);
    set('category', dto.category);
    if (dto.priorSystem !== undefined)
      d.priorSystem = dto.priorSystem as unknown as Prisma.InputJsonValue;
    if (dto.preferredBrands !== undefined) d.preferredBrands = dto.preferredBrands;
    if (dto.excludedBrands !== undefined) d.excludedBrands = dto.excludedBrands;
    set('batteryPref', dto.batteryPref);
    set('evChargerPref', dto.evChargerPref);
    if (dto.budgetCeiling !== undefined)
      d.budgetCeiling = new Prisma.Decimal(dto.budgetCeiling);
    return d;
  }

  /** Block generation (never fabricate) unless the required set is present. */
  private assertReadyForGeneration(c: any) {
    const missing: string[] = [];
    if (!c.state) missing.push('state');
    const nmi = String(c.nmi ?? '').trim();
    if (!nmi) missing.push('nmi');
    else if (nmi.length < 10 || nmi.length > 11) missing.push('nmi (must be 10–11 chars)');
    if (!c.roofType) missing.push('roofType');
    if (!c.phase) missing.push('phase');
    if (c.spendAmount == null) missing.push('spendAmount');
    if (!Array.isArray(c.drivers) || c.drivers.length === 0) missing.push('drivers');
    if (!c.budgetPosture) missing.push('budgetPosture');
    if (!c.category) missing.push('category');
    // Conditional prior-system block (required the moment category !== new).
    if (c.category && c.category !== 'new') {
      const p = c.priorSystem;
      const hasPrior =
        p && typeof p === 'object' && Object.values(p).some((v) => v != null && v !== '');
      if (!hasPrior) missing.push('priorSystem (required for non-new systems)');
    }
    if (missing.length) {
      throw new BadRequestException({
        error: 'checklist_incomplete',
        message: 'Complete the required fields before generating recommendations.',
        missing,
      });
    }
  }

  /** Build the structured payload Nova receives. */
  private toAiPayload(leadId: string, c: any): Record<string, unknown> {
    return {
      lead_id: leadId,
      state: c.state,
      nmi: c.nmi,
      roof_type: c.roofType,
      storeys: c.storeys ?? undefined,
      orientation: c.orientation ?? undefined,
      shading_notes: c.shadingNotes ?? undefined,
      phase: c.phase,
      switchboard: c.switchboard ?? undefined,
      spend: {
        amount: c.spendAmount != null ? Number(c.spendAmount) : undefined,
        period: c.spendPeriod ?? undefined,
      },
      usage_split: c.usageSplit ?? undefined,
      drivers: c.drivers ?? [],
      budget_posture: c.budgetPosture,
      category: c.category,
      prior_system: c.priorSystem ?? undefined,
      preferences: {
        preferred_brands: c.preferredBrands ?? [],
        excluded_brands: c.excludedBrands ?? [],
        battery: c.batteryPref ?? 'let_ai_decide',
        ev_charger: c.evChargerPref ?? 'let_ai_decide',
        budget_ceiling: c.budgetCeiling != null ? Number(c.budgetCeiling) : undefined,
      },
    };
  }
}

// ── serialisation (Prisma row → wire DTO) ──────────────────────────────────────

function num(v: Prisma.Decimal | null): number | null {
  return v == null ? null : Number(v);
}

function toDto(c: any): LeadChecklistDto {
  return {
    id: c.id,
    leadId: c.leadId,
    status: c.status,
    state: c.state ?? null,
    nmi: c.nmi ?? null,
    roofType: c.roofType ?? null,
    storeys: c.storeys ?? null,
    orientation: c.orientation ?? null,
    shadingNotes: c.shadingNotes ?? null,
    phase: c.phase ?? null,
    switchboard: c.switchboard ?? null,
    spendAmount: num(c.spendAmount),
    spendPeriod: c.spendPeriod ?? null,
    usageSplit: (c.usageSplit as any) ?? null,
    drivers: c.drivers ?? [],
    budgetPosture: c.budgetPosture ?? null,
    category: c.category ?? null,
    priorSystem: (c.priorSystem as any) ?? null,
    preferredBrands: c.preferredBrands ?? [],
    excludedBrands: c.excludedBrands ?? [],
    batteryPref: c.batteryPref ?? null,
    evChargerPref: c.evChargerPref ?? null,
    budgetCeiling: num(c.budgetCeiling),
    result: (c.result as any) ?? null,
    recommendedOptionId: c.recommendedOptionId ?? null,
    selectedOptionId: c.selectedOptionId ?? null,
    generatedAt: c.generatedAt ? c.generatedAt.toISOString() : null,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
  };
}
