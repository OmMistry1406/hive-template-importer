export const CORE_COLUMNS = {
  section: "section name",
  item: "item name",
  commentName: "comment name",
  commentText: "comment text",
  commentType: "comment type",
  category: "category",
  choiceOptions: "multiple choice options",
  unitOptions: "unit type options",
  recommendation: "recommendation",
  answerType: "answer type",
} as const;

export type CoreColumn = keyof typeof CORE_COLUMNS;

export const REQUIRED_COLUMNS: CoreColumn[] = [
  "section",
  "item",
  "commentName",
  "commentText",
];

// Kept in comments.attributes and shown read-only: present in the export, with
// no behaviour in this app because report writing is out of scope.
export const ATTRIBUTE_COLUMNS = new Set([
  "order",
  "default value",
  "default value 2",
  "default unit type",
  "default location",
  "default estimate min",
  "default estimate max",
  "locked",
  "simple format",
  "disable photos",
  "uses",
  "last modified",
  ...Array.from({ length: 10 }, (_, i) => `default photo ${i + 1}`),
  ...Array.from({ length: 10 }, (_, i) => `default photo ${i + 1} caption`),
]);

export const normalizeHeader = (header: string) =>
  header
    .replace(/\(.*\)/s, "")
    .trim()
    .toLowerCase();
