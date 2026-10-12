/** V3 is one persistent workbench. Presentation never changes extraction identity. */
export const EXTRACTION_LIMITS = Object.freeze({
  sources: 20,
  fields: 12,
  records: 10000,
  sourceCharacters: 300000,
  totalBytes: 3000000,
  windowBytes: 18000,
  windows: 250,
  cellCharacters: 1000,
});
export const EXTRACTION_FIELD_TYPES = Object.freeze(["text", "number", "date"]);
export const EXTRACTION_ACTIVE_STATUSES = Object.freeze([
  "preparing",
  "queued",
  "analyzing",
  "processing",
]);
export const EXTRACTION_CELL_STATUSES = Object.freeze([
  "found",
  "missing",
  "unavailable",
  "conflict",
  "format_error",
  "evidence_incomplete",
]);
export function extractionCurrentValue(cell, review) {
  return review?.overridden === true ? review.value : cell.originalValue;
}
export function extractionRecordMatches(record, filter = {}) {
  if (filter.excluded !== true && record.excluded) return false;
  if (filter.sourceId && record.sourceId !== filter.sourceId) return false;
  if (
    filter.review === "pending" &&
    record.cells.every((cell) => record.reviews?.[cell.fieldId]?.checked)
  )
    return false;
  if (
    filter.anomalies &&
    !record.cells.some(
      (cell) =>
        cell.status !== "found" && !record.reviews?.[cell.fieldId]?.checked,
    )
  )
    return false;
  const query = String(filter.search || "")
    .trim()
    .toLocaleLowerCase();
  return (
    !query ||
    record.cells.some((cell) =>
      String(extractionCurrentValue(cell, record.reviews?.[cell.fieldId]))
        .toLocaleLowerCase()
        .includes(query),
    )
  );
}

/** Sort the complete filtered range before pagination. Empty/invalid values remain last. */
export function sortExtractionRecords(records, fields, filter = {}) {
  const field = fields.find((f) => f.id === filter.sortField);
  if (!field) return records;
  const value = (record) => {
    const cell = record.cells.find((c) => c.fieldId === field.id);
    const raw = cell
      ? String(extractionCurrentValue(cell, record.reviews?.[field.id])).trim()
      : "";
    if (!raw) return null;
    if (field.type === "number")
      return /^[+-]?(?:\d+(?:\.\d+)?|\.\d+)$/.test(raw) &&
        Number.isFinite(Number(raw))
        ? Number(raw)
        : null;
    if (field.type === "date")
      return /^\d{4}-\d{2}-\d{2}$/.test(raw) &&
        Number.isFinite(Date.parse(raw)) &&
        new Date(raw).toISOString().slice(0, 10) === raw
        ? raw
        : null;
    return raw;
  };
  const direction = filter.sortOrder === "desc" ? -1 : 1;
  return records
    .map((record, index) => ({ record, index, value: value(record) }))
    .sort((a, b) => {
      if (a.value === null || b.value === null)
        return a.value === b.value
          ? a.index - b.index
          : a.value === null
            ? 1
            : -1;
      const delta =
        typeof a.value === "number"
          ? a.value - b.value
          : String(a.value).localeCompare(String(b.value), "zh-CN", {
              numeric: true,
            });
      return delta * direction || a.index - b.index;
    })
    .map((item) => item.record);
}
