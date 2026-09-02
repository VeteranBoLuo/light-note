export const HELP_KNOWLEDGE_CATEGORY = '帮助中心';
export const DEFAULT_HELP_SECTION = '其他帮助';

export function normalizeKnowledgeHelpSection(value, category = HELP_KNOWLEDGE_CATEGORY) {
  if (category !== HELP_KNOWLEDGE_CATEGORY) return null;
  const section = String(value || '')
    .trim()
    .replace(/\s+/gu, ' ');
  if (section.length > 50) throw new Error('HELP_SECTION_TOO_LONG: 帮助栏目不能超过 50 个字符');
  return section || DEFAULT_HELP_SECTION;
}

export function toPublicHelpArticle(row = {}) {
  return {
    id: row.id,
    title: row.title,
    content: row.content,
    sort: row.sort,
    help_section: normalizeKnowledgeHelpSection(row.help_section),
  };
}
