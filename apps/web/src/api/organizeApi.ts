import { apiBaseDelete, apiBaseGet, apiBasePost, type ApiResponse } from '@/http/request';

export type OrganizeIssueType = 'untagged' | 'duplicate_bookmark' | 'bookmark_health';
export type OrganizeResourceType = 'bookmark' | 'note' | 'file';

export interface OrganizeIssueSummary {
  state: 'ready' | 'loading' | 'stale' | 'error';
  findingCount: number | null;
  affectedResourceCount: number | null;
  exact: boolean;
  hasMore: boolean;
  updatedAt?: string | null;
  errorCode?: string | null;
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
    untagged: OrganizeIssueSummary;
    duplicateBookmark: OrganizeIssueSummary & { groupCount?: number | null };
    bookmarkHealth: OrganizeIssueSummary & {
      coverage?: { checked: number; total: number } | null;
      unknownCount?: number;
      userNormalCount?: number;
    };
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

export interface OrganizeIssueListResponse<T> {
  items: T[];
  nextCursor: string | null;
  hasMore: boolean;
}

export const getOrganizeSummary = (): Promise<ApiResponse> =>
  apiBaseGet('/api/organize/summary', undefined, { silent: true });

export const getOrganizeIssueList = (
  issueType: OrganizeIssueType,
  params: { cursor?: string | null; limit?: number; keyword?: string; resourceType?: string },
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

export const getBookmarkHealth = () => apiBaseGet('/api/organize/bookmark-health', undefined, { silent: true });
export const checkBookmarkHealthBatch = () =>
  apiBasePost('/api/organize/bookmark-health/check-batch', {}, { silent: true });
export const recheckBookmarkHealth = (bookmarkId: string) =>
  apiBasePost(`/api/organize/bookmark-health/${bookmarkId}/recheck`, {}, { silent: true });
export const markBookmarkHealthNormal = (bookmarkId: string) =>
  apiBasePost(`/api/organize/bookmark-health/${bookmarkId}/mark-normal`, {}, { silent: true });
export const unmarkBookmarkHealthNormal = (bookmarkId: string) =>
  apiBaseDelete(`/api/organize/bookmark-health/${bookmarkId}/mark-normal`, undefined, { silent: true });
