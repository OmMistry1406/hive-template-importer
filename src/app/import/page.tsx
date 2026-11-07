import { ImportDropzone } from "@/components/ImportDropzone";

export default function ImportPage() {
  return (
    <main className="mx-auto w-full max-w-2xl px-6 py-10">
      <h1 className="text-2xl font-semibold tracking-tight">Import a Spectora template</h1>
      <p className="mt-2 text-muted">
        In Spectora, open your template and choose Export to spreadsheet, then Export HTML Text.
        Upload the file here. Your Spectora account is not touched.
      </p>
      <ImportDropzone />
      <p className="mt-4 text-sm text-muted">
        After importing, you get a report showing where every row of your file went, and anything
        that could not come across.
      </p>
    </main>
  );
}
