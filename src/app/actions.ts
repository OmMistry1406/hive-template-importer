"use server";

import { revalidatePath } from "next/cache";
import { getDb } from "@/lib/db/client";
import {
  NotFound,
  addComment,
  copyTemplate,
  deleteComment,
  deleteTemplate,
  renameItem,
  renameSection,
  renameTemplate,
  revertComment,
  updateComment,
} from "@/lib/db/templates";
import { sanitizeEdit } from "@/lib/import/html";

export type ActionResult<T = void> = { ok: true; value: T } | { ok: false; error: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_NAME = 500;
const MAX_TEXT = 50_000;
const COMMENT_TYPES = ["info", "limit", "defect"];

class Invalid extends Error {}

function id(value: string) {
  if (!UUID.test(value)) throw new Invalid("That record could not be found.");
  return value;
}

function name(value: string, label: string) {
  const trimmed = value.trim();
  if (!trimmed) throw new Invalid(`${label} cannot be empty.`);
  if (trimmed.length > MAX_NAME) throw new Invalid(`${label} is too long.`);
  return value;
}

async function run<T>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    return { ok: true, value: await fn() };
  } catch (error) {
    if (error instanceof Invalid || error instanceof NotFound) {
      return { ok: false, error: error.message };
    }
    console.error(error);
    return { ok: false, error: "The server could not save this. Your text is still here; try again." };
  }
}

export async function saveTemplateName(templateId: string, value: string) {
  return run(async () => {
    await renameTemplate(await getDb(), id(templateId), name(value, "Template name"));
    revalidatePath("/", "layout");
  });
}

export async function saveSectionName(sectionId: string, value: string) {
  return run(async () => renameSection(await getDb(), id(sectionId), name(value, "Section name")));
}

export async function saveItemName(itemId: string, value: string) {
  return run(async () => renameItem(await getDb(), id(itemId), name(value, "Item name")));
}

export async function saveCommentName(commentId: string, value: string) {
  return run(async () =>
    updateComment(await getDb(), id(commentId), { name: name(value, "Comment name") }),
  );
}

export async function saveCommentText(commentId: string, html: string) {
  return run(async () => {
    if (html.length > MAX_TEXT) throw new Invalid("This comment is too long to save.");
    const textHtml = sanitizeEdit(html);
    await updateComment(await getDb(), id(commentId), { textHtml });
    return textHtml;
  });
}

export async function saveCommentType(commentId: string, value: string) {
  return run(async () => {
    if (!COMMENT_TYPES.includes(value)) throw new Invalid("Unknown comment type.");
    await updateComment(await getDb(), id(commentId), { commentType: value });
  });
}

export async function restoreComment(commentId: string) {
  return run(async () => revertComment(await getDb(), id(commentId)));
}

export async function createComment(itemId: string) {
  return run(async () => addComment(await getDb(), id(itemId), "defect"));
}

export async function removeComment(commentId: string) {
  return run(async () => deleteComment(await getDb(), id(commentId)));
}

export async function duplicateTemplate(templateId: string) {
  return run(async () => {
    const newId = await copyTemplate(await getDb(), id(templateId));
    revalidatePath("/", "layout");
    return newId;
  });
}

export async function removeTemplate(templateId: string) {
  return run(async () => {
    await deleteTemplate(await getDb(), id(templateId));
    revalidatePath("/", "layout");
  });
}
