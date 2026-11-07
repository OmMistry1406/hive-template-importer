import { NextResponse } from "next/server";
import { getDb } from "@/lib/db/client";
import { importSpectoraFile } from "@/lib/import/run";
import { ImportFailure } from "@/lib/import/types";

// Vercel rejects request bodies over 4.5 MB before this code runs.
const MAX_BYTES = 4 * 1024 * 1024;

const fail = (status: number, code: string, message: string, detail?: string) =>
  NextResponse.json({ code, message, detail }, { status });

export async function POST(request: Request) {
  let file: FormDataEntryValue | null;
  try {
    file = (await request.formData()).get("file");
  } catch {
    return fail(400, "bad_upload", "The upload did not arrive complete. Try again.");
  }
  if (!(file instanceof File) || file.size === 0) {
    return fail(400, "empty_file", "That file is empty.");
  }
  if (file.size > MAX_BYTES) {
    return fail(413, "file_too_large", "This file is over the 4 MB limit.");
  }

  try {
    const result = await importSpectoraFile(
      await getDb(),
      new Uint8Array(await file.arrayBuffer()),
      file.name,
    );
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    if (error instanceof ImportFailure) {
      return fail(422, error.code, error.message, error.detail);
    }
    console.error(error);
    return fail(500, "server_error", "The server failed during import. Nothing was saved. Try again.");
  }
}
