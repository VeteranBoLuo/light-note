const HTML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

export function escapeHtml(input: unknown): string {
  return String(input ?? '').replace(/[&<>"']/g, (char) => HTML_ESCAPES[char]);
}

/**
 * 命中词高亮：先转义防 XSS，再把命中词包进 <mark>。
 * 返回值只能交给 v-html，调用方不得再拼接未转义内容。
 */
export function highlightKeyword(text: unknown, keyword: string): string {
  const safe = escapeHtml(text);
  const normalized = String(keyword || '').trim();
  if (!normalized) return safe;
  const pattern = escapeHtml(normalized).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  if (!pattern) return safe;
  return safe.replace(new RegExp(`(${pattern})`, 'gi'), '<mark class="gs-highlight">$1</mark>');
}
