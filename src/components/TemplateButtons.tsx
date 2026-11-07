"use client";

import { Copy, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { duplicateTemplate, removeTemplate } from "@/app/actions";

const button = "inline-flex items-center gap-1.5 rounded-md border border-line bg-surface px-2.5 py-1.5 text-sm hover:bg-background disabled:opacity-50";

export function CopyTemplateButton({ templateId }: { templateId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <>
      {error && <span role="alert" className="text-sm text-defect">{error}</span>}
      <button
        type="button"
        className={button}
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError("");
          const result = await duplicateTemplate(templateId);
          setBusy(false);
          if (result.ok) router.push(`/templates/${result.value}`);
          else setError(result.error);
        }}
      >
        <Copy className="size-3.5" /> {busy ? "Copying…" : "Make a copy"}
      </button>
    </>
  );
}

export function DeleteTemplateButton({ templateId, name, redirectTo }: { templateId: string; name: string; redirectTo?: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState("");

  if (!confirming) {
    return (
      <button type="button" aria-label={`Delete ${name}`} className={button} onClick={() => setConfirming(true)}>
        <Trash2 className="size-3.5" />
      </button>
    );
  }
  return (
    <span className="inline-flex items-center gap-2 text-sm">
      {error ? <span role="alert" className="text-defect">{error}</span> : <span>Delete permanently?</span>}
      <button
        type="button"
        className="rounded-md bg-defect px-2.5 py-1.5 font-medium text-white"
        onClick={async () => {
          const result = await removeTemplate(templateId);
          if (!result.ok) return setError(result.error);
          setConfirming(false);
          if (redirectTo) router.push(redirectTo);
          else router.refresh();
        }}
      >
        Delete
      </button>
      <button type="button" className={button} onClick={() => setConfirming(false)}>Keep</button>
    </span>
  );
}
