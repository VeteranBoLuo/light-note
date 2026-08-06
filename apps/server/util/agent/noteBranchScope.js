import pool from '../../db/index.js';
import {
  loadOwnedNoteTree,
  resolveNoteDescendantIdsFromSnapshot,
} from '../services/noteTreeService.js';

export const MAX_AI_SCOPE_REFS = 3;

const SUPPORTED_SCOPE_TYPES = new Set(['note_branch']);

function normalizeId(value) {
  return String(value ?? '').trim();
}

export class NoteBranchScopeError extends Error {
  constructor(code, message, status = 400, details = null) {
    super(message);
    this.name = 'NoteBranchScopeError';
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

function normalizeScopeRefs(scopeRefs) {
  if (scopeRefs == null) return [];
  if (!Array.isArray(scopeRefs)) {
    throw new NoteBranchScopeError('AI_SCOPE_REFS_INVALID', '目录范围格式无效', 400);
  }
  if (scopeRefs.length > MAX_AI_SCOPE_REFS) {
    throw new NoteBranchScopeError(
      'AI_SCOPE_REFS_LIMIT_EXCEEDED',
      `单次最多选择 ${MAX_AI_SCOPE_REFS} 个目录范围`,
      400,
      { maxScopeRefs: MAX_AI_SCOPE_REFS },
    );
  }

  const normalized = [];
  const seen = new Set();
  for (const item of scopeRefs) {
    const type = normalizeId(item?.type);
    const id = normalizeId(item?.id);
    if (!SUPPORTED_SCOPE_TYPES.has(type) || !id || id.length > 255) {
      throw new NoteBranchScopeError('AI_SCOPE_REF_INVALID', '目录范围引用无效', 400);
    }
    const key = `${type}:${id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    normalized.push({ type, id });
  }
  return normalized;
}

/**
 * 把客户端只提交的目录根 ID 解析成当前 owner 的权威笔记 allowlist。
 *
 * 客户端 title、数量、后代 ID 与正文一律不参与解析；目录被删除、换号或不属于
 * 当前 subject 时统一失败关闭，避免旧缓存或跨账号 ID 静默退化成全库检索。
 */
export async function resolveNoteBranchScopes({ userId, scopeRefs, db = pool } = {}) {
  const normalizedUserId = normalizeId(userId);
  if (!normalizedUserId) {
    throw new NoteBranchScopeError('AI_SCOPE_USER_REQUIRED', '缺少用户身份', 401);
  }
  const refs = normalizeScopeRefs(scopeRefs);
  if (!refs.length) {
    return { refs: [], resourceIds: [], noteIds: [], branches: [] };
  }

  const snapshot = await loadOwnedNoteTree(normalizedUserId, { db });
  const noteIds = [];
  const seenNoteIds = new Set();
  const branches = [];

  for (const ref of refs) {
    const root = snapshot.nodesById.get(ref.id);
    if (!root || root.delFlag !== 0) {
      throw new NoteBranchScopeError(
        'AI_NOTE_BRANCH_NOT_FOUND',
        '所选目录不存在、已删除或不属于当前账号',
        404,
        { rootId: ref.id },
      );
    }
    const branchNoteIds = resolveNoteDescendantIdsFromSnapshot(snapshot, ref.id, { includeRoot: true });
    for (const noteId of branchNoteIds) {
      if (seenNoteIds.has(noteId)) continue;
      seenNoteIds.add(noteId);
      noteIds.push(noteId);
    }
    branches.push({
      type: 'note_branch',
      id: root.id,
      title: root.title || '无标题笔记',
      totalPages: branchNoteIds.length,
      descendantCount: Math.max(0, branchNoteIds.length - 1),
      noteIds: branchNoteIds,
    });
  }

  return {
    refs: branches.map(({ type, id, title, totalPages }) => ({
      type,
      id,
      title,
      estimatedResourceCount: totalPages,
    })),
    noteIds,
    resourceIds: noteIds.map((id) => ({ type: 'note', id })),
    branches,
  };
}

export function buildNoteBranchRetrievalCoverage(resolvedScopes, sources = []) {
  const branches = Array.isArray(resolvedScopes?.branches) ? resolvedScopes.branches : [];
  if (!branches.length) return [];
  const citedNoteIds = new Set(
    (Array.isArray(sources) ? sources : [])
      .filter((source) => String(source?.resourceType || source?.type || '') === 'note')
      .map((source) => normalizeId(source?.resourceId ?? source?.id))
      .filter(Boolean),
  );
  return branches.map((branch) => {
    const branchIds = new Set(branch.noteIds || []);
    const matchedPages = [...citedNoteIds].filter((id) => branchIds.has(id)).length;
    return {
      mode: 'retrieval',
      rootId: branch.id,
      title: branch.title,
      totalPages: Number(branch.totalPages || branchIds.size || 0),
      matchedPages,
      completeAnalysis: false,
    };
  });
}

export const __testing = {
  normalizeScopeRefs,
};
