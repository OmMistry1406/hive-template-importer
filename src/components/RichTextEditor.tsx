"use client";

import Image from "@tiptap/extension-image";
import { TextStyleKit } from "@tiptap/extension-text-style";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Bold, Italic, Link as LinkIcon, List, ListOrdered } from "lucide-react";
import { useRef, useState } from "react";

const toolbarButton = (active: boolean) =>
  `rounded p-1.5 hover:bg-background ${active ? "bg-accent-soft text-accent" : "text-muted"}`;

export function RichTextEditor({
  initialHtml,
  onDone,
}: {
  initialHtml: string;
  onDone: (html: string | null) => void;
}) {
  // ProseMirror rewrites HTML on load, so "changed" is judged against its own
  // first rendering. An untouched comment therefore keeps its stored original.
  const baseline = useRef<string | null>(null);
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ link: { openOnClick: false, autolink: true } }),
      TextStyleKit,
      Image,
    ],
    content: initialHtml,
    immediatelyRender: false,
    autofocus: "end",
    onCreate: ({ editor }) => {
      baseline.current = editor.getHTML();
    },
  });

  function finish() {
    if (!editor) return;
    const html = editor.getHTML();
    onDone(html === baseline.current ? null : html);
  }

  function applyLink() {
    if (!editor) return;
    const href = linkUrl.trim();
    const chain = editor.chain().focus().extendMarkRange("link");
    if (href) chain.setLink({ href: /^[a-z]+:/i.test(href) ? href : `https://${href}` }).run();
    else chain.unsetLink().run();
    setLinkOpen(false);
    setLinkUrl("");
  }

  return (
    <div className="rounded-md border border-accent bg-surface">
      <div className="flex items-center gap-0.5 border-b border-line px-1.5 py-1">
        <button type="button" aria-label="Bold" className={toolbarButton(!!editor?.isActive("bold"))} onClick={() => editor?.chain().focus().toggleBold().run()}><Bold className="size-4" /></button>
        <button type="button" aria-label="Italic" className={toolbarButton(!!editor?.isActive("italic"))} onClick={() => editor?.chain().focus().toggleItalic().run()}><Italic className="size-4" /></button>
        <button type="button" aria-label="Bulleted list" className={toolbarButton(!!editor?.isActive("bulletList"))} onClick={() => editor?.chain().focus().toggleBulletList().run()}><List className="size-4" /></button>
        <button type="button" aria-label="Numbered list" className={toolbarButton(!!editor?.isActive("orderedList"))} onClick={() => editor?.chain().focus().toggleOrderedList().run()}><ListOrdered className="size-4" /></button>
        <button
          type="button"
          aria-label="Link"
          className={toolbarButton(!!editor?.isActive("link"))}
          onClick={() => {
            setLinkUrl(editor?.getAttributes("link").href ?? "");
            setLinkOpen((o) => !o);
          }}
        >
          <LinkIcon className="size-4" />
        </button>
        <button type="button" onClick={finish} className="ml-auto rounded-md bg-accent px-3 py-1 text-sm font-medium text-white">Done</button>
      </div>
      {linkOpen && (
        <div className="flex items-center gap-2 border-b border-line px-2 py-1.5">
          <input
            aria-label="Link address"
            autoFocus
            value={linkUrl}
            onChange={(e) => setLinkUrl(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); applyLink(); } }}
            placeholder="https://"
            className="min-w-0 flex-1 rounded border border-line px-2 py-1 text-sm"
          />
          <button type="button" onClick={applyLink} className="rounded border border-line px-2 py-1 text-sm">Apply</button>
        </div>
      )}
      <EditorContent editor={editor} className="comment-html px-3 py-2 text-[15px] leading-relaxed" />
    </div>
  );
}
