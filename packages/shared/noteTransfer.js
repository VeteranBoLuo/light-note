export const NOTE_IMPORT_LIMITS = Object.freeze({
  documents: 200,
  uploadBytes: 100 * 1024 * 1024,
  expandedBytes: 300 * 1024 * 1024,
  entries: 2000,
  contentLength: 1000000,
});
export const NOTE_IMPORT_EXTENSIONS = Object.freeze([
  ".md",
  ".markdown",
  ".html",
  ".htm",
  ".docx",
  ".zip",
]);
export const NOTE_IMPORT_STATES = Object.freeze([
  "uploading",
  "parsing",
  "review",
  "queued",
  "running",
  "paused",
  "completed",
  "failed",
  "expired",
]);
export const NOTE_IMPORT_WARNINGS = Object.freeze([
  "format_simplified",
  "missing_image",
  "image_source_missing",
  "external_image",
  "unsupported_image",
  "local_link",
  "empty_document",
]);
