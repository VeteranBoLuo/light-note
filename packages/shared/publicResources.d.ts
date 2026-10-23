export type PublicResourceKind = "bookmark" | "note";
export type PublicResourceStatus =
  | "ai_checking"
  | "pending_review"
  | "published"
  | "rejected"
  | "withdrawn"
  | "removed";
export type SearchOrigin = "personal" | "public";
export type SearchSource = "all" | "personal" | "public";
export interface PublicResourceAuthor {
  publicId: string;
  name: string;
  communityId: string;
}
export interface PublicResourceItem {
  origin: "public";
  publicId: string;
  kind: PublicResourceKind;
  title: string;
  summary: string;
  author: PublicResourceAuthor;
  publishedAt: string;
  revision: number;
  version: number;
}
export interface PublicResourceDetail extends PublicResourceItem {
  body: string;
  url: string;
  description: string;
}
export interface PublicationMaterial {
  kind: PublicResourceKind;
  title: string;
  body: string;
  url: string;
  description: string;
}
export interface PublicationPreview extends PublicationMaterial {
  fingerprint: string;
  publicationId: string | null;
  expectedVersion: number;
}
export interface PublicResourceCapabilities {
  enabled: boolean;
  submissionsEnabled: boolean;
  aiEnabled: boolean;
  moderationEnabled: boolean;
}
export interface PublicationRecord {
  publicId: string;
  kind: PublicResourceKind;
  sourceId: string;
  title: string;
  version: number;
  status: PublicResourceStatus;
  oldVersionPublic: boolean;
  hasUnpublishedChanges: boolean | null;
  sourceUnavailable: boolean;
  reason: string;
  createdAt: string;
  updatedAt: string;
  publishedAt: string | null;
  pendingRevision: number | null;
  publishedRevision: number | null;
  latestRevision: number | null;
  aiStatus: string | null;
  aiCompleted: boolean;
}
export interface PublicationCandidate {
  sourceId: string;
  kind: PublicResourceKind;
  title: string;
}
export interface PublicationWorkspaceItem extends PublicationCandidate {
  updatedAt: string;
  sourceUnavailable: boolean;
  publication: PublicationRecord | null;
}
export type PublicationOwnState = Pick<
  PublicationRecord,
  | "publicId"
  | "kind"
  | "sourceId"
  | "title"
  | "version"
  | "status"
  | "oldVersionPublic"
  | "pendingRevision"
  | "publishedRevision"
  | "latestRevision"
>;
export function canWithdrawPublication(
  item: Pick<
    PublicationRecord,
    "status" | "pendingRevision" | "publishedRevision"
  >,
): boolean;
export interface PublicResourcePage {
  items: PublicResourceItem[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}
export interface PublicResourceSaveResult {
  kind: PublicResourceKind;
  id: string;
  existing: boolean;
  inTrash: boolean;
}
export interface PublicResourceReview {
  decision: "pass" | "hold";
  categories: string[];
  reason: string;
  evidence: { paragraph: number; quote: string }[];
}
export const PUBLIC_RESOURCE_LIMITS: Readonly<{
  title: number;
  note: number;
  description: number;
  url: number;
  page: number;
  maxPage: number;
  suggestions: number;
  batch: number;
  selection: number;
  workspace: number;
}>;
export const PUBLIC_RESOURCE_KINDS: readonly PublicResourceKind[];
export const PUBLIC_RESOURCE_STATUSES: readonly PublicResourceStatus[];
export const PUBLIC_RESOURCE_REVIEW_CATEGORIES: readonly string[];
