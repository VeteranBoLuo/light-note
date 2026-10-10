export const COMPARISON_MAX_COLUMNS: number;
export const COMPARISON_CELL_MAX_CHARS: number;
export type ComparisonColumn = {
  label: string;
  type: "auto" | "text" | "number" | "date";
  rule: string;
};
export type ComparisonCell = {
  value: string;
  status: "found" | "missing" | "conflict" | "unavailable" | "format_error";
  quotes: string[];
  originalValue?: string;
  reviewed?: boolean;
  edited?: boolean;
};
export type ComparisonTable = {
  columns: ComparisonColumn[];
  rows: Array<{ sourceId: string; title: string; cells: ComparisonCell[] }>;
};
export function normalizeComparisonColumns(value: unknown): ComparisonColumn[];
export function comparisonCellNeedsReview(cell: ComparisonCell): boolean;
export function comparisonTableMarkdown(table: ComparisonTable): string;
