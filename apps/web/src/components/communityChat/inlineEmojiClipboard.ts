import { COMMUNITY_CHAT_INLINE_EMOJIS, countCommunityChatInlineEmojis } from '@lightnote/shared/community-chat-inline-emojis';

const MIME = 'application/x-lightnote-inline-emoji-text';
const knownTokens = new Set(COMMUNITY_CHAT_INLINE_EMOJIS.map((emoji) => emoji.token));

function selectionText(node: Node, preserveEmoji: boolean): string {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent || '';
  if (node instanceof HTMLElement && ['SCRIPT', 'STYLE'].includes(node.tagName)) return '';
  if (node instanceof HTMLImageElement) {
    const token = node.dataset.inlineEmojiToken || '';
    return knownTokens.has(token) ? (preserveEmoji ? token : `[${node.alt}]`) : node.alt;
  }
  if (node instanceof HTMLBRElement) return '\n';
  const text = Array.from(node.childNodes).map((child) => selectionText(child, preserveEmoji)).join('');
  return node instanceof HTMLParagraphElement || node instanceof HTMLDivElement ? `${text}\n` : text;
}

export function copyInlineEmojiSelection(event: ClipboardEvent) {
  if (event.defaultPrevented) return;
  const selection = window.getSelection();
  if (!event.clipboardData || !selection?.rangeCount || selection.isCollapsed) return;
  const fragment = selection.getRangeAt(0).cloneContents();
  if (!Array.from(fragment.querySelectorAll('img')).some((image) => knownTokens.has(image.dataset.inlineEmojiToken || ''))) return;
  event.clipboardData.setData('text/plain', selectionText(fragment, false));
  event.clipboardData.setData(MIME, selectionText(fragment, true));
  event.preventDefault();
}

export function readInlineEmojiClipboard(event: ClipboardEvent): string | null {
  const text = event.clipboardData?.getData(MIME) || '';
  if (countCommunityChatInlineEmojis(text) > 0) return text;
  const html = event.clipboardData?.getData('text/html');
  if (!html) return null;
  // Read token metadata only; never insert clipboard HTML into the editor.
  const body = new DOMParser().parseFromString(html, 'text/html').body;
  if (!Array.from(body.querySelectorAll('img')).some((image) => knownTokens.has(image.dataset.inlineEmojiToken || ''))) return null;
  return selectionText(body, true);
}
