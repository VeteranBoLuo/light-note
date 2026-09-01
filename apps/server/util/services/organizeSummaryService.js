import pool from '../../db/index.js';
import { listInboxResources, queryPendingCount } from '../resourceInbox.js';
import { getHealthSummary, listBookmarkHealthIssues } from '../linkHealth.js';
import { getDuplicateBookmarkSummary } from './bookmarkDuplicateService.js';
import { getUntaggedSummary, listUntaggedResources } from './resourceInventoryService.js';

const PREVIEW_LIMITS = Object.freeze({
  pending: 5,
  untagged: 3,
  duplicateBookmark: 3,
  bookmarkHealth: 3,
});

async function getHealthIssueKeys(userId, maxKeys = 5000) {
  const [rows] = await pool.query(
    `SELECT b.id, h.checked_at AS checkedAt
       FROM bookmark_health h
       INNER JOIN bookmark b
         ON b.id = h.bookmark_id AND b.user_id = h.user_id AND b.url_exact_hash = h.checked_url_hash
      WHERE h.user_id = ? AND b.del_flag = 0
        AND h.observed_status = 'suspect' AND h.user_override IS NULL
      ORDER BY h.checked_at DESC, b.id DESC
      LIMIT ?`,
    [userId, maxKeys + 1],
  );
  const hasMore = rows.length > maxKeys;
  return {
    resourceKeys: rows.slice(0, maxKeys).map((row) => `bookmark:${row.id}`),
    exact: !hasMore,
    hasMore,
    updatedAt: rows[0]?.checkedAt || null,
  };
}

function failedIssue(errorCode) {
  return {
    state: 'error',
    findingCount: null,
    affectedResourceCount: null,
    exact: false,
    hasMore: false,
    updatedAt: null,
    errorCode,
  };
}

function readyPreview(result, limit, mapItem = (item) => item) {
  const source = Array.isArray(result?.items) ? result.items : [];
  return {
    state: 'ready',
    items: source.slice(0, limit).map(mapItem),
    hasMore: Boolean(result?.hasMore || result?.nextCursor || source.length > limit),
    errorCode: null,
  };
}

function failedPreview(errorCode) {
  return {
    state: 'error',
    items: [],
    hasMore: false,
    errorCode,
  };
}

export async function getOrganizeSummary(userId) {
  const [
    pendingResult,
    untaggedResult,
    duplicateResult,
    healthResult,
    pendingPreviewResult,
    untaggedPreviewResult,
    healthPreviewResult,
  ] = await Promise.allSettled([
    queryPendingCount(pool, userId),
    getUntaggedSummary(pool, { userId }),
    getDuplicateBookmarkSummary(pool, { userId }),
    Promise.all([getHealthSummary(userId, { includeSuspect: false }), getHealthIssueKeys(userId)]),
    listInboxResources(pool, {
      userId,
      type: 'all',
      keyword: '',
      sort: 'newest',
      limit: PREVIEW_LIMITS.pending,
      view: 'summary',
      includeTotal: false,
      includeCounts: false,
    }),
    listUntaggedResources(pool, {
      userId,
      keyword: '',
      resourceType: 'all',
      limit: PREVIEW_LIMITS.untagged,
    }),
    listBookmarkHealthIssues(userId, { limit: PREVIEW_LIMITS.bookmarkHealth }),
  ]);

  const affectedKeys = new Set();
  let findingTotal = 0;
  let exact = true;

  const pendingShortcut =
    pendingResult.status === 'fulfilled'
      ? {
          state: 'ready',
          count: Number(pendingResult.value.pendingTotal || 0),
          typeTotals: pendingResult.value.typeTotals,
          route: '/organize?issue=pending',
        }
      : {
          state: 'error',
          count: null,
          typeTotals: null,
          route: '/organize?issue=pending',
          errorCode: 'INBOX_COUNT_FAILED',
        };

  let untagged;
  if (untaggedResult.status === 'fulfilled') {
    const value = untaggedResult.value;
    value.resourceKeys.forEach((key) => affectedKeys.add(key));
    findingTotal += value.findingCount;
    exact = exact && value.exact;
    untagged = {
      state: 'ready',
      findingCount: value.findingCount,
      affectedResourceCount: value.affectedResourceCount,
      exact: value.exact,
      hasMore: value.hasMore,
      updatedAt: new Date().toISOString(),
      errorCode: null,
    };
  } else {
    exact = false;
    untagged = failedIssue('UNTAGGED_SUMMARY_FAILED');
  }

  let duplicateBookmark;
  if (duplicateResult.status === 'fulfilled') {
    const value = duplicateResult.value;
    value.resourceKeys.forEach((key) => affectedKeys.add(key));
    findingTotal += value.findingCount;
    exact = exact && value.exact;
    duplicateBookmark = {
      state: 'ready',
      groupCount: value.groupCount,
      findingCount: value.findingCount,
      affectedResourceCount: value.affectedResourceCount,
      exact: value.exact,
      hasMore: value.hasMore,
      updatedAt: new Date().toISOString(),
      errorCode: null,
    };
  } else {
    exact = false;
    duplicateBookmark = { ...failedIssue('DUPLICATE_SUMMARY_FAILED'), groupCount: null };
  }

  let bookmarkHealth;
  if (healthResult.status === 'fulfilled') {
    const [summary, keys] = healthResult.value;
    keys.resourceKeys.forEach((key) => affectedKeys.add(key));
    findingTotal += Number(summary.suspectCount || 0);
    exact = exact && keys.exact;
    bookmarkHealth = {
      state: 'ready',
      findingCount: Number(summary.suspectCount || 0),
      affectedResourceCount: Number(summary.suspectCount || 0),
      // 健康统计由聚合 SQL 精确返回；keys 的截断只影响跨问题去重后的总资源数。
      exact: true,
      hasMore: false,
      coverage: { checked: Number(summary.checked || 0), total: Number(summary.total || 0) },
      alive: Number(summary.alive || 0),
      unknownCount: Number(summary.unknown || 0),
      userNormalCount: Number(summary.userNormal || 0),
      unchecked: Number(summary.unchecked || 0),
      running: Boolean(summary.running),
      runId: summary.runId || null,
      runStatus: summary.runStatus || 'idle',
      startedAt: summary.startedAt || null,
      completedAt: summary.completedAt || null,
      lastCheckedAt: summary.lastCheckedAt || null,
      updatedAt: summary.lastCheckedAt || keys.updatedAt,
      errorCode: null,
    };
  } else {
    exact = false;
    bookmarkHealth = {
      ...failedIssue('BOOKMARK_HEALTH_SUMMARY_FAILED'),
      coverage: null,
      alive: null,
      unknownCount: null,
      userNormalCount: null,
      unchecked: null,
      running: null,
      runId: null,
      runStatus: null,
      startedAt: null,
      completedAt: null,
      lastCheckedAt: null,
    };
  }

  const pendingPreview =
    pendingPreviewResult.status === 'fulfilled'
      ? readyPreview(pendingPreviewResult.value, PREVIEW_LIMITS.pending, (item) => ({
          resourceType: item.resourceType,
          resourceId: String(item.resourceId),
          title: item.title || '',
          source: item.source || '',
          collectedAt: item.collectedAt || null,
        }))
      : failedPreview('PENDING_PREVIEW_FAILED');
  const untaggedPreview =
    untaggedPreviewResult.status === 'fulfilled'
      ? readyPreview(untaggedPreviewResult.value, PREVIEW_LIMITS.untagged, (item) => ({
          resourceType: item.resourceType,
          resourceId: String(item.resourceId),
          title: item.title || '',
          updatedAt: item.updatedAt || item.createdAt || null,
        }))
      : failedPreview('UNTAGGED_PREVIEW_FAILED');
  const duplicatePreview =
    duplicateResult.status === 'fulfilled'
      ? readyPreview(
          {
            items: duplicateResult.value.previewItems,
            hasMore: duplicateResult.value.previewHasMore,
          },
          PREVIEW_LIMITS.duplicateBookmark,
        )
      : failedPreview('DUPLICATE_PREVIEW_FAILED');
  const bookmarkHealthPreview =
    healthPreviewResult.status === 'fulfilled'
      ? readyPreview(healthPreviewResult.value, PREVIEW_LIMITS.bookmarkHealth, (item) => ({
          id: String(item.id),
          name: item.name || '',
          observedCode: item.observedCode || null,
          checkedAt: item.checkedAt || null,
        }))
      : failedPreview('BOOKMARK_HEALTH_PREVIEW_FAILED');

  return {
    pendingShortcut,
    totals: {
      affectedResourceTotal: affectedKeys.size,
      findingTotal,
      exact,
      hasMore: !exact,
    },
    issues: { untagged, duplicateBookmark, bookmarkHealth },
    previews: {
      pending: pendingPreview,
      untagged: untaggedPreview,
      duplicateBookmark: duplicatePreview,
      bookmarkHealth: bookmarkHealthPreview,
    },
    generatedAt: new Date().toISOString(),
  };
}
