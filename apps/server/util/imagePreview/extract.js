import { parseDocument } from 'htmlparser2';
import { marked } from 'marked';
import { localImageLocator } from './sources.js';
/** Parse actual images, not URL-like text, links or fenced code. */
export function extractManagedImages(content, type = 'html') {
  if (type === 'drawing') return [];
  const html = type === 'markdown' ? marked.parse(String(content || ''), { async: false }) : String(content || '');
  const root = parseDocument(html);
  const found = new Map();
  const stack = [root];
  while (stack.length) {
    const node = stack.pop();
    if (['script', 'style', 'code', 'pre'].includes(node.name)) continue;
    if (node.name === 'img') {
      const locator = localImageLocator(String(node.attribs?.src || ''));
      if (locator) found.set(locator, `https://boluo66.top/uploads/${encodeURIComponent(locator)}`);
    }
    if (node.children) stack.push(...node.children);
  }
  return [...found.values()];
}
