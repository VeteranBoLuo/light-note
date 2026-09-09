import { apiBaseDelete, apiBaseGet, apiBasePost, apiBasePut, type ApiResponse } from '@/http/request';

export type OrganizeIssueType = 'untagged' | 'duplicate_bookmark' | 'bookmark_health' | 'knowledge_structure';
export type OrganizeResourceType = 'bookmark' | 'note' | 'file';
export type KnowledgeStructureIssueKind = 'invalid_parent' | 'empty' | 'duplicate_title' | 'untitled' | 'deep';

export interface OrganizeIssueSummary {
  state: 'ready' | 'loading' | 'stale' | 'error';
  findingCount: number | null;
  affectedResourceCount: number | null;
  exact: boolean;
  hasMore: boolean;
  updatedAt?: string | null;
  errorCode?: string | null;
}

export interface OrganizeOverviewPreview<T> {
  state: 'ready' | 'error';
  items: T[];
  hasMore: boolean;
  errorCode?: string | null;
}

export interface PendingOverviewItem {
  resourceType: OrganizeResourceType;
  resourceId: string;
  title: string;
  source?: string;
  collectedAt?: string | null;
  resourceCreatedAt?: string | null;
}

export interface DuplicateBookmarkOverviewItem {
  groupKey: string;
  url: string;
  memberCount: number;
}

export interface UntaggedOverviewItem {
  resourceType: OrganizeResourceType;
  resourceId: string;
  title: string;
  updatedAt?: string | null;
}

export interface BookmarkHealthOverviewItem {
  id: string;
  name: string;
  observedCode?: string | null;
  checkedAt?: string | null;
}

export interface KnowledgeStructureIssue {
  kind: KnowledgeStructureIssueKind;
  severity: 'high' | 'medium' | 'low';
  noteId: string;
  title: string;
  path: string;
  reason: string;
}

export interface KnowledgeStructureSummary {
  scannedAt: string;
  healthScore: number;
  totalNotes: number;
  rootNotes: number;
  maxDepth: number;
  findingCount: number;
  affectedNoteCount: number;
  priorityIssueCount: number;
  issueCounts: Array<{ kind: KnowledgeStructureIssueKind; count: number }>;
  preview: OrganizeOverviewPreview<KnowledgeStructureIssue>;
}

export interface OrganizeSummary {
  pendingShortcut: {
    state: 'ready' | 'error';
    count: number | null;
    route: string;
    typeTotals?: Record<OrganizeResourceType, number> | null;
  };
  totals: {
    affectedResourceTotal: number;
    findingTotal: number;
    exact: boolean;
    hasMore: boolean;
  };
  issues: {
    untagged: OrganizeIssueSummary & { typeTotals?: Record<OrganizeResourceType, number> | null };
    duplicateBookmark: OrganizeIssueSummary & { groupCount?: number | null };
    bookmarkHealth: OrganizeIssueSummary & {
      coverage?: { checked: number; total: number } | null;
      alive?: number | null;
      unknownCount?: number | null;
      userNormalCount?: number | null;
      unchecked?: number | null;
      running?: boolean | null;
      runId?: string | null;
      runStatus?: BookmarkHealthScanStatus | null;
      startedAt?: string | null;
      completedAt?: string | null;
      lastCheckedAt?: string | null;
    };
  };
  previews?: {
    pending: OrganizeOverviewPreview<PendingOverviewItem>;
    untagged: OrganizeOverviewPreview<UntaggedOverviewItem>;
    duplicateBookmark: OrganizeOverviewPreview<DuplicateBookmarkOverviewItem>;
    bookmarkHealth: OrganizeOverviewPreview<BookmarkHealthOverviewItem>;
  };
  generatedAt: string;
}

export interface UntaggedResourceItem {
  resourceType: OrganizeResourceType;
  resourceId: string;
  title: string;
  summary: string;
  url?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface DuplicateBlocker {
  code: string;
  label: string;
  count: number;
}

export interface DuplicateBookmarkMember {
  id: string;
  name: string;
  url: string;
  createdAt?: string;
  updatedAt?: string;
  tags: Array<{ id: string; name: string }>;
  guard: {
    snapshot: number;
    noteReference: number;
    todoReference: number;
    todoSeriesReference: number;
    blockerCount: number;
    blockers: DuplicateBlocker[];
  };
}

export interface DuplicateBookmarkGroup {
  groupKey: string;
  url: string;
  memberCount: number;
  contextHash: string;
  recommendedKeepBookmarkId: string;
  recommendationReason?: string;
  canResolve: boolean;
  members: DuplicateBookmarkMember[];
}

export interface BookmarkHealthItem {
  id: string;
  name: string;
  url: string;
  observedCode?: string;
  checkedAt?: string;
  effectiveStatus: 'suspect' | 'alive' | 'unknown' | 'unchecked' | 'user_normal';
  hasSnapshot: boolean;
}

export type BookmarkHealthScanStatus = 'queued' | 'running' | 'succeeded' | 'completed_with_errors' | 'failed' | 'idle';

export interface BookmarkHealthScan {
  id: string;
  status: BookmarkHealthScanStatus;
  running: boolean;
  total: number;
  processed: number;
  checked: number;
  alive: number;
  suspect: number;
  unknown: number;
  skipped: number;
  failed: number;
  startedAt?: string | null;
  completedAt?: string | null;
  errorCode?: string | null;
}

export interface BookmarkHealthSummary {
  total: number;
  checked: number;
  alive: number;
  suspectCount: number;
  unknown: number;
  userNormal: number;
  unchecked: number;
  running: boolean;
  runId: string;
  runStatus: BookmarkHealthScanStatus;
  startedAt?: string | null;
  completedAt?: string | null;
  lastCheckedAt?: string | null;
  pollAfterMs?: number;
  scan: BookmarkHealthScan | null;
  suspect: BookmarkHealthItem[];
}

export interface OrganizeIssueListResponse<T> {
  items: T[];
  nextCursor: string | null;
  hasMore: boolean;
}

export type OrganizeAiSuggestionResourceType = 'bookmark' | 'note';
export type OrganizeAiSuggestionScopeMode = 'selected' | 'untagged';
export type OrganizeAiSuggestionBatchStatus =
  | 'queued'
  | 'running'
  | 'ready'
  | 'partial'
  | 'failed'
  | 'completed'
  | 'cancelled';
export type OrganizeAiSuggestionStatus =
  | 'queued'
  | 'running'
  | 'pending'
  | 'no_suggestion'
  | 'failed'
  | 'accepted'
  | 'ignored'
  | 'conflict';

export interface OrganizeAiSuggestionEstimate {
  featureEnabled: boolean;
  maxItemsPerBatch: number;
  scope: {
    mode: OrganizeAiSuggestionScopeMode;
    resourceType: OrganizeAiSuggestionResourceType;
    requestedCount: number;
    eligibleCount: number;
    skippedCount: number;
  };
  estimate: {
    estimatedTokensLower: number;
    estimatedTokensUpper: number;
  };
  canCreate: boolean;
}

export interface OrganizeAiSuggestionTag {
  evidence?: string;
  evidenceRef?: string;
  evidenceType?: 'text' | 'visual' | 'filename';
  locator?: string;
  id: string | null;
  name: string;
  source?: 'existing' | 'new';
  confidence?: number;
}

export interface OrganizeAiSuggestion {
  id: string;
  resource: {
    type: OrganizeAiSuggestionResourceType;
    id: string;
    title: string;
    version: string;
  };
  currentTags: Array<{ id: string; name: string }>;
  recommendedTags: OrganizeAiSuggestionTag[];
  reason: string;
  status: OrganizeAiSuggestionStatus;
  acceptedTags?: Array<{ id: string; name: string }>;
  updatedAt?: string | null;
  lastErrorCode?: string | null;
}

export interface OrganizeAiSuggestionBatch {
  id: string;
  groupId?: string | null;
  resourceType: OrganizeAiSuggestionResourceType;
  scopeMode: OrganizeAiSuggestionScopeMode;
  status: OrganizeAiSuggestionBatchStatus;
  progress: {
    total: number;
    processed: number;
    ready: number;
    failed: number;
    accepted: number;
    ignored: number;
    conflicted: number;
    percent: number;
  };
  createdAt: string;
  startedAt?: string | null;
  finishedAt?: string | null;
  lastErrorCode?: string | null;
  suggestions?: OrganizeAiSuggestion[];
  nextCursor?: string | null;
}

export interface OrganizeAiSuggestionBatchList {
  items: OrganizeAiSuggestionBatch[];
  nextCursor: string | null;
}

export const getOrganizeSummary = (): Promise<ApiResponse> =>
  apiBaseGet('/api/organize/summary', undefined, { silent: true });

export const getOrganizeKnowledgeStructureSummary = (): Promise<ApiResponse> =>
  apiBaseGet('/api/organize/knowledge-structure/summary', undefined, { silent: true });

export const getOrganizeIssueList = (
  issueType: OrganizeIssueType,
  params: { cursor?: string | null; limit?: number; keyword?: string; resourceType?: string; kind?: string },
): Promise<ApiResponse> => apiBaseGet(`/api/organize/issues/${issueType}`, params, { silent: true });

export const ignoreUntaggedResources = (items: Array<{ resourceType: OrganizeResourceType; resourceId: string }>) =>
  apiBasePost('/api/organize/untagged/ignore', { items }, { silent: true });

export const unignoreUntaggedResources = (items: Array<{ resourceType: OrganizeResourceType; resourceId: string }>) =>
  apiBaseDelete('/api/organize/untagged/ignore', { items }, { silent: true });

export const getDuplicateBookmarkPreview = (groupKey: string) =>
  apiBaseGet(`/api/organize/duplicate-bookmarks/${groupKey}/preview`, undefined, { silent: true });

export const resolveDuplicateBookmarks = (
  groupKey: string,
  payload: {
    keepBookmarkId: string;
    deleteBookmarkIds: string[];
    mergeTags: boolean;
    expectedContextHash: string;
    clientRequestId: string;
  },
) => apiBasePost(`/api/organize/duplicate-bookmarks/${groupKey}/resolve`, payload, { silent: true });

export const ignoreDuplicateBookmarks = (groupKey: string) =>
  apiBasePost(`/api/organize/duplicate-bookmarks/${groupKey}/ignore`, {}, { silent: true });

export const unignoreDuplicateBookmarks = (groupKey: string) =>
  apiBaseDelete(`/api/organize/duplicate-bookmarks/${groupKey}/ignore`, undefined, { silent: true });

export const getBookmarkHealth = ({ includeSuspect = true }: { includeSuspect?: boolean } = {}) =>
  apiBaseGet('/api/organize/bookmark-health', { includeSuspect: includeSuspect ? 1 : 0 }, { silent: true });
export const startBookmarkHealthScan = () => apiBasePost('/api/organize/bookmark-health/scan', {}, { silent: true });
export const recheckBookmarkHealth = (bookmarkId: string) =>
  apiBasePost(`/api/organize/bookmark-health/${bookmarkId}/recheck`, {}, { silent: true });
export const markBookmarkHealthNormal = (bookmarkId: string) =>
  apiBasePost(`/api/organize/bookmark-health/${bookmarkId}/mark-normal`, {}, { silent: true });
export const unmarkBookmarkHealthNormal = (bookmarkId: string) =>
  apiBaseDelete(`/api/organize/bookmark-health/${bookmarkId}/mark-normal`, undefined, { silent: true });

export const estimateOrganizeAiSuggestions = (payload: {
  resourceType: OrganizeAiSuggestionResourceType;
  resourceIds?: string[];
  scope: OrganizeAiSuggestionScopeMode;
}) => apiBasePost('/api/organize/ai-suggestions/estimate', payload, { silent: true });

export const createOrganizeAiSuggestionBatch = (payload: {
  requestId: string;
  groupId?: string;
  resourceType: OrganizeAiSuggestionResourceType;
  resourceIds?: string[];
  scope: OrganizeAiSuggestionScopeMode;
}) => apiBasePost('/api/organize/ai-suggestions/batches', payload, { silent: true });

export const getOrganizeAiSuggestionBatches = (params: {
  cursor?: string | null;
  limit?: number;
  status?: OrganizeAiSuggestionBatchStatus;
  groupId?: string;
} = {}) => apiBaseGet('/api/organize/ai-suggestions/batches', params, { silent: true });

export const getOrganizeAiSuggestionBatch = (batchId: string, params: { cursor?: string | null; limit?: number } = {}) =>
  apiBaseGet(`/api/organize/ai-suggestions/batches/${encodeURIComponent(batchId)}`, params, { silent: true });

export const updateOrganizeAiSuggestion = (batchId: string, suggestionId: string, tagNames: string[]) =>
  apiBasePut(
    `/api/organize/ai-suggestions/batches/${encodeURIComponent(batchId)}/suggestions/${encodeURIComponent(suggestionId)}`,
    { tagNames },
    { silent: true },
  );

export const acceptOrganizeAiSuggestion = (
  batchId: string,
  suggestionId: string,
  selection?: string[] | { tags: OrganizeAiSuggestionTag[] },
) =>
  apiBasePost(
    `/api/organize/ai-suggestions/batches/${encodeURIComponent(batchId)}/suggestions/${encodeURIComponent(suggestionId)}/accept`,
    Array.isArray(selection) ? { tagNames: selection } : selection || {},
    { silent: true },
  );

export const ignoreOrganizeAiSuggestion = (batchId: string, suggestionId: string) =>
  apiBasePost(
    `/api/organize/ai-suggestions/batches/${encodeURIComponent(batchId)}/suggestions/${encodeURIComponent(suggestionId)}/ignore`,
    {},
    { silent: true },
  );
