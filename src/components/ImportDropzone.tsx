"use client";

import { FileUp, LoaderCircle, TriangleAlert } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

type Failure = { message: string; detail?: string };

const MAX_BYTES = 4 * 1024 * 1024;

export function ImportDropzone() {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [failure, setFailure] = useState<Failure | null>(null);

  async function upload(file: File) {
    setFailure(null);
    if (file.size > MAX_BYTES) {
      setFailure({ message: "This file is over the 4 MB limit." });
      return;
    }
    setBusy(true);
    try {
      const body = new FormData();
      body.set("file", file);
      const response = await fetch("/api/imports", { method: "POST", body });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.templateId) {
        setFailure(data?.message ? data : { message: "The upload failed. Nothing was saved. Try again." });
        return;
      }
      router.push(`/templates/${data.templateId}/report?imported=1`);
      router.refresh();
    } catch {
      setFailure({ message: "Could not reach the server. Nothing was saved. Check your connection and try again." });
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  return (
    <div className="mt-6">
      <button
        type="button"
        disabled={busy}
        onClick={() => input.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          const file = e.dataTransfer.files[0];
          if (file) upload(file);
        }}
        className={`flex w-full flex-col items-center gap-2 rounded-lg border-2 border-dashed bg-surface px-6 py-12 text-center transition-colors ${dragging ? "border-accent bg-accent-soft" : "border-line hover:border-accent"}`}
      >
        {busy ? <LoaderCircle className="size-7 animate-spin text-accent" /> : <FileUp className="size-7 text-accent" />}
        <span className="font-medium">{busy ? "Importing and checking your file…" : "Drop your export here, or click to choose it"}</span>
        <span className="text-sm text-muted">Spectora HTML Text export (.xls or .xlsx), up to 4 MB</span>
      </button>
      <input
        ref={input}
        type="file"
        aria-label="Spectora export file"
        accept=".xls,.xlsx"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) upload(file);
        }}
      />
      {failure && (
        <div role="alert" className="mt-4 flex gap-3 rounded-lg border border-defect/30 bg-defect-soft p-4 text-sm">
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-defect" />
          <div>
            <p className="font-medium">{failure.message}</p>
            {failure.detail && <p className="mt-1 break-words text-muted">{failure.detail}</p>}
            <p className="mt-1 text-muted">Nothing was added to your templates.</p>
          </div>
        </div>
      )}
    </div>
  );
}
