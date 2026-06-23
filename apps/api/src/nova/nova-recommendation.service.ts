// ─────────────────────────────────────────────────────────────────────────────
// nova-recommendation.service — the system AI behind the per-lead checklist.
//
// Takes the consultant's structured checklist payload for a booked lead and
// returns EXACTLY 5 quote-ready system packages with EXACTLY ONE marked "Most
// Recommended" (the §5 contract in the feature spec). It reuses the existing
// Nova infrastructure:
//   • NovaAnthropicService — the single Anthropic client (key stays server-side)
//   • NovaToolsService     — the live, RBAC-scoped catalogue read tools so the
//                            options are grounded in products we actually sell
//   • NovaKnowledgeService — curated company facts (rebates/finance/policy)
//
// The 5-option JSON is guaranteed structurally by forcing a final tool call
// (`submit_system_recommendations`) whose input_schema mirrors the contract,
// then validating the shape before returning it. This is deliberately separate
// from NovaService.chat (free-form conversation) — same engine, different job.
// ─────────────────────────────────────────────────────────────────────────────

import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import type Anthropic from '@anthropic-ai/sdk';
import type { SystemRecommendationResult } from '@astra/shared';
import type { AuthUser } from '../common/auth-user';
import { NovaAnthropicService } from './nova-anthropic.service';
import { NovaToolsService, TOOL_DEFINITIONS } from './nova-tools.service';
import { NovaKnowledgeService } from './nova-knowledge.service';

const MAX_TOOL_LOOPS = 8;
const MAX_TOKENS = 8000;
const TAS_PERMIT_DC_KW = 13.3; // TAS building permit threshold (DC > 13.3 kW)

// The forced final tool. Its input is the §5 contract, so when the model calls
// it we get the 5 options as validated structured data rather than parsed prose.
const SUBMIT_TOOL: Anthropic.Tool = {
  name: 'submit_system_recommendations',
  description:
    'Submit the final set of EXACTLY 5 quote-ready system packages for this lead, ' +
    'with EXACTLY ONE flagged as the recommended option. Call this once, last, ' +
    'after you have used the catalogue tools to ground every option in real products.',
  input_schema: {
    type: 'object',
    properties: {
      recommended_option_id: {
        type: 'string',
        description: 'The option_id of the single most-recommended package.',
      },
      options: {
        type: 'array',
        description: 'Exactly 5 system packages.',
        items: {
          type: 'object',
          properties: {
            option_id: { type: 'string', description: 'Stable id, e.g. opt_1..opt_5.' },
            label: { type: 'string', description: 'Short label, e.g. Entry / Balanced / Recommended / Premium / Max.' },
            summary: { type: 'string', description: 'One-line summary of who this package suits.' },
            sizing: {
              type: 'object',
              properties: {
                array_kw: { type: 'number', description: 'Solar array DC size in kW.' },
                inverter_kw: { type: 'number' },
                inverter_phase: { type: 'string', description: 'single-phase | 3-phase' },
                battery_kwh: { type: 'number', description: 'Usable battery capacity in kWh (omit if no battery).' },
              },
              required: ['array_kw', 'inverter_kw', 'inverter_phase'],
            },
            products: {
              type: 'object',
              properties: {
                panels: { type: 'string', description: 'Panel make/model x qty.' },
                inverter: { type: 'string' },
                battery: { type: 'string' },
                extras: { type: 'array', items: { type: 'string' } },
              },
              required: ['panels', 'inverter'],
            },
            price: {
              type: 'object',
              properties: {
                total_inc_gst: { type: 'number' },
                currency: { type: 'string', description: 'Always "AUD".' },
                indicative: { type: 'boolean', description: 'Always true.' },
              },
              required: ['total_inc_gst', 'currency', 'indicative'],
            },
            finance: {
              type: 'object',
              properties: {
                products: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      name: { type: 'string' },
                      amount: { type: 'number' },
                      term_years: { type: 'number' },
                      frequency: { type: 'string', description: 'weekly | fortnightly | monthly' },
                      approx_repayment: { type: 'number' },
                    },
                    required: ['name', 'amount', 'term_years', 'frequency', 'approx_repayment'],
                  },
                },
                combined_repayment_note: { type: 'string' },
                no_penalty_note: { type: 'boolean' },
              },
              required: ['products'],
            },
            permit_flags: {
              type: 'array',
              items: { type: 'string' },
              description: 'e.g. ["TAS_building_permit_required"] when TAS and array DC > 13.3 kW.',
            },
            rationale: { type: 'string', description: 'Why this package, tied to the customer drivers.' },
            tradeoffs: { type: 'string', description: 'What it costs more / does less vs the others.' },
          },
          required: [
            'option_id',
            'label',
            'summary',
            'sizing',
            'products',
            'price',
            'finance',
            'permit_flags',
            'rationale',
            'tradeoffs',
          ],
        },
      },
    },
    required: ['recommended_option_id', 'options'],
  },
};

@Injectable()
export class NovaRecommendationService {
  private readonly logger = new Logger(NovaRecommendationService.name);

  constructor(
    private readonly anthropic: NovaAnthropicService,
    private readonly tools: NovaToolsService,
    private readonly knowledge: NovaKnowledgeService,
  ) {}

  get configured(): boolean {
    return this.anthropic.configured;
  }

  /**
   * Generate the 5 quote-ready packages for one checklist payload. `payload` is
   * the serialised checklist (already keyed to the lead). RBAC is enforced by
   * the caller (checklist service) and by the catalogue tools, which re-scope
   * every read to `user`.
   */
  async generate(
    user: AuthUser,
    leadId: string,
    payload: Record<string, unknown>,
  ): Promise<SystemRecommendationResult> {
    if (!this.anthropic.configured) {
      throw new HttpException(
        { error: 'server_misconfigured', reason: 'missing_anthropic_key' },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }

    const system = await this.buildSystemPrompt(payload);
    const userTurn =
      'Here is the qualifying + technical checklist for this booked lead. ' +
      'Use the catalogue tools to ground each option in products we actually sell, ' +
      'then call submit_system_recommendations with exactly 5 packages.\n\n' +
      '```json\n' +
      safeJson(payload) +
      '\n```';

    const messages: Anthropic.MessageParam[] = [
      { role: 'user', content: userTurn },
    ];
    const tools: Anthropic.Tool[] = [...TOOL_DEFINITIONS, SUBMIT_TOOL];
    const model = this.anthropic.smartModel;

    let result: SystemRecommendationResult | null = null;

    for (let iter = 0; iter < MAX_TOOL_LOOPS; iter++) {
      // On the last allowed iteration, force the submit tool so we always end
      // with structured output rather than running out of loops on prose.
      const forceSubmit = iter === MAX_TOOL_LOOPS - 1;
      let resp: Anthropic.Message;
      try {
        resp = await this.anthropic.createMessage({
          model,
          max_tokens: MAX_TOKENS,
          system,
          messages,
          tools,
          ...(forceSubmit
            ? { tool_choice: { type: 'tool', name: SUBMIT_TOOL.name } as any }
            : {}),
        });
      } catch (e: any) {
        this.logger.error(`recommendation call failed: ${e?.message}`);
        throw new HttpException({ error: 'upstream_error' }, HttpStatus.BAD_GATEWAY);
      }

      if (resp.stop_reason !== 'tool_use') {
        // No tool call this turn — nudge it to submit and continue.
        if (iter < MAX_TOOL_LOOPS - 1) {
          messages.push({ role: 'assistant', content: resp.content });
          messages.push({
            role: 'user',
            content:
              'Now call submit_system_recommendations with exactly 5 packages and one recommended option.',
          });
          continue;
        }
        break;
      }

      const toolUses = resp.content.filter(
        (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use',
      );
      messages.push({ role: 'assistant', content: resp.content });

      const toolResults: Anthropic.ToolResultBlockParam[] = [];
      for (const tu of toolUses) {
        if (tu.name === SUBMIT_TOOL.name) {
          result = this.validateResult(leadId, tu.input as any, payload);
          toolResults.push({
            type: 'tool_result',
            tool_use_id: tu.id,
            content: 'ok',
          });
        } else {
          const r = await this.tools.execute(user, tu.name, (tu.input as any) || {});
          toolResults.push({
            type: 'tool_result',
            tool_use_id: tu.id,
            content: r.content,
            ...(r.ok ? {} : { is_error: true }),
          });
        }
      }

      if (result) return result;
      messages.push({ role: 'user', content: toolResults });
    }

    throw new HttpException(
      { error: 'recommendation_incomplete', reason: 'model_did_not_return_5_options' },
      HttpStatus.BAD_GATEWAY,
    );
  }

  // ── prompt ─────────────────────────────────────────────────────────────────

  private async buildSystemPrompt(payload: Record<string, unknown>): Promise<string> {
    const state = String((payload as any)?.state ?? '').toUpperCase();
    // Pull any curated finance/rebate knowledge so the finance blocks are grounded.
    let kb = '';
    try {
      const entries = await this.knowledge.searchKb(
        `${state} solar battery finance rebate loan eligibility`,
        6,
      );
      kb = this.knowledge.formatKbContext(entries);
    } catch {
      /* knowledge is best-effort */
    }

    return [
      "You are NOVA, Astrasolar's in-house system designer. Astrasolar is an Australian solar & battery company operating in ACT, NSW and Tasmania.",
      'Your job: turn one lead\'s qualifying + technical checklist into EXACTLY 5 quote-ready system packages, with EXACTLY ONE flagged as the recommended option, so the consultant walks into the appointment with options ready.\n',
      '\nHARD RULES — every one is mandatory:',
      '\n1. Return EXACTLY 5 options. EXACTLY ONE is the recommended one (its option_id is recommended_option_id).',
      '\n2. Each option MUST include all four of: sizing, products, an INDICATIVE price (price.indicative = true, currency "AUD"), and finance.',
      '\n3. Ground every option in REAL catalogue products. Use search_products / get_product_specs / check_compatibility before sizing — do not invent panels, inverters or batteries. Only pair batteries with inverters the compatibility tool approves.',
      `\n4. TAS PERMIT: if state is TAS and an option's solar array DC size is greater than ${TAS_PERMIT_DC_KW} kW, that option MUST include "TAS_building_permit_required" in permit_flags. Otherwise leave permit_flags empty (or list only genuinely-applicable flags).`,
      '\n5. FINANCE must be valid for the lead\'s state: ACT → SHS / ACT HESP loan (note: ACT solar loans only via HESP for concession holders); NSW/TAS → relevant state loan; Brighte interest-free is available in all states. All amounts/repayments are INDICATIVE and subject to lender approval — this is information, not financial advice. Set no_penalty_note where the product has no early-repayment penalty.',
      '\n6. Honour the payload: respect excluded_brands (never include them), any budget ceiling, and the battery / EV-charger preferences. If preference is "let_ai_decide", make the call and justify it.',
      '\n7. Tie each option to the customer\'s stated drivers. Give every option a one-line rationale and a one-line tradeoffs note so the consultant can compare at a glance.',
      '\n8. Spread the 5 options across a sensible range (e.g. entry → balanced → recommended → premium → max) rather than five near-identical systems.',
      '\nNever fabricate prices to look precise — they are indicative estimates. When unsure of a real spec, use a tool. Use Australian English.\n',
      kb ? '\n' + kb : '',
    ].join('');
  }

  // ── validation ───────────────────────────────────────────────────────────

  /**
   * Structurally validate the model's submit_system_recommendations input and
   * normalise it into the contract. Also enforces the deterministic rules we
   * can check ourselves: exactly 5 options, exactly one recommended, indicative
   * pricing, and the TAS permit flag.
   */
  private validateResult(
    leadId: string,
    input: any,
    payload: Record<string, unknown>,
  ): SystemRecommendationResult {
    const options = Array.isArray(input?.options) ? input.options : [];
    if (options.length !== 5) {
      throw new HttpException(
        { error: 'recommendation_invalid', reason: `expected 5 options, got ${options.length}` },
        HttpStatus.BAD_GATEWAY,
      );
    }

    const state = String((payload as any)?.state ?? '').toUpperCase();
    const seenIds = new Set<string>();

    const normalised = options.map((o: any, i: number) => {
      const option_id = String(o?.option_id || `opt_${i + 1}`);
      const id = seenIds.has(option_id) ? `opt_${i + 1}` : option_id;
      seenIds.add(id);

      const arrayKw = Number(o?.sizing?.array_kw) || 0;
      const permitFlags: string[] = Array.isArray(o?.permit_flags)
        ? o.permit_flags.filter((f: unknown) => typeof f === 'string')
        : [];
      // Deterministically enforce the TAS permit rule regardless of the model.
      if (state === 'TAS' && arrayKw > TAS_PERMIT_DC_KW) {
        if (!permitFlags.includes('TAS_building_permit_required')) {
          permitFlags.push('TAS_building_permit_required');
        }
      }

      return {
        option_id: id,
        label: String(o?.label || `Option ${i + 1}`),
        summary: String(o?.summary || ''),
        sizing: {
          array_kw: arrayKw,
          inverter_kw: Number(o?.sizing?.inverter_kw) || 0,
          inverter_phase: String(o?.sizing?.inverter_phase || ''),
          ...(o?.sizing?.battery_kwh != null
            ? { battery_kwh: Number(o.sizing.battery_kwh) }
            : {}),
        },
        products: {
          panels: String(o?.products?.panels || ''),
          inverter: String(o?.products?.inverter || ''),
          ...(o?.products?.battery ? { battery: String(o.products.battery) } : {}),
          ...(Array.isArray(o?.products?.extras)
            ? { extras: o.products.extras.map((x: unknown) => String(x)) }
            : {}),
        },
        price: {
          total_inc_gst: Number(o?.price?.total_inc_gst) || 0,
          currency: String(o?.price?.currency || 'AUD'),
          indicative: true, // always indicative — never present as a firm quote
        },
        finance: {
          products: Array.isArray(o?.finance?.products)
            ? o.finance.products.map((f: any) => ({
                name: String(f?.name || ''),
                amount: Number(f?.amount) || 0,
                term_years: Number(f?.term_years) || 0,
                frequency: String(f?.frequency || 'fortnightly'),
                approx_repayment: Number(f?.approx_repayment) || 0,
              }))
            : [],
          ...(o?.finance?.combined_repayment_note
            ? { combined_repayment_note: String(o.finance.combined_repayment_note) }
            : {}),
          ...(o?.finance?.no_penalty_note != null
            ? { no_penalty_note: !!o.finance.no_penalty_note }
            : {}),
        },
        permit_flags: permitFlags,
        rationale: String(o?.rationale || ''),
        tradeoffs: String(o?.tradeoffs || ''),
      };
    });

    // Resolve the recommended option — must match exactly one option.
    let recommended = String(input?.recommended_option_id || '');
    if (!normalised.some((o: any) => o.option_id === recommended)) {
      recommended = normalised[0].option_id; // safe fallback
    }

    return {
      lead_id: leadId,
      recommended_option_id: recommended,
      options: normalised,
    };
  }
}

function safeJson(payload: unknown): string {
  try {
    return JSON.stringify(payload, null, 2);
  } catch {
    return '{}';
  }
}
