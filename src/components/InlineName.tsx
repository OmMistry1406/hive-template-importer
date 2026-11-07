"use client";

import { useState } from "react";
import type { ActionResult } from "@/app/actions";

export function InlineName({
  value,
  label,
  className = "",
  onSave,
}: {
  value: string;
  label: string;
  className?: string;
  onSave: (next: string) => Promise<ActionResult<unknown>>;
}) {
  const [draft, setDraft] = useState(value);
  const [saved, setSaved] = useState(value);
  const [error, setError] = useState("");

  async function commit() {
    if (draft === saved) return;
    if (!draft.trim()) {
      setError(`${label} cannot be empty.`);
      return;
    }
    const result = await onSave(draft);
    if (result.ok) {
      setSaved(draft);
      setError("");
    } else {
      setError(result.error);
    }
  }

  return (
    <span className="block min-w-0 flex-1">
      <input
        aria-label={label}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
          if (e.key === "Escape") {
            setDraft(saved);
            setError("");
          }
        }}
        className={`-ml-1.5 w-full rounded border border-transparent bg-transparent px-1.5 py-0.5 hover:border-line focus:border-accent focus:bg-surface focus:outline-none ${className}`}
      />
      {error && <span role="alert" className="block text-sm font-normal text-defect">{error}</span>}
    </span>
  );
}
