"use client";

import * as React from "react";
import { FileText, Download, Upload } from "lucide-react";
import { api } from "@/lib/api/client";
import { useApi } from "@/lib/api/use-api";
import { Section } from "@/components/leads/shared";
import { shortDate } from "@/components/dashboards/financials/format";

interface DocRow {
  id: string;
  fileName: string;
  contentType: string | null;
  sizeBytes: number | null;
  createdAt: string;
  saleId: string;
  saleRef: string | null;
  customerName: string | null;
}

interface JobRow {
  id: string;
  sale: {
    saleRef: string | null;
    lead: { firstName: string; surName: string } | null;
  } | null;
}

// Each installation maps to a sale; documents are stored against the sale.
interface JobWithSale extends JobRow {
  saleId?: string;
}

function fileSize(n: number | null): string {
  if (!n) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export function DocumentsTab() {
  const docs = useApi<DocRow[]>("/installations/documents");
  const jobs = useApi<(JobWithSale & { saleId: string })[]>("/installations");
  const [saleId, setSaleId] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);
  const fileRef = React.useRef<HTMLInputElement>(null);

  const jobOptions =
    jobs.data?.map((j: any) => ({
      saleId: j.saleId ?? j.sale?.id ?? "",
      label:
        j.sale?.saleRef ??
        (j.sale?.lead
          ? `${j.sale.lead.firstName} ${j.sale.lead.surName}`
          : j.id.slice(0, 8)),
    })) ?? [];

  const upload = async (file: File) => {
    const target = saleId || jobOptions[0]?.saleId;
    if (!target) {
      setErr("Select a job to attach the document to");
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      const { uploadUrl } = await api<{ uploadUrl: string }>(
        "/storage/upload-url",
        {
          method: "POST",
          body: JSON.stringify({
            entity: "Sale",
            entityId: target,
            fileName: file.name,
            contentType: file.type || "application/octet-stream",
          }),
        },
      );
      const put = await fetch(uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": file.type || "application/octet-stream" },
        body: file,
      });
      if (!put.ok) throw new Error("Upload to storage failed");
      await docs.reload();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const download = async (id: string) => {
    try {
      const { downloadUrl } = await api<{ downloadUrl: string }>(
        `/storage/documents/${id}/download-url`,
      );
      window.open(downloadUrl, "_blank", "noopener");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not get download link");
    }
  };

  const rows = docs.data ?? [];

  return (
    <div className="space-y-6">
      <Section
        title="Upload a Document"
        description="Attach install photos, sign-off sheets or compliance docs to a job."
      >
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-xs">
            <span className="text-muted-foreground">Job</span>
            <select
              value={saleId}
              onChange={(e) => setSaleId(e.target.value)}
              className="min-w-48 rounded-md border bg-card px-2 py-1.5 text-sm"
            >
              <option value="">
                {jobOptions.length ? "Select a job…" : "No jobs available"}
              </option>
              {jobOptions.map((o) => (
                <option key={o.saleId} value={o.saleId}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          <input
            ref={fileRef}
            type="file"
            disabled={busy || jobOptions.length === 0}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) upload(f);
            }}
            className="hidden"
            id="installer-doc-upload"
          />
          <label
            htmlFor="installer-doc-upload"
            className={`inline-flex cursor-pointer items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 ${
              busy || jobOptions.length === 0 ? "pointer-events-none opacity-50" : ""
            }`}
          >
            <Upload className="h-4 w-4" />
            {busy ? "Uploading…" : "Choose File"}
          </label>
        </div>
        {err && <p className="mt-2 text-xs text-destructive">{err}</p>}
      </Section>

      <Section title="Documents" flush>
        {docs.loading ? (
          <p className="p-5 text-sm text-muted-foreground">Loading documents…</p>
        ) : rows.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            No documents uploaded yet.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-5 py-2.5 font-medium">File</th>
                  <th className="px-5 py-2.5 font-medium">Job</th>
                  <th className="px-5 py-2.5 font-medium">Size</th>
                  <th className="px-5 py-2.5 font-medium">Uploaded</th>
                  <th className="px-5 py-2.5 font-medium" />
                </tr>
              </thead>
              <tbody className="divide-y">
                {rows.map((d) => (
                  <tr key={d.id} className="hover:bg-muted/30">
                    <td className="px-5 py-2.5">
                      <span className="flex items-center gap-2">
                        <FileText className="h-4 w-4 text-muted-foreground" />
                        {d.fileName}
                      </span>
                    </td>
                    <td className="px-5 py-2.5 text-muted-foreground">
                      {d.saleRef ?? d.customerName ?? "—"}
                    </td>
                    <td className="px-5 py-2.5 tabular-nums text-muted-foreground">
                      {fileSize(d.sizeBytes)}
                    </td>
                    <td className="px-5 py-2.5 text-muted-foreground">
                      {shortDate(
                        typeof d.createdAt === "string"
                          ? d.createdAt.slice(0, 10)
                          : d.createdAt,
                      )}
                    </td>
                    <td className="px-5 py-2.5 text-right">
                      <button
                        type="button"
                        onClick={() => download(d.id)}
                        className="inline-flex items-center gap-1 rounded-md border px-3 py-1 text-xs font-medium hover:bg-accent"
                      >
                        <Download className="h-3.5 w-3.5" />
                        Download
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>
    </div>
  );
}
