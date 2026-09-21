export const DATA_EXPORT_TYPES = Object.freeze(["notes", "bookmarks", "files"]);
export const DATA_EXPORT_ACTIVE = Object.freeze(["queued", "running"]);
export const DATA_EXPORT_DEFAULTS = Object.freeze({
  types: ["notes", "bookmarks"],
  noteFormat: "html",
  includeImages: true,
});
export function normalizeDataExportOptions(input) {
  if (
    !input ||
    !Array.isArray(input.types) ||
    !input.types.length ||
    input.types.some((t) => !DATA_EXPORT_TYPES.includes(t)) ||
    !["original", "html", "markdown"].includes(input.noteFormat) ||
    typeof input.includeImages !== "boolean"
  )
    throw Object.assign(new Error("DATA_EXPORT_OPTIONS"), {
      code: "DATA_EXPORT_OPTIONS",
      status: 400,
    });
  return {
    types: DATA_EXPORT_TYPES.filter((t) => input.types.includes(t)),
    noteFormat: input.noteFormat,
    includeImages: input.includeImages,
  };
}
export function safeExportName(value, fallback = "Untitled") {
  let name =
    Array.from(
      String(value || "")
        .normalize("NFC")
        .replace(/[\x00-\x1f\x7f\\/:*?"<>|]/g, " ")
        .replace(/\s+/g, " ")
        .trim(),
    )
      .slice(0, 80)
      .join("")
      .replace(/[. ]+$/g, "") || fallback;
  while (new TextEncoder().encode(name).length > 200)
    name = Array.from(name).slice(0, -1).join("");
  if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name))
    name = "_" + name;
  return name;
}
export function uniqueExportName(value, used, extension = "") {
  const base = safeExportName(value);
  let name = base,
    suffix = 2;
  while (
    used.has((name + extension).toLowerCase()) ||
    used.has(name.toLowerCase())
  )
    name = `${base} (${suffix++})`;
  used.add(name.toLowerCase());
  used.add((name + extension).toLowerCase());
  return name + extension;
}
export function splitExportText(value, limit = 30000) {
  const text = String(value || ""),
    chunks = [];
  for (let i = 0; i < text.length;) {
    let end = Math.min(i + limit, text.length);
    if (end < text.length && /[\uD800-\uDBFF]/.test(text[end - 1])) end--;
    chunks.push(text.slice(i, end));
    i = end;
  }
  return chunks.length ? chunks : [""];
}

export function resolveDataExportNoteFormat(type, format) {
  if (type === 'drawing') return 'json';
  if (format !== 'original') return format;
  return type === 'markdown' || type === 'md' ? 'markdown' : 'html';
}
