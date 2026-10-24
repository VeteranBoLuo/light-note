export const PUBLIC_RESOURCE_LIMITS = Object.freeze({
  title: 255,
  note: 30000,
  description: 255,
  url: 255,
  page: 20,
  maxPage: 50,
  suggestions: 3,
  batch: 100,
  selection: 100,
  workspace: 1000,
});
export const PUBLIC_RESOURCE_KINDS = Object.freeze(["bookmark", "note"]);
export const PUBLIC_RESOURCE_STATUSES = Object.freeze([
  "ai_checking",
  "pending_review",
  "published",
  "rejected",
  "withdrawn",
  "removed",
]);
export const PUBLIC_RESOURCE_REVIEW_CATEGORIES = Object.freeze([
  "ads",
  "spam",
  "harassment",
  "privacy_leak",
  "unsafe",
  "uncertain",
]);

export function canWithdrawPublication(item) {
  return (
    !["removed", "withdrawn"].includes(item.status) &&
    Boolean(item.pendingRevision || item.publishedRevision)
  );
}
