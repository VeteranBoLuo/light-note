export const CARD_IMAGE_PROFILE = Object.freeze({
  id: "card",
  version: 2,
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
export function isVideoCoverFile(name) {
  const extension = String(name || "").match(/\.([^.]+)$/)?.[1]?.toLowerCase();
  return Boolean(extension && VIDEO_COVER_EXTENSIONS.includes(extension));
}
