import pool from '../../db/index.js';
import { getToolboxKnowledgeOverview, ORGANIZE_KNOWLEDGE_ISSUE_KINDS } from '../toolbox/knowledgeStructure.js';

const PREVIEW_LIMIT = 3;
const DEFAULT_PAGE_LIMIT = 20;
const MAX_PAGE_LIMIT = 50;
const ORGANIZE_KNOWLEDGE_ISSUE_KIND_SET = new Set(ORGANIZE_KNOWLEDGE_ISSUE_KINDS);

function normalizedLimit(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return DEFAULT_PAGE_LIMIT;
  return Math.min(MAX_PAGE_LIMIT, Math.max(1, Math.floor(number)));
}

function encodeCursor(offset) {
  return Buffer.from(JSON.stringify({ offset }), 'utf8').toString('base64url');
}

function decodeCursor(value) {
  if (!value) return 0;
  try {
    const parsed = JSON.parse(Buffer.from(String(value), 'base64url').toString('utf8'));
    const offset = Number(parsed?.offset);
    if (!Number.isSafeInteger(offset) || offset < 0) throw new Error('invalid offset');
    return offset;
  } catch {
    throw Object.assign(new Error('知识结构分页参数无效'), {
      code: 'ORGANIZE_KNOWLEDGE_CURSOR_INVALID',
      status: 400,
    });
  }
}

function normalizeIssueKind(value) {
  const kind = String(value || 'all').trim();
  if (kind === 'all') return null;
  if (ORGANIZE_KNOWLEDGE_ISSUE_KIND_SET.has(kind)) return kind;
  throw Object.assign(new Error('不支持的知识结构问题类型'), {
    code: 'ORGANIZE_KNOWLEDGE_KIND_INVALID',
    status: 400,
  });
}

function organizeIssueCounts(issueCounts = {}) {
  return ORGANIZE_KNOWLEDGE_ISSUE_KINDS.map((kind) => ({
    kind,
    count: Math.max(0, Number(issueCounts[kind] || 0)),
  }));
}

function organizeHealthScore(totalNotes, issueCounts = {}) {
  const total = Math.max(0, Number(totalNotes || 0));
  if (!total) return 100;
  const ratio = (kind) => Math.min(1, Math.max(0, Number(issueCounts[kind] || 0)) / total);
  const penalty =
    ratio('empty') * 24 +
    ratio('invalid_parent') * 20 +
    ratio('duplicate_title') * 14 +
    ratio('untitled') * 10 +
    ratio('deep') * 8;
  return Math.max(0, Math.min(100, Math.round(100 - penalty)));
}

export async function getOrganizeKnowledgeStructureSummary({ userId, db = pool } = {}) {
  const overview = await getToolboxKnowledgeOverview({
    userId,
    db,
    analysisOptions: {
      issueKinds: ORGANIZE_KNOWLEDGE_ISSUE_KINDS,
      issueLimit: PREVIEW_LIMIT,
      includeNodes: false,
    },
  });
  return {
    scannedAt: overview.scannedAt,
    healthScore: organizeHealthScore(overview.summary.total, overview.issueCounts),
    totalNotes: overview.summary.total,
    rootNotes: overview.summary.roots,
    maxDepth: overview.summary.maxDepth,
    findingCount: overview.selectedIssueTotal,
    affectedNoteCount: overview.selectedAffectedNoteCount,
    priorityIssueCount: overview.selectedSeverityCounts.high,
    issueCounts: organizeIssueCounts(overview.issueCounts),
    preview: {
      state: 'ready',
      items: overview.issues,
      hasMore: overview.selectedIssueTotal > overview.issues.length,
      errorCode: null,
    },
  };
}

export async function listOrganizeKnowledgeStructureIssues({ userId, cursor, limit, kind, db = pool } = {}) {
  const offset = decodeCursor(cursor);
  const pageLimit = normalizedLimit(limit);
  const selectedKind = normalizeIssueKind(kind);
  const overview = await getToolboxKnowledgeOverview({
    userId,
    db,
    analysisOptions: {
      issueKinds: selectedKind ? [selectedKind] : ORGANIZE_KNOWLEDGE_ISSUE_KINDS,
      issueOffset: offset,
      issueLimit: pageLimit + 1,
      includeNodes: false,
    },
  });
  const hasMore = overview.issues.length > pageLimit;
  const items = overview.issues.slice(0, pageLimit);
  return {
    items,
    nextCursor: hasMore ? encodeCursor(offset + items.length) : null,
    hasMore,
    scannedAt: overview.scannedAt,
  };
}

export const knowledgeStructureOrganizeInternals = Object.freeze({
  ORGANIZE_KNOWLEDGE_ISSUE_KINDS,
  decodeCursor,
  encodeCursor,
  organizeHealthScore,
  normalizeIssueKind,
});
