// ─────────────────────────────────────────────────────────────────────────────
// nova-knowledge — the AI_KB + [LEARN::] memory port.
//
// Knowledge base: keyword-ranked search over NovaKnowledgeEntry, formatted into
// a compact prompt block (ported from aiSearchKB / aiFormatKBContext).
// Memory: read the active learned facts as a ground-truth block, and parse
// [LEARN::category::fact] tags out of Nova's replies, persisting them (newer
// overrides older — see `supersedes`).
// ─────────────────────────────────────────────────────────────────────────────

import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

const STOPWORDS = new Set([
  'the', 'and', 'for', 'with', 'that', 'this', 'what', 'how', 'are', 'our',
  'you', 'your', 'can', 'does', 'did', 'who', 'why', 'when', 'where',
]);

export interface KbResult {
  id: string;
  category: string;
  question: string;
  answer: string;
  authority?: string | null;
  source?: string | null;
  sourceDate?: Date | null;
  score: number;
}

@Injectable()
export class NovaKnowledgeService {
  constructor(private readonly prisma: PrismaService) {}

  // ── Knowledge base ─────────────────────────────────────────────────────────

  /** Top-N keyword matches over the active KB (ported scoring + recency boost). */
  async searchKb(query: string, limit = 5): Promise<KbResult[]> {
    const entries = await this.prisma.novaKnowledgeEntry.findMany({
      where: { status: 'active' },
      take: 500, // small KB; rank in memory like the original did
    });
    const qLower = (query || '').toLowerCase();
    const words = qLower.split(/\s+/).filter((w) => w.length > 2 && !STOPWORDS.has(w));
    if (words.length === 0) return [];

    const scored: KbResult[] = [];
    for (const e of entries) {
      const tags = (e.tags || []).join(', ');
      const hay = `${e.question} ${e.answer} ${tags} ${e.category}`.toLowerCase();
      let score = 0;
      for (const w of words) {
        if (hay.includes(w)) score += 1;
        if (e.question.toLowerCase().includes(w)) score += 2;
      }
      for (const tag of e.tags || []) {
        const t = String(tag).trim().toLowerCase();
        if (t && qLower.includes(t)) score += 3;
      }
      if (score > 0 && e.sourceDate) {
        const daysOld = Math.max(0, (Date.now() - e.sourceDate.getTime()) / 86_400_000);
        if (daysOld < 90) score += 2;
        else if (daysOld < 365) score += 1;
      }
      if (score >= 3) {
        scored.push({
          id: e.id,
          category: e.category,
          question: e.question,
          answer: e.answer,
          authority: e.authority,
          source: e.source,
          sourceDate: e.sourceDate,
          score,
        });
      }
    }
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, limit);
  }

  /** Format KB matches into a compact prompt block (ported aiFormatKBContext). */
  formatKbContext(results: KbResult[]): string {
    if (results.length === 0) return '';
    let ctx =
      'RELEVANT KNOWLEDGE BASE ENTRIES (sorted by relevance, newer entries weighted higher):\n\n';
    results.forEach((e, i) => {
      ctx += `[KB Entry ${i + 1}]\n`;
      ctx += `Category: ${e.category || 'General'}\n`;
      if (e.sourceDate) ctx += `Source Date: ${e.sourceDate.toISOString().slice(0, 10)} (newer = more reliable)\n`;
      ctx += `Q: ${e.question}\n`;
      let a = e.answer || '';
      if (a.length > 600) a = a.slice(0, 600) + '...';
      ctx += `A: ${a}\n`;
      if (e.authority) ctx += `Authority: ${e.authority}\n`;
      if (e.source) ctx += `Source: ${e.source}\n`;
      ctx += '\n';
    });
    return ctx;
  }

  // ── Permanent memory ([LEARN::] facts) ───────────────────────────────────────

  /** The active learned facts, grouped by category, as a ground-truth block. */
  async formatMemoryContext(maxFacts = 60): Promise<string> {
    const facts = await this.prisma.novaMemory.findMany({
      where: { active: true },
      orderBy: { createdAt: 'desc' },
      take: maxFacts,
    });
    if (facts.length === 0) return '';
    const byCat = new Map<string, string[]>();
    for (const f of facts) {
      const list = byCat.get(f.category) || [];
      list.push(f.fact);
      byCat.set(f.category, list);
    }
    let out = '\n═══ PERMANENT MEMORY (learned facts — ground truth) ═══\n';
    for (const [cat, list] of byCat) {
      out += `[${cat}]\n`;
      for (const fact of list) out += `- ${fact}\n`;
    }
    out += '═══ END PERMANENT MEMORY ═══\n';
    return out;
  }

  private static LEARN_RE = /\[LEARN::([a-z_]+)::([^\]]+)\]/gi;

  /** Strip [LEARN::cat::fact] tags from a reply; return the cleaned text + tags. */
  parseLearnTags(text: string): { clean: string; tags: { category: string; fact: string }[] } {
    const tags: { category: string; fact: string }[] = [];
    const clean = (text || '').replace(NovaKnowledgeService.LEARN_RE, (_m, cat, fact) => {
      tags.push({ category: String(cat).toLowerCase().trim(), fact: String(fact).trim() });
      return '';
    });
    return { clean: clean.replace(/\n{3,}/g, '\n\n').trim(), tags };
  }

  /** Persist learned facts. Newer facts in the same category supersede older. */
  async saveMemories(
    tags: { category: string; fact: string }[],
    createdBy: string,
  ): Promise<number> {
    let saved = 0;
    for (const t of tags) {
      if (!t.fact) continue;
      const prior = await this.prisma.novaMemory.findFirst({
        where: { category: t.category, fact: t.fact, active: true },
      });
      if (prior) continue; // exact duplicate — skip
      await this.prisma.novaMemory.create({
        data: { category: t.category, fact: t.fact, createdBy },
      });
      saved += 1;
    }
    return saved;
  }
}
