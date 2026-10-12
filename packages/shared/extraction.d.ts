export type ExtractionFieldType = "text" | "number" | "date";
export type ExtractionField = {
  id: string;
  key: string;
  label: string;
  type: ExtractionFieldType;
  rule: string;
};
export type ExtractionPlan = {
  recordDefinition: string;
  fields: ExtractionField[];
  issues: { code: string; fields: string[] }[];
};
export type ExtractionEvidence = {
  sourceId: string;
  sourceVersion: string;
  segmentId: string;
  locator: { type: string; value: string } | string;
  kind: "original" | "ocr";
  offset: number;
  quote: string;
  table?: {
    orientation: string;
    row: number;
    column: number;
    cell: { quote: string; offset: number };
    rowHeader?: { text: string };
    columnHeader?: { text: string };
  };
};
export type ExtractionCell = {
  fieldId: string;
  originalValue: string;
  status:
    | "found"
    | "missing"
    | "unavailable"
    | "conflict"
    | "format_error"
    | "evidence_incomplete";
  evidence: ExtractionEvidence[];
  evidenceIssues: string[];
  alternatives?: {
    value: string;
    status: ExtractionCell["status"];
    evidence: ExtractionEvidence[];
  }[];
};
export type ExtractionReview = {
  overridden: boolean;
  value: string;
  checked: boolean;
  updatedAt: string;
};
export type ExtractionRecord = {
  id: string;
  sourceId: string;
  anchor: ExtractionEvidence;
  cells: ExtractionCell[];
  reviews: Record<string, ExtractionReview>;
  version: number;
  excluded: boolean;
  published: boolean;
};
export type ExtractionFilter = {
  sourceId?: string;
  search?: string;
  review?: "pending";
  anomalies?: boolean;
  excluded?: boolean;
  sortField?: string;
  sortOrder?: "asc" | "desc";
};
export const EXTRACTION_LIMITS: Readonly<{
  sources: number;
  fields: number;
  records: number;
  sourceCharacters: number;
  totalBytes: number;
  windowBytes: number;
  windows: number;
  cellCharacters: number;
}>;
export const EXTRACTION_FIELD_TYPES: readonly ExtractionFieldType[];
export const EXTRACTION_ACTIVE_STATUSES: readonly string[];
export const EXTRACTION_CELL_STATUSES: readonly ExtractionCell["status"][];
export function extractionCurrentValue(
  cell: ExtractionCell,
  review?: ExtractionReview,
): string;
export function extractionRecordMatches(
  record: ExtractionRecord,
  filter?: ExtractionFilter,
): boolean;

export function sortExtractionRecords(
  records: ExtractionRecord[],
  fields: ExtractionField[],
  filter?: ExtractionFilter,
): ExtractionRecord[];
