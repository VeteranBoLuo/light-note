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
