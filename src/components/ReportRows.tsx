"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

export type ReportRow = {
  rowNumber: number;
  section: string;
  item: string;
  comment: string;
  status: "Imported" | "Edited" | "Removed" | "Not placed" | "Blank row" | "Item only";
  commentId: string | null;
  issues: string[];
};

const STATUS_STYLE: Record<ReportRow["status"], string> = {
  Imported: "bg-accent-soft text-accent",
  Edited: "bg-info-soft text-info",
  Removed: "bg-limit-soft text-limit",
  "Not placed": "bg-defect-soft text-defect",
  "Blank row": "bg-background text-muted",
  "Item only": "bg-background text-muted",
};

const FILTERS = {
  All: () => true,
  Flagged: (r: ReportRow) => r.issues.length > 0,
  Changed: (r: ReportRow) => r.status === "Edited" || r.status === "Removed",
  "Not placed": (r: ReportRow) => r.status === "Not placed",
};

export function ReportRows({ rows, templateId }: { rows: ReportRow[]; templateId: string }) {
  const [filter, setFilter] = useState<keyof typeof FILTERS>("All");
  const [query, setQuery] = useState("");
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter(FILTERS[filter]).filter((r) => !q || `${r.section} ${r.item} ${r.comment}`.toLowerCase().includes(q));
  }, [rows, filter, query]);

  return (
    <div className="mt-3">
      <div className="flex flex-wrap items-center gap-2">
        {(Object.keys(FILTERS) as (keyof typeof FILTERS)[]).map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => setFilter(key)}
            aria-pressed={filter === key}
            className={`rounded-md border px-2.5 py-1 text-sm ${filter === key ? "border-accent bg-accent-soft text-accent" : "border-line bg-surface"}`}
          >
            {key} ({rows.filter(FILTERS[key]).length})
          </button>
        ))}
        <input
          aria-label="Search rows"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search rows"
          className="ml-auto rounded-md border border-line bg-surface px-2.5 py-1 text-sm"
        />
      </div>
      <div className="mt-2 overflow-hidden rounded-lg border border-line bg-surface">
        <table className="w-full table-fixed text-left text-sm">
          <thead className="border-b border-line text-xs text-muted">
            <tr>
              <th className="w-16 px-3 py-2 font-medium">Row</th>
              <th className="px-3 py-2 font-medium">Section</th>
              <th className="px-3 py-2 font-medium">Item</th>
              <th className="px-3 py-2 font-medium">Comment</th>
              <th className="w-28 px-3 py-2 font-medium">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {visible.map((r) => (
              <tr key={r.rowNumber}>
                <td className="px-3 py-1.5 tabular-nums text-muted">{r.rowNumber}</td>
                <td className="truncate px-3 py-1.5" title={r.section}>{r.section}</td>
                <td className="truncate px-3 py-1.5" title={r.item}>{r.item}</td>
                <td className="truncate px-3 py-1.5" title={r.comment}>
                  {r.commentId ? <Link className="hover:underline" href={`/templates/${templateId}?comment=${r.commentId}`}>{r.comment}</Link> : r.comment}
                </td>
                <td className="px-3 py-1.5">
                  <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${STATUS_STYLE[r.status]}`}>{r.status}</span>
                </td>
              </tr>
            ))}
            {visible.length === 0 && <tr><td colSpan={5} className="px-3 py-4 text-center text-muted">No rows match.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
