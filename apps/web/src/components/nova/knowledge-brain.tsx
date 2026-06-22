"use client";

import { useCallback, useEffect, useState } from "react";
import { Sparkles, Plus, Trash2, BookOpen, Brain, Loader2, SlidersHorizontal } from "lucide-react";
import { apiGet, apiPost, apiDelete } from "@/lib/api/client";
import { NovaSettingsPanel } from "./nova-settings-panel";

interface KbEntry {
  id: string;
  category: string;
  question: string;
  answer: string;
  tags: string[];
  source?: string | null;
  status: string;
  updatedAt: string;
}
interface MemoryFact {
  id: string;
  category: string;
  fact: string;
  createdBy?: string | null;
  createdAt: string;
}

type Tab = "kb" | "memory" | "settings";

/**
 * Nova Knowledge Brain — curate the AI's knowledge base and learned memory.
 * All writes hit /api/v1/nova/* which enforces nova:manage server-side.
 */
export function KnowledgeBrain() {
  const [tab, setTab] = useState<Tab>("kb");
  const [kb, setKb] = useState<KbEntry[]>([]);
  const [mem, setMem] = useState<MemoryFact[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // KB form
  const [category, setCategory] = useState("");
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [tags, setTags] = useState("");
  const [source, setSource] = useState("");
  // Memory form
  const [memCategory, setMemCategory] = useState("");
  const [memFact, setMemFact] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [kbRes, memRes] = await Promise.all([
        apiGet<KbEntry[]>("/nova/knowledge"),
        apiGet<MemoryFact[]>("/nova/memory"),
      ]);
      setKb(kbRes);
      setMem(memRes);
    } catch {
      /* surfaced by empty state */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function addKb() {
    if (!category.trim() || !question.trim() || !answer.trim() || saving) return;
    setSaving(true);
    try {
      await apiPost("/nova/knowledge", {
        category: category.trim(),
        question: question.trim(),
        answer: answer.trim(),
        tags: tags.split(",").map((t) => t.trim()).filter(Boolean),
        source: source.trim() || undefined,
      });
      setCategory(""); setQuestion(""); setAnswer(""); setTags(""); setSource("");
      await load();
    } finally {
      setSaving(false);
    }
  }

  async function deprecateKb(id: string) {
    await apiDelete(`/nova/knowledge/${id}`);
    setKb((k) => k.filter((e) => e.id !== id));
  }

  async function addMemory() {
    if (!memCategory.trim() || !memFact.trim() || saving) return;
    setSaving(true);
    try {
      await apiPost("/nova/memory", { category: memCategory.trim(), fact: memFact.trim() });
      setMemCategory(""); setMemFact("");
      await load();
    } finally {
      setSaving(false);
    }
  }

  async function forget(id: string) {
    await apiDelete(`/nova/memory/${id}`);
    setMem((m) => m.filter((e) => e.id !== id));
  }

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-6 flex items-center gap-2">
        <Sparkles className="h-6 w-6 text-sky-500" />
        <h1 className="text-xl font-semibold">Nova Knowledge Brain</h1>
      </div>

      <div className="mb-5 flex gap-2">
        <TabButton active={tab === "kb"} onClick={() => setTab("kb")} icon={<BookOpen className="h-4 w-4" />}>
          Knowledge base ({kb.length})
        </TabButton>
        <TabButton active={tab === "memory"} onClick={() => setTab("memory")} icon={<Brain className="h-4 w-4" />}>
          Learned memory ({mem.length})
        </TabButton>
        <TabButton active={tab === "settings"} onClick={() => setTab("settings")} icon={<SlidersHorizontal className="h-4 w-4" />}>
          Voice &amp; Avatar
        </TabButton>
      </div>

      {tab === "settings" ? (
        <NovaSettingsPanel />
      ) : loading ? (
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading…
        </div>
      ) : tab === "kb" ? (
        <div className="space-y-6">
          <div className="rounded-lg border bg-card p-4">
            <h2 className="mb-3 text-sm font-medium">Add a knowledge entry</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <input className="input" placeholder="Category (e.g. rebates)" value={category} onChange={(e) => setCategory(e.target.value)} />
              <input className="input" placeholder="Tags (comma separated)" value={tags} onChange={(e) => setTags(e.target.value)} />
            </div>
            <input className="input mt-3 w-full" placeholder="Question" value={question} onChange={(e) => setQuestion(e.target.value)} />
            <textarea className="input mt-3 w-full" rows={3} placeholder="Answer (verified fact)" value={answer} onChange={(e) => setAnswer(e.target.value)} />
            <input className="input mt-3 w-full" placeholder="Source (optional)" value={source} onChange={(e) => setSource(e.target.value)} />
            <button onClick={addKb} disabled={saving} className="mt-3 inline-flex items-center gap-1.5 rounded-md bg-sky-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-50">
              <Plus className="h-4 w-4" /> Add entry
            </button>
          </div>

          <div className="space-y-2">
            {kb.length === 0 && <Empty>No knowledge entries yet. Add one above, or run the Firebase migration.</Empty>}
            {kb.map((e) => (
              <div key={e.id} className="rounded-lg border bg-card p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <span className="rounded bg-sky-500/10 px-1.5 py-0.5 text-[11px] font-medium text-sky-600">{e.category}</span>
                    <p className="mt-1 font-medium">{e.question}</p>
                    <p className="mt-1 text-sm text-muted-foreground">{e.answer}</p>
                  </div>
                  <button onClick={() => deprecateKb(e.id)} title="Deprecate" className="shrink-0 rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-destructive">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          <div className="rounded-lg border bg-card p-4">
            <h2 className="mb-3 text-sm font-medium">Teach Nova a fact</h2>
            <div className="grid gap-3 sm:grid-cols-3">
              <input className="input sm:col-span-1" placeholder="Category" value={memCategory} onChange={(e) => setMemCategory(e.target.value)} />
              <input className="input sm:col-span-2" placeholder="The fact to remember" value={memFact} onChange={(e) => setMemFact(e.target.value)} />
            </div>
            <button onClick={addMemory} disabled={saving} className="mt-3 inline-flex items-center gap-1.5 rounded-md bg-sky-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-50">
              <Plus className="h-4 w-4" /> Remember
            </button>
          </div>

          <div className="space-y-2">
            {mem.length === 0 && <Empty>Nothing learned yet. Nova writes facts here automatically when staff teach her in chat.</Empty>}
            {mem.map((m) => (
              <div key={m.id} className="flex items-start justify-between gap-3 rounded-lg border bg-card p-3">
                <div className="min-w-0">
                  <span className="rounded bg-emerald-500/10 px-1.5 py-0.5 text-[11px] font-medium text-emerald-600">{m.category}</span>
                  <p className="mt-1 text-sm">{m.fact}</p>
                </div>
                <button onClick={() => forget(m.id)} title="Forget" className="shrink-0 rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-destructive">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <style jsx>{`
        .input {
          border: 1px solid hsl(var(--border));
          background: hsl(var(--background));
          border-radius: 0.5rem;
          padding: 0.5rem 0.75rem;
          font-size: 0.875rem;
        }
        .input:focus {
          outline: none;
          box-shadow: 0 0 0 1px rgb(14 165 233);
        }
      `}</style>
    </div>
  );
}

function TabButton({ active, onClick, icon, children }: { active: boolean; onClick: () => void; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={
        "inline-flex items-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium " +
        (active ? "bg-sky-600 text-white" : "border bg-card text-muted-foreground hover:text-foreground")
      }
    >
      {icon}
      {children}
    </button>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div className="rounded-lg border border-dashed bg-card p-6 text-center text-sm text-muted-foreground">{children}</div>;
}
