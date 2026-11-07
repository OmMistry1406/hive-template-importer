"use client";

import { ChevronRight, RotateCcw, Trash2 } from "lucide-react";
import { useState } from "react";
import {
  removeComment,
  restoreComment,
  saveCommentName,
  saveCommentText,
  saveCommentType,
} from "@/app/actions";
import { InlineName } from "./InlineName";
import { RichTextEditor } from "./RichTextEditor";
import type { Save } from "./useSaver";
import type { EditorComment } from "./TemplateEditor";

const TYPE_STYLE: Record<string, string> = {
  defect: "bg-defect-soft text-defect",
  limit: "bg-limit-soft text-limit",
  info: "bg-info-soft text-info",
};
const CATEGORY_LABEL: Record<string, string> = { "-1": "Low", "0": "Medium", "1": "High" };

export function CommentCard({
  comment,
  save,
  onChange,
  onDeleted,
  highlighted,
}: {
  comment: EditorComment;
  save: Save;
  onChange: (patch: Partial<EditorComment>) => void;
  onDeleted: () => void;
  highlighted?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [nameKey, setNameKey] = useState(0);
  const type = comment.commentType ?? "";
  const known = type in TYPE_STYLE;

  async function saveText(html: string | null) {
    setEditing(false);
    if (html === null) return;
    onChange({ textHtml: html, edited: comment.sourceRowId !== null });
    await save(() => saveCommentText(comment.id, html));
  }

  async function restore() {
    const result = await save(() => restoreComment(comment.id));
    if (result.ok) {
      onChange({ name: result.value.name, textHtml: comment.importedTextHtml, edited: false });
      setNameKey((k) => k + 1);
    }
  }

  return (
    <article
      id={`c-${comment.id}`}
      className={`rounded-lg border bg-surface p-3 ${highlighted ? "border-accent ring-2 ring-accent/20" : "border-line"}`}
    >
      <div className="flex items-start gap-2">
        <InlineName
          key={nameKey}
          value={comment.name}
          label="Comment name"
          className="font-medium"
          onSave={async (name) => {
            const result = await save(() => saveCommentName(comment.id, name));
            if (result.ok) onChange({ name, edited: comment.sourceRowId !== null });
            return result;
          }}
        />
        {comment.edited && (
          <>
            <span className="mt-1 rounded bg-accent-soft px-1.5 py-0.5 text-xs font-medium text-accent">Edited</span>
            <button type="button" onClick={restore} className="mt-0.5 inline-flex items-center gap-1 rounded px-1.5 py-1 text-xs text-muted hover:bg-background hover:text-foreground">
              <RotateCcw className="size-3" /> Restore original
            </button>
          </>
        )}
        {known ? (
          <select
            aria-label="Comment type"
            value={type}
            onChange={async (e) => {
              const next = e.target.value;
              onChange({ commentType: next });
              const result = await save(() => saveCommentType(comment.id, next));
              if (!result.ok) onChange({ commentType: type });
            }}
            className={`mt-0.5 rounded border-0 px-1.5 py-0.5 text-xs font-medium capitalize ${TYPE_STYLE[type]}`}
          >
            <option value="info">Info</option>
            <option value="limit">Limit</option>
            <option value="defect">Defect</option>
          </select>
        ) : (
          type && <span className="mt-1 rounded bg-background px-1.5 py-0.5 text-xs">{type}</span>
        )}
      </div>

      <div className="mt-1.5">
        {editing ? (
          <RichTextEditor initialHtml={comment.textHtml ?? ""} onDone={saveText} />
        ) : (
          <div
            role="button"
            tabIndex={0}
            onClick={(e) => {
              if (!(e.target as HTMLElement).closest("a")) setEditing(true);
            }}
            onKeyDown={(e) => { if (e.key === "Enter") setEditing(true); }}
            aria-label={`Edit text of ${comment.name}`}
            className="-ml-1.5 block w-full cursor-text rounded border border-transparent px-1.5 py-1 text-left text-[15px] leading-relaxed hover:border-line"
          >
            {comment.textHtml ? (
              <div className="comment-html" dangerouslySetInnerHTML={{ __html: comment.textHtml }} />
            ) : (
              <span className="text-sm text-muted">No comment text. Click to add.</span>
            )}
          </div>
        )}
      </div>

      {(comment.choiceOptions.length > 0 || comment.unitOptions.length > 0) && (
        <ul className="mt-2 flex flex-wrap gap-1">
          {[...comment.choiceOptions, ...comment.unitOptions].map((option, i) => (
            <li key={`${option}-${i}`} className="rounded bg-background px-1.5 py-0.5 text-xs text-muted">{option}</li>
          ))}
        </ul>
      )}

      <div className="mt-2 flex items-center justify-between gap-3 text-xs text-muted">
        <details className="group min-w-0">
          <summary className="flex cursor-pointer list-none items-center gap-1 hover:text-foreground">
            <ChevronRight className="size-3 transition-transform group-open:rotate-90" /> Imported settings
          </summary>
          <dl className="mt-1.5 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 pl-4">
            {comment.answerType && <><dt>Answer type</dt><dd>{comment.answerType}</dd></>}
            {comment.category && <><dt>Category</dt><dd>{CATEGORY_LABEL[comment.category] ?? comment.category}</dd></>}
            {comment.recommendation && <><dt>Recommendation</dt><dd>{comment.recommendation}</dd></>}
            {Object.entries(comment.attributes).map(([key, value]) => (
              <div key={key} className="contents"><dt>{key.replace(/\s*\(.*\)$/s, "")}</dt><dd className="break-all">{value}</dd></div>
            ))}
          </dl>
        </details>
        {confirmingDelete ? (
          <span className="flex shrink-0 items-center gap-2">
            Delete this comment?
            <button
              type="button"
              className="rounded bg-defect px-2 py-0.5 font-medium text-white"
              onClick={async () => {
                const result = await save(() => removeComment(comment.id));
                if (result.ok) onDeleted();
              }}
            >
              Delete
            </button>
            <button type="button" className="underline" onClick={() => setConfirmingDelete(false)}>Keep</button>
          </span>
        ) : (
          <button type="button" aria-label={`Delete ${comment.name}`} className="shrink-0 rounded p-1 hover:bg-background hover:text-defect" onClick={() => setConfirmingDelete(true)}>
            <Trash2 className="size-3.5" />
          </button>
        )}
      </div>
    </article>
  );
}
