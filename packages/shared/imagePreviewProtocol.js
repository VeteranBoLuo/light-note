export const CARD_IMAGE_PROFILE = Object.freeze({
  id: "card",
  version: 3,
  maxEdge: 720,
  maxBytes: 150 * 1024,
});
export const IMAGE_PREVIEW_SOURCES = Object.freeze(["note", "cloud_file"]);
export const VIDEO_COVER_EXTENSIONS = Object.freeze([
  "mp4",
  "m4v",
  "mov",
  "webm",
  "mkv",
  "avi",
  "wmv",
  "flv",
  "ogv",
]);
const extensionOf = (name) => String(name || "").match(/\.([^.]+)$/)?.[1]?.toLowerCase();
export function isVideoCoverFile(name) {
  const extension = extensionOf(name);
  return Boolean(extension && VIDEO_COVER_EXTENSIONS.includes(extension));
}
export function isPdfCoverFile(name) {
  return extensionOf(name) === "pdf";
}
/** Formats rendered from a full source copy by an external decoder; they share one serial worker lane. */
export const HEAVY_PREVIEW_FORMATS = Object.freeze(["video-card", "pdf-card"]);
export function cloudPreviewFormat(name) {
  return isVideoCoverFile(name) ? "video-card" : isPdfCoverFile(name) ? "pdf-card" : "card";
}
