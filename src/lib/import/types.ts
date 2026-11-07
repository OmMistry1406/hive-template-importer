export class ImportFailure extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly detail?: string,
  ) {
    super(message);
    this.name = "ImportFailure";
  }
}

export type Severity = "info" | "warning" | "error";

// export_gap: Spectora never put it in the file.
// importer_limit: it is in the file, but this app does not support it.
// source_data: it is in the file and looks odd; kept as it is.
export type IssueOrigin = "export_gap" | "importer_limit" | "source_data";

export type Issue = {
  rowNumber: number | null;
  severity: Severity;
  origin: IssueOrigin;
  code: string;
  message: string;
  detail?: string;
};

export type Disposition = "mapped" | "structure_only" | "quarantined" | "blank";

export type SourceRow = {
  id: string;
  rowNumber: number;
  cells: Record<string, string>;
  disposition: Disposition;
};

export type ParsedComment = {
  id: string;
  sourceRowId: string;
  name: string;
  textHtml: string | null;
  commentType: string | null;
  category: string | null;
  recommendation: string | null;
  answerType: string | null;
  choiceOptions: string[];
  unitOptions: string[];
  attributes: Record<string, string>;
};

export type ParsedItem = {
  id: string;
  name: string;
  comments: ParsedComment[];
};

export type ParsedSection = {
  id: string;
  name: string;
  items: ParsedItem[];
};

export type ImportStats = {
  rows: number;
  mapped: number;
  structureOnly: number;
  quarantined: number;
  blank: number;
  sections: number;
  items: number;
  comments: number;
  commentsWithText: number;
  linkCount: number;
  htmlComments: number;
};

export type ParsedImport = {
  templateName: string;
  headers: string[];
  sections: ParsedSection[];
  sourceRows: SourceRow[];
  issues: Issue[];
  stats: ImportStats;
};

export type Verification = {
  ok: boolean;
  rowsChecked: number;
  fieldsChecked: number;
  mismatches: { rowNumber: number; field: string; expected: string; actual: string }[];
  rowsUnaccounted: number[];
};
