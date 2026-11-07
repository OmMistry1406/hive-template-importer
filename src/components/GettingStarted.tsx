"use client";

import { X } from "lucide-react";
import Link from "next/link";
import { useSyncExternalStore } from "react";

const KEY = "ti.getting-started.dismissed";
const EVENT = "ti-getting-started";

function isDismissed() {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

function subscribe(onChange: () => void) {
  window.addEventListener(EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

export function GettingStarted({ templateId }: { templateId: string }) {
  const dismissed = useSyncExternalStore(subscribe, isDismissed, () => true);
  if (dismissed) return null;

  function dismiss() {
    try {
      localStorage.setItem(KEY, "1");
    } catch {}
    window.dispatchEvent(new Event(EVENT));
  }

  return (
    <aside aria-label="Getting started" className="relative mt-4 rounded-lg border border-accent/25 bg-accent-soft px-4 py-3 text-sm">
      <button type="button" onClick={dismiss} aria-label="Dismiss getting started" className="absolute right-2 top-2 rounded p-1 text-muted hover:bg-surface">
        <X className="size-4" />
      </button>
      <p className="font-medium text-accent">This template was imported from Spectora. Things to try:</p>
      <ol className="mt-1.5 grid gap-x-6 gap-y-1 text-foreground sm:grid-cols-2 lg:grid-cols-4">
        <li>1. Click any comment text to edit it; it saves when you press Done.</li>
        <li>2. Click a section or item name to rename it.</li>
        <li>3. Use Make a copy, then change the copy freely.</li>
        <li>
          4. Open the <Link className="underline" href={`/templates/${templateId}/report`}>import report</Link> to see every row checked.
        </li>
      </ol>
    </aside>
  );
}
