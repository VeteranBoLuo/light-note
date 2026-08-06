import { searchPersonalKnowledge } from '../personalKnowledgeSearch.js';

const MAX_SCOPE_MATERIALS = 12;
const MAX_SCOPE_SEARCH_HITS = 20;
const MAX_MATERIAL_CONTENT_CHARS = 4_000;

function normalizeId(value) {
  return String(value ?? '').trim();
}

function materialContent(hit) {
  const section = String(hit?.sectionTitle || '').trim();
  const excerpt = String(hit?.excerpt || '').trim();
  if (!excerpt) return '';
  return [section ? `小节：${section}` : '', excerpt].filter(Boolean).join('\n');
}

/**
 * 为“根据 @目录 生成笔记”取得有界材料。这里只做普通 Top-N 检索，不枚举并拼接
 * 全部正文；allowlist 来自 resolveNoteBranchScopes 的 owner 权威快照。即便搜索层
 * 意外返回范围外命中，这里仍会二次过滤，避免目录仅被当成保存位置而非读取边界。
 */
export async function resolveNoteDraftScopeMaterials({ userId, resolvedScopes, query } = {}) {
  const normalizedUserId = normalizeId(userId);
  const noteIds = [...new Set((resolvedScopes?.noteIds || []).map(normalizeId).filter(Boolean))];
  const normalizedQuery = String(query || '')
    .trim()
    .slice(0, 500);
  if (!normalizedUserId || !noteIds.length || !normalizedQuery) {
    return { materials: [], entityRefs: [], matchedPageCount: 0, totalPages: noteIds.length };
  }

  const allowedIds = new Set(noteIds);
  const resourceIds = noteIds.map((id) => ({ type: 'note', id }));
  const result = await searchPersonalKnowledge({
    userId: normalizedUserId,
    query: normalizedQuery,
    limit: MAX_SCOPE_SEARCH_HITS,
    scope: { types: ['note'], resourceIds },
  });

  const grouped = new Map();
  for (const hit of Array.isArray(result?.hits) ? result.hits : []) {
    const id = normalizeId(hit?.id);
    if (String(hit?.type || '') !== 'note' || !id || !allowedIds.has(id)) continue;
    const content = materialContent(hit);
    if (!content) continue;
    const existing = grouped.get(id);
    if (existing) {
      if (!existing.content.includes(content)) {
        existing.content = `${existing.content}\n\n${content}`.slice(0, MAX_MATERIAL_CONTENT_CHARS);
      }
      continue;
    }
    if (grouped.size >= MAX_SCOPE_MATERIALS) continue;
    grouped.set(id, {
      type: 'note',
      id,
      title: String(hit?.title || '无标题笔记').trim().slice(0, 255) || '无标题笔记',
      content: content.slice(0, MAX_MATERIAL_CONTENT_CHARS),
    });
  }

  const materials = [...grouped.values()];
  return {
    materials,
    entityRefs: materials.map(({ id, title }) => ({ type: 'note', id, title })),
    matchedPageCount: materials.length,
    totalPages: noteIds.length,
  };
}

export const __testing = {
  MAX_SCOPE_MATERIALS,
  MAX_SCOPE_SEARCH_HITS,
};
