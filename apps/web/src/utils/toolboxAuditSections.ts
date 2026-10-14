import { marked } from 'marked';
export function parseToolboxAuditSections(content: string) {
  const sections: Array<{ id: string; title: string; content: string }> = [];
  let current: (typeof sections)[number] | null = null;
  for (const token of marked.lexer(content)) {
    if (token.type === 'heading' && token.depth === 2) {
      current = { id: String(sections.length), title: token.text, content: '' };
      sections.push(current);
    } else if (current) current.content += token.raw;
  }
  return sections.filter((section) => section.content.trim());
}
