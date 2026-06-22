"use client";

import * as React from "react";

export interface EditField {
  key: string;
  label: string;
  type?: "number" | "text" | "date";
  value: string | number;
  prefix?: string;
  step?: string;
}

interface Props {
  title: string;
  fields: EditField[];
  onCancel: () => void;
  onSave: (values: Record<string, string>) => void;
}

/**
 * Generic field-list editor — the React replacement for v1's chained
 * window.prompt() editors (fsEditSolarPrice, fsEditFinanceProduct, …).
 * All fields shown at once instead of one prompt per value.
 */
export function EditDialog({ title, fields, onCancel, onSave }: Props) {
  const [values, setValues] = React.useState<Record<string, string>>(() =>
    Object.fromEntries(fields.map((f) => [f.key, String(f.value)])),
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-md rounded-xl border bg-card p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="mb-4 text-base font-semibold tracking-tight">{title}</h3>
        <div className="space-y-3">
          {fields.map((f) => (
            <label key={f.key} className="block">
              <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {f.label}
              </span>
              <div className="flex items-center gap-2">
                {f.prefix && (
                  <span className="text-sm text-muted-foreground">{f.prefix}</span>
                )}
                <input
                  type={f.type ?? "number"}
                  step={f.step ?? (f.type === "number" || !f.type ? "0.01" : undefined)}
                  value={values[f.key]}
                  onChange={(e) =>
                    setValues((v) => ({ ...v, [f.key]: e.target.value }))
                  }
                  className="w-full rounded-md border bg-background px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                />
              </div>
            </label>
          ))}
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => onSave(values)}
            className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
