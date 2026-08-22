const NOTE_TYPE_ORDER = Object.freeze(['html', 'markdown', 'drawing']);

export const NOTE_TYPE_LABEL = Object.freeze({
  html: '富文本',
  markdown: 'Markdown',
  drawing: '手绘',
});

const NOTE_TYPE_ALIASES = new Map(
  Object.entries({
    html: ['html', 'richtext', 'rich-text', 'rich_text', '富文本', '富文本笔记'],
    markdown: ['markdown', 'md', 'markdown笔记', 'md笔记'],
    drawing: ['drawing', 'canvas', 'sketch', '手绘', '绘画', '画布', '手绘笔记', '绘画笔记'],
  }).flatMap(([type, aliases]) => aliases.map((alias) => [alias, type])),
);

function compact(value) {
  return String(value || '')
    .normalize('NFKC')
    .trim()
    .toLowerCase()
    .replace(/\s+/gu, '');
}

/**
 * 笔记类型是产品受控枚举，不是可全文搜索的自由文本。
 * 别名只做枚举归一化，不从长句中抽词，避免把“富文本编辑器优化”这类真实关键词误当类型筛选。
 */
export function normalizeNoteType(value, { allowAll = true } = {}) {
  const normalized = compact(value);
  if (!normalized) return '';
  if (allowAll && ['all', '*', '全部', '所有'].includes(normalized)) return 'all';
  return NOTE_TYPE_ALIASES.get(normalized) || '';
}

export function isStandaloneNoteTypeAlias(value) {
  return Boolean(normalizeNoteType(value, { allowAll: false }));
}

/**
 * 旧数据中空类型/未知类型与前端编辑器的既有容错一致，统一视为 html；
 * md 是旧版 Markdown 别名。alias 只允许内部常量，不接受用户输入。
 */
export function noteTypeSql(alias = 'n') {
  if (!/^[a-z][a-z0-9_]*$/iu.test(alias)) throw new TypeError('笔记表别名无效');
  return `CASE
    WHEN LOWER(COALESCE(NULLIF(${alias}.type, ''), 'html')) IN ('markdown', 'md') THEN 'markdown'
    WHEN LOWER(COALESCE(NULLIF(${alias}.type, ''), 'html')) = 'drawing' THEN 'drawing'
    ELSE 'html'
  END`;
}

export function noteTypeBreakdownFromRows(rows = []) {
  const map = Object.fromEntries(NOTE_TYPE_ORDER.map((type) => [type, 0]));
  for (const row of rows || []) {
    const type = normalizeNoteType(row?.note_type ?? row?.type ?? row?.category, { allowAll: false });
    if (!type) continue;
    const count = Number(row?.c ?? row?.count ?? 0);
    if (Number.isFinite(count) && count >= 0) map[type] = Math.trunc(count);
  }
  return Object.freeze(map);
}

export function formatNoteTypeBreakdown(value = {}) {
  return NOTE_TYPE_ORDER.map((type) => `${NOTE_TYPE_LABEL[type]} ${Number(value?.[type] || 0)} 条`).join('、');
}

export const NOTE_TYPES = NOTE_TYPE_ORDER;
