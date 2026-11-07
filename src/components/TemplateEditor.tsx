"use client";

import { CheckCircle2, ClipboardCheck, LoaderCircle, Plus, Search, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { createComment, saveItemName, saveSectionName, saveTemplateName } from "@/app/actions";
import type { CommentRow, ItemRow, SectionRow, TemplateTree } from "@/lib/db/templates";
import { CommentCard } from "./CommentCard";
import { InlineName } from "./InlineName";
import { CopyTemplateButton, DeleteTemplateButton } from "./TemplateButtons";
import { useSaver, type SaveState } from "./useSaver";

export type EditorComment = CommentRow & { edited: boolean };
type EditorItem = Omit<ItemRow, "comments"> & { comments: EditorComment[] };
type EditorSection = Omit<SectionRow, "items"> & { items: EditorItem[] };
export type EditorTemplate = Omit<TemplateTree, "sections"> & { sections: EditorSection[] };

function SaveIndicator({ state }: { state: SaveState }) {
  if (state.kind === "idle") return <span className="text-sm text-muted">Changes save automatically</span>;
  if (state.kind === "saving") {
    return <span className="inline-flex items-center gap-1.5 text-sm text-muted"><LoaderCircle className="size-3.5 animate-spin" /> Saving…</span>;
  }
  if (state.kind === "saved") {
    return <span className="inline-flex items-center gap-1.5 text-sm text-accent"><CheckCircle2 className="size-3.5" /> All changes saved</span>;
  }
  return (
    <span role="alert" className="inline-flex items-center gap-1.5 text-sm text-defect">
      <TriangleAlert className="size-3.5" /> Not saved. {state.error}
      <button type="button" onClick={state.retry} className="font-medium underline">Retry</button>
    </span>
  );
}

const stripTags = (html: string | null) => (html ?? "").replace(/<[^>]*>/g, " ").toLowerCase();

export function TemplateEditor({ template, focusCommentId }: { template: EditorTemplate; focusCommentId?: string }) {
  const [sections, setSections] = useState(template.sections);
  const [query, setQuery] = useState("");
  const { state, save } = useSaver();
  const [sectionId, setSectionId] = useState(() => {
    const holder = focusCommentId
      ? template.sections.find((s) => s.items.some((i) => i.comments.some((c) => c.id === focusCommentId)))
      : undefined;
    return holder?.id ?? template.sections[0]?.id;
  });

  useEffect(() => {
    if (focusCommentId) document.getElementById(`c-${focusCommentId}`)?.scrollIntoView({ block: "center" });
  }, [focusCommentId]);

  const updateComment = (id: string, patch: Partial<EditorComment>) =>
    setSections((all) =>
      all.map((s) => ({
        ...s,
        items: s.items.map((i) => ({
          ...i,
          comments: i.comments.map((c) => (c.id === id ? { ...c, ...patch } : c)),
        })),
      })),
    );
  const deleteComment = (id: string) =>
    setSections((all) =>
      all.map((s) => ({
        ...s,
        items: s.items.map((i) => ({ ...i, comments: i.comments.filter((c) => c.id !== id) })),
      })),
    );

  async function addComment(itemId: string) {
    const result = await save(() => createComment(itemId));
    if (!result.ok) return;
    const fresh: EditorComment = {
      id: result.value, name: "New comment", textHtml: "", commentType: "defect", category: null,
      recommendation: null, answerType: "boolean", choiceOptions: [], unitOptions: [], attributes: {},
      sourceRowId: null, importedName: null, importedTextHtml: null, edited: false,
    };
    setSections((all) =>
      all.map((s) => ({
        ...s,
        items: s.items.map((i) => (i.id === itemId ? { ...i, comments: [...i.comments, fresh] } : i)),
      })),
    );
  }

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return null;
    return sections.flatMap((s) =>
      s.items.flatMap((i) =>
        i.comments
          .filter((c) => c.name.toLowerCase().includes(q) || stripTags(c.textHtml).includes(q))
          .map((c) => ({ section: s, item: i, comment: c })),
      ),
    );
  }, [query, sections]);

  const current = sections.find((s) => s.id === sectionId);
  const commentCount = (s: EditorSection) => s.items.reduce((n, i) => n + i.comments.length, 0);

  return (
    <div className="mx-auto w-full max-w-[1400px] px-6 pb-16">
      <div className="sticky top-13 z-10 -mx-6 border-b border-line bg-background px-6 py-3">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <div className="min-w-64 flex-1">
            <InlineName
              value={template.name}
              label="Template name"
              className="text-xl font-semibold tracking-tight"
              onSave={(name) => save(() => saveTemplateName(template.id, name))}
            />
            {template.copiedFromName && <p className="text-sm text-muted">Copy of {template.copiedFromName}. Changes here do not affect it.</p>}
          </div>
          <SaveIndicator state={state} />
          {template.importRunId && (
            <Link href={`/templates/${template.id}/report`} className="inline-flex items-center gap-1.5 rounded-md border border-line bg-surface px-2.5 py-1.5 text-sm hover:bg-background">
              <ClipboardCheck className="size-3.5" /> Import report
            </Link>
          )}
          <CopyTemplateButton templateId={template.id} />
          <DeleteTemplateButton templateId={template.id} name={template.name} redirectTo="/templates" />
        </div>
      </div>

      <div className="mt-5 grid grid-cols-[260px_minmax(0,1fr)] gap-6">
        <aside className="sticky top-34 self-start">
          <label className="flex items-center gap-2 rounded-md border border-line bg-surface px-2.5 py-1.5">
            <Search className="size-4 text-muted" />
            <input
              aria-label="Search comments"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search comments"
              className="min-w-0 flex-1 bg-transparent text-sm outline-none"
            />
          </label>
          <nav aria-label="Sections" className="mt-3 max-h-[calc(100vh-13rem)] overflow-y-auto">
            {sections.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => { setSectionId(s.id); setQuery(""); window.scrollTo({ top: 0 }); }}
                className={`flex w-full items-baseline justify-between gap-2 rounded-md px-2.5 py-1.5 text-left text-sm ${s.id === sectionId && !results ? "bg-accent-soft font-medium text-accent" : "hover:bg-surface"}`}
              >
                <span className="min-w-0">{s.name}</span>
                <span className="text-xs tabular-nums text-muted">{commentCount(s)}</span>
              </button>
            ))}
          </nav>
        </aside>

        <main className="min-w-0">
          {results ? (
            <div className="space-y-3">
              <p className="text-sm text-muted">{results.length} comment{results.length === 1 ? "" : "s"} found</p>
              {results.map(({ section, item, comment }) => (
                <div key={comment.id}>
                  <p className="mb-1 text-xs text-muted">{section.name} / {item.name}</p>
                  <CommentCard comment={comment} save={save} onChange={(p) => updateComment(comment.id, p)} onDeleted={() => deleteComment(comment.id)} />
                </div>
              ))}
            </div>
          ) : current ? (
            <section aria-label={current.name}>
              <div className="text-2xl font-semibold tracking-tight">
                <InlineName
                  key={current.id}
                  value={current.name}
                  label="Section name"
                  onSave={async (name) => {
                    const result = await save(() => saveSectionName(current.id, name));
                    if (result.ok) setSections((all) => all.map((s) => (s.id === current.id ? { ...s, name } : s)));
                    return result;
                  }}
                />
              </div>
              {current.items.map((item) => (
                <div key={item.id} className="mt-6">
                  <div className="flex items-center gap-2 border-b border-line pb-1 text-lg font-semibold">
                    <InlineName
                      value={item.name}
                      label="Item name"
                      onSave={async (name) => {
                        const result = await save(() => saveItemName(item.id, name));
                        if (result.ok) {
                          setSections((all) => all.map((s) => ({ ...s, items: s.items.map((i) => (i.id === item.id ? { ...i, name } : i)) })));
                        }
                        return result;
                      }}
                    />
                    <button type="button" onClick={() => addComment(item.id)} className="inline-flex shrink-0 items-center gap-1 rounded px-2 py-1 text-sm font-normal text-muted hover:bg-surface hover:text-foreground">
                      <Plus className="size-3.5" /> Add comment
                    </button>
                  </div>
                  <div className="mt-3 space-y-2">
                    {item.comments.map((comment) => (
                      <CommentCard
                        key={comment.id}
                        comment={comment}
                        highlighted={comment.id === focusCommentId}
                        save={save}
                        onChange={(p) => updateComment(comment.id, p)}
                        onDeleted={() => deleteComment(comment.id)}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </section>
          ) : (
            <p className="text-muted">This template has no sections.</p>
          )}
        </main>
      </div>
    </div>
  );
}
