// ─────────────────────────────────────────────────────────────────────────────
// nova-briefing — Nova's personalised "what's happening" greeting.
//
// When a user opens the app, Nova greets them once a day with a short, spoken
// overview tailored to their role: a CEO hears the week's sales, the top and
// the underperforming consultant / lead-gen, pipeline and pending approvals; an
// admin hears their pending tasks; a consultant hears their own week and today's
// appointments, and so on.
//
// Design (same discipline as the rest of Nova):
//   1. Gather REAL numbers server-side through the scoped services / Prisma —
//      every figure is filtered by the caller's RBAC visibility scope.
//   2. Hand those facts to Claude and let Nova NARRATE them in her voice. She
//      never invents data; she only phrases the facts we computed.
//   3. Dedupe to once per user per day via a NovaUsageLog row (status
//      'briefing'), so a refresh doesn't re-pop or re-charge.
// ─────────────────────────────────────────────────────────────────────────────

import { Injectable, Logger } from '@nestjs/common';
import { ROLES, LeadStage, SaleStatus } from '@astra/shared';
import { PrismaService } from '../prisma/prisma.service';
import { ScopeService } from '../common/scope.service';
import { AnalyticsService } from '../analytics/analytics.service';
import { NovaAnthropicService } from './nova-anthropic.service';
import { NovaKnowledgeService } from './nova-knowledge.service';
import { NOVA_CORE } from './nova-prompt';
import type { AuthUser } from '../common/auth-user';

export interface BriefingResult {
  /** true → freshly generated this open (show + speak it); false → already shown today / unavailable. */
  fresh: boolean;
  text: string | null;
  role: string;
}

// Highest-priority role first — a user with several roles is briefed as their
// most senior one.
const ROLE_PRIORITY: string[] = [
  ROLES.SUPER_ADMIN,
  ROLES.CEO,
  ROLES.FINANCE,
  ROLES.OPERATIONS_MANAGER,
  ROLES.SALES_MANAGER,
  ROLES.SALES_CONSULTANT,
  ROLES.LEAD_GEN,
  ROLES.ADMIN_OFFICER,
  ROLES.INSTALLER,
  ROLES.CUSTOMER,
];

const ROLE_LABEL: Record<string, string> = {
  [ROLES.SUPER_ADMIN]: 'Super Admin',
  [ROLES.CEO]: 'CEO',
  [ROLES.FINANCE]: 'Finance',
  [ROLES.OPERATIONS_MANAGER]: 'Operations Manager',
  [ROLES.SALES_MANAGER]: 'Sales Manager',
  [ROLES.SALES_CONSULTANT]: 'Sales Consultant',
  [ROLES.LEAD_GEN]: 'Lead Generation',
  [ROLES.ADMIN_OFFICER]: 'Admin Officer',
  [ROLES.INSTALLER]: 'Installer',
  [ROLES.CUSTOMER]: 'Customer',
};

@Injectable()
export class NovaBriefingService {
  private readonly logger = new Logger(NovaBriefingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly scope: ScopeService,
    private readonly analytics: AnalyticsService,
    private readonly anthropic: NovaAnthropicService,
    private readonly knowledge: NovaKnowledgeService,
  ) {}

  // ── public entry ────────────────────────────────────────────────────────────
  async briefing(user: AuthUser): Promise<BriefingResult> {
    const role = this.primaryRole(user.roleKeys);

    // Nova needs Claude to narrate; if she's not configured there's no briefing.
    if (!this.anthropic.configured) return { fresh: false, text: null, role };

    // Once per day: skip if we've already delivered a briefing to this user today.
    try {
      const since = startOfDay(new Date());
      const already = await this.prisma.novaUsageLog.findFirst({
        where: { userId: user.id, status: 'briefing', createdAt: { gte: since } },
        select: { id: true },
      });
      if (already) return { fresh: false, text: null, role };
    } catch {
      /* if the check fails, fall through and still try to brief */
    }

    let facts: Record<string, any> = {};
    try {
      facts = await this.gather(user, role);
    } catch (e: any) {
      this.logger.warn(`briefing gather failed: ${e?.message}`);
      facts = {};
    }

    let text: string;
    let inputTokens = 0;
    let outputTokens = 0;
    let model: string | undefined;
    try {
      const out = await this.narrate(user, role, facts);
      text = out.text;
      inputTokens = out.inputTokens;
      outputTokens = out.outputTokens;
      model = out.model;
    } catch (e: any) {
      this.logger.error(`briefing narrate failed: ${e?.message}`);
      return { fresh: false, text: null, role };
    }

    // Record delivery (also serves as the once-a-day marker + cost/audit row).
    try {
      await this.prisma.novaUsageLog.create({
        data: {
          userId: user.id,
          status: 'briefing',
          model: model ?? null,
          inputTokens,
          outputTokens,
          toolCalls: 0,
        },
      });
    } catch (e: any) {
      this.logger.warn(`briefing usage log failed: ${e?.message}`);
    }

    return { fresh: true, text, role };
  }

  // ── role resolution ───────────────────────────────────────────────────────
  private primaryRole(roleKeys: string[]): string {
    for (const r of ROLE_PRIORITY) if (roleKeys?.includes(r)) return r;
    return roleKeys?.[0] || ROLES.CUSTOMER;
  }

  // ── fact gathering (all scoped) ─────────────────────────────────────────────
  private async gather(user: AuthUser, role: string): Promise<Record<string, any>> {
    const now = new Date();
    const weekStart = startOfWeekMonday(now);
    const range = { from: weekStart.toISOString(), to: now.toISOString() };
    const weekLabel = `${fmtDate(weekStart)} – ${fmtDate(now)}`;

    const f: Record<string, any> = {
      today: fmtDate(now),
      weekRange: weekLabel,
      user: user.name,
      role: ROLE_LABEL[role] ?? role,
    };

    const isLeadership =
      role === ROLES.SUPER_ADMIN || role === ROLES.CEO || role === ROLES.SALES_MANAGER;

    if (isLeadership) {
      f.summaryThisWeek = await this.safe(() => this.analytics.summary(user, range));
      f.consultantPerformanceThisWeek = await this.safe(() =>
        this.weeklyConsultantPerf(user, weekStart, now),
      );
      f.leadGenPerformanceThisWeek = await this.safe(() =>
        this.weeklyLeadGenPerf(user, weekStart, now),
      );
      f.pendingApprovals = await this.safe(async () =>
        (await this.analytics.approvalsQueue(user)).length,
      );
    } else if (role === ROLES.FINANCE) {
      f.revenueThisWeek = await this.safe(() => this.analytics.revenue(user, range));
      f.pendingApprovals = await this.safe(async () =>
        (await this.analytics.approvalsQueue(user)).length,
      );
      f.commissionsByConsultantThisWeek = await this.safe(() =>
        this.analytics.commissionSummary(user, range),
      );
    } else if (role === ROLES.OPERATIONS_MANAGER) {
      f.operations = await this.safe(() => this.analytics.operations(user, {}));
      f.installsThisWeek = await this.safe(() => this.installsInRange(user, weekStart, now));
      f.unfinishedTasks = await this.safe(() => this.boardTaskHealth(user));
      f.pendingApprovals = await this.safe(async () =>
        (await this.analytics.approvalsQueue(user)).length,
      );
    } else if (role === ROLES.ADMIN_OFFICER) {
      f.myPendingTasks = await this.safe(() => this.myPendingTasks(user.id));
      f.pendingApprovals = await this.safe(async () =>
        (await this.analytics.approvalsQueue(user)).length,
      );
    } else if (role === ROLES.SALES_CONSULTANT) {
      f.mySalesThisWeek = await this.safe(() =>
        this.analytics.summary(user, { ...range, userId: user.id }),
      );
      f.myAppointmentsToday = await this.safe(() => this.appointmentsToday(user.id));
      f.myOpenLeads = await this.safe(() => this.openLeadCount(user, user.id));
    } else if (role === ROLES.LEAD_GEN) {
      f.myLeadsThisWeek = await this.safe(() => this.leadGenOwnWeek(user.id, weekStart, now));
      f.bookingsMadeToday = await this.safe(() => this.bookingsBookedToday(user.id));
    } else if (role === ROLES.INSTALLER) {
      f.myInstallsToday = await this.safe(() => this.installerToday(user.id));
      f.myInstallsThisWeek = await this.safe(() => this.installerWeek(user.id, weekStart, now));
    } else {
      // Customer / fallback: greet warmly, offer help. No internal figures.
      f.note = 'No internal metrics for this role — greet warmly and offer help.';
    }

    return f;
  }

  // ── narration (Nova phrases the facts) ──────────────────────────────────────
  private async narrate(
    user: AuthUser,
    role: string,
    facts: Record<string, any>,
  ): Promise<{ text: string; inputTokens: number; outputTokens: number; model: string }> {
    const roleLabel = ROLE_LABEL[role] ?? role;
    const system =
      NOVA_CORE +
      '\n═══ DAILY BRIEFING ═══\n' +
      `Produce ${user.name}'s daily opening briefing. Role: ${roleLabel}. ` +
      'It is shown on screen AND read aloud, so keep it tight and natural.\n' +
      'FORMAT: open with a short warm greeting using their first name, then 3–6 short sentences ' +
      'covering the most important, SPECIFIC points from FACTS — real numbers, names and dates. ' +
      'Lead with wins, then flag anything needing attention (underperformers, overdue tasks, pending approvals). ' +
      'Finish with a brief offer to help (e.g. "Want me to dig into any of these?").\n' +
      'RULES: Aussie English, warm and direct, under ~120 words. Only use what is in FACTS — never invent ' +
      'numbers, names or trends. If a figure is 0 or missing, either skip it or say it plainly. ' +
      'No markdown headings or long lists; at most a couple of **bold** key figures. ' +
      'Do not output any [LEARN::] tags.\n' +
      '\nFACTS (JSON):\n' +
      safeJson(facts) +
      '\n';

    const resp = await this.anthropic.createMessage({
      model: this.anthropic.smartModel,
      max_tokens: 700,
      system,
      messages: [{ role: 'user', content: 'Give me my briefing.' }],
    });

    const raw = resp.content
      .filter((b: any) => b.type === 'text')
      .map((b: any) => b.text)
      .join('')
      .trim();
    const { clean } = this.knowledge.parseLearnTags(raw);

    return {
      text: clean || raw,
      inputTokens: resp.usage?.input_tokens || 0,
      outputTokens: resp.usage?.output_tokens || 0,
      model: resp.model || this.anthropic.smartModel,
    };
  }

  // ── data helpers (every query is scope-filtered) ────────────────────────────

  /** Per-consultant sales for the week, scoped; returns top + bottom performers. */
  private async weeklyConsultantPerf(user: AuthUser, from: Date, to: Date) {
    const where: any = await this.scope.saleWhere(user);
    where.saleDate = { gte: from, lte: to };
    const grouped = await this.prisma.sale.groupBy({
      by: ['ownerId'],
      where,
      _sum: { soldPrice: true },
      _count: { _all: true },
    });
    if (grouped.length === 0) return { consultants: 0, rows: [] };
    const names = await this.nameMap(grouped.map((g) => g.ownerId));
    const rows = grouped
      .map((g) => ({
        name: names.get(g.ownerId) ?? 'Unknown',
        sales: g._count._all,
        totalSold: Number(g._sum.soldPrice ?? 0),
      }))
      .sort((a, b) => b.totalSold - a.totalSold);
    return {
      consultants: rows.length,
      topPerformer: rows[0],
      lowestPerformer: rows[rows.length - 1],
      rows: rows.slice(0, 8),
    };
  }

  /** Per-lead-gen leads + conversion for the week, scoped; top + lowest converter. */
  private async weeklyLeadGenPerf(user: AuthUser, from: Date, to: Date) {
    const base: any = await this.scope.leadWhere(user);
    const where = { ...base, timestamp: { gte: from, lte: to } };
    const [generated, converted] = await Promise.all([
      this.prisma.lead.groupBy({ by: ['leadGenId'], where, _count: { _all: true } }),
      this.prisma.lead.groupBy({
        by: ['leadGenId'],
        where: { ...where, stage: LeadStage.CONVERTED },
        _count: { _all: true },
      }),
    ]);
    if (generated.length === 0) return { leadGens: 0, rows: [] };
    const convOf = new Map(converted.map((c) => [c.leadGenId, c._count._all]));
    const names = await this.nameMap(generated.map((g) => g.leadGenId));
    const rows = generated
      .map((g) => {
        const gen = g._count._all;
        const conv = convOf.get(g.leadGenId) ?? 0;
        return {
          name: names.get(g.leadGenId) ?? 'Unknown',
          leads: gen,
          converted: conv,
          conversionRate: gen > 0 ? round2(conv / gen) : 0,
        };
      })
      .sort((a, b) => b.leads - a.leads);
    return {
      leadGens: rows.length,
      mostLeads: rows[0],
      fewestLeads: rows[rows.length - 1],
      rows: rows.slice(0, 8),
    };
  }

  /** Task cards assigned to one user that aren't done, with overdue count. */
  private async myPendingTasks(userId: string) {
    const cards = await this.prisma.taskCard.findMany({
      where: { assigneeId: userId, completed: false, parentId: null },
      select: { title: true, priority: true, dueDate: true, deadline: true },
      orderBy: [{ priority: 'desc' }, { dueDate: 'asc' }],
      take: 50,
    });
    const today = startOfDay(new Date());
    const overdue = cards.filter((c) => {
      const d = c.dueDate ?? c.deadline;
      return d && new Date(d) < today;
    }).length;
    return {
      total: cards.length,
      overdue,
      top: cards.slice(0, 5).map((c) => ({
        title: c.title,
        priority: c.priority,
        due: c.dueDate ? fmtDate(c.dueDate) : c.deadline ? fmtDate(c.deadline) : null,
      })),
    };
  }

  /** Board-wide unfinished + unassigned task counts (ops view). */
  private async boardTaskHealth(_user: AuthUser) {
    const [open, unassigned, overdue] = await Promise.all([
      this.prisma.taskCard.count({ where: { completed: false, parentId: null } }),
      this.prisma.taskCard.count({
        where: { completed: false, parentId: null, assigneeId: null },
      }),
      this.prisma.taskCard.count({
        where: { completed: false, parentId: null, dueDate: { lt: startOfDay(new Date()) } },
      }),
    ]);
    return { open, unassigned, overdue };
  }

  private async appointmentsToday(consultantId: string) {
    const { start, end } = dayBounds(new Date());
    const appts = await this.prisma.appointment.findMany({
      where: { consultantId, date: { gte: start, lt: end } },
      select: { hour: true, minute: true, customerName: true, company: true },
      orderBy: [{ hour: 'asc' }, { minute: 'asc' }],
      take: 20,
    });
    return {
      count: appts.length,
      slots: appts.map((a) => ({
        time: `${String(a.hour).padStart(2, '0')}:${String(a.minute).padStart(2, '0')}`,
        customer: a.customerName ?? null,
        company: a.company ?? null,
      })),
    };
  }

  private async openLeadCount(user: AuthUser, userId: string) {
    const base: any = await this.scope.leadWhere(user, userId);
    const total = await this.prisma.lead.count({
      where: { ...base, stage: { notIn: [LeadStage.CONVERTED] as any } },
    });
    return { open: total };
  }

  private async leadGenOwnWeek(leadGenId: string, from: Date, to: Date) {
    const where = { leadGenId, timestamp: { gte: from, lte: to } };
    const [leads, converted] = await Promise.all([
      this.prisma.lead.count({ where }),
      this.prisma.lead.count({ where: { ...where, stage: LeadStage.CONVERTED } }),
    ]);
    return { leads, converted, conversionRate: leads > 0 ? round2(converted / leads) : 0 };
  }

  private async bookingsBookedToday(userId: string) {
    const { start, end } = dayBounds(new Date());
    const count = await this.prisma.booking.count({
      where: { bookedById: userId, createdAt: { gte: start, lt: end } },
    });
    return { count };
  }

  private async installsInRange(user: AuthUser, from: Date, to: Date) {
    const where: any = await this.scope.installationWhere(user);
    const [scheduled, completed] = await Promise.all([
      this.prisma.installation.count({
        where: { ...where, installDate: { gte: from, lte: to } },
      }),
      this.prisma.installation.count({
        where: { ...where, status: 'COMPLETED' as any, completedAt: { gte: from, lte: to } },
      }),
    ]);
    return { scheduledThisWeek: scheduled, completedThisWeek: completed };
  }

  private async installerToday(installerId: string) {
    const { start, end } = dayBounds(new Date());
    const rows = await this.prisma.installation.findMany({
      where: { installerId, installDate: { gte: start, lt: end } },
      select: { status: true, sale: { select: { saleRef: true } } },
      take: 20,
    });
    return { count: rows.length, jobs: rows.map((r) => ({ ref: r.sale?.saleRef ?? null, status: r.status })) };
  }

  private async installerWeek(installerId: string, from: Date, to: Date) {
    const count = await this.prisma.installation.count({
      where: { installerId, installDate: { gte: from, lte: to } },
    });
    return { scheduled: count };
  }

  // ── small utilities ─────────────────────────────────────────────────────────
  private async nameMap(ids: string[]): Promise<Map<string, string>> {
    const unique = [...new Set(ids.filter(Boolean))];
    if (unique.length === 0) return new Map();
    const users = await this.prisma.user.findMany({
      where: { id: { in: unique } },
      select: { id: true, name: true },
    });
    return new Map(users.map((u) => [u.id, u.name]));
  }

  /** Run a gatherer, swallowing errors so one bad section never sinks the briefing. */
  private async safe<T>(fn: () => Promise<T>): Promise<T | null> {
    try {
      return await fn();
    } catch (e: any) {
      this.logger.warn(`briefing section failed: ${e?.message}`);
      return null;
    }
  }
}

// ── module-level helpers ──────────────────────────────────────────────────────
function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function dayBounds(d: Date): { start: Date; end: Date } {
  const start = startOfDay(d);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { start, end };
}

function startOfWeekMonday(d: Date): Date {
  const x = startOfDay(d);
  const day = x.getDay(); // 0 Sun … 6 Sat
  const diff = day === 0 ? -6 : 1 - day;
  x.setDate(x.getDate() + diff);
  return x;
}

function fmtDate(d: Date | string): string {
  const x = new Date(d);
  return x.toISOString().slice(0, 10);
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function safeJson(payload: unknown): string {
  try {
    return JSON.stringify(payload, (_k, v) => (typeof v === 'bigint' ? Number(v) : v), 2);
  } catch {
    return '{}';
  }
}
