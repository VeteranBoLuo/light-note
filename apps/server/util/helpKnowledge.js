import { marked } from 'marked';

export const HELP_KNOWLEDGE_CATEGORY = '帮助中心';

export const DEFAULT_HELP_SECTION = '其他帮助';
/** 普通用户可读、可导航的公开帮助边界；站内帮助、公开帮助页与搜索引擎提交共用。 */
export const PUBLIC_HELP_ARTICLE_CONDITION =
  "category = '帮助中心' AND status = 'public' AND COALESCE(admin_archived, 0) = 0";

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
    // The public reader consumes HTML, while the knowledge editor retains its source format.
    content: row.type === 'markdown' ? marked.parse(String(row.content || ''), { async: false }) : row.content,
    sort: row.sort,
    help_section: normalizeKnowledgeHelpSection(row.help_section),
  };
}
