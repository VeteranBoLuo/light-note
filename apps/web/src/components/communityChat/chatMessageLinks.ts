import { SITE_ORIGIN } from '@/utils/seoMeta';

export type ChatMessageTextPart = { type: 'text'; value: string } | { type: 'link'; value: string };

// Only explicit http(s) URLs. ASCII-only characters let a link end at adjacent Chinese text or punctuation.
const LINK_PATTERN = /https?:\/\/[\w\-.~:/?#[\]@!$&()*+,;=%]+/gi;
const SITE_HOST = new URL(SITE_ORIGIN).host;

const count = (value: string, char: string) => value.split(char).length - 1;

/** Sentence punctuation and an unmatched closing bracket after a URL belong to the surrounding text. */
function trimLinkEnd(value: string) {
  let end = value.length;
  while (end > 0) {
    const body = value.slice(0, end),
      last = body[end - 1];
    if ('.,;:!?'.includes(last)) end--;
    else if (last === ')' && count(body, '(') < count(body, ')')) end--;
    else if (last === ']' && count(body, '[') < count(body, ']')) end--;
    else break;
  }
  return value.slice(0, end);
}

function isHttpUrl(value: string) {
  try {
    const url = new URL(value);
    return (url.protocol === 'http:' || url.protocol === 'https:') && Boolean(url.hostname);
  } catch {
    return false;
  }
}

export function splitChatMessageLinks(text: string): ChatMessageTextPart[] {
  const parts: ChatMessageTextPart[] = [];
  let cursor = 0;
  for (const match of text.matchAll(LINK_PATTERN)) {
    const value = trimLinkEnd(match[0]),
      start = match.index ?? 0;
    if (!isHttpUrl(value)) continue;
    if (start > cursor) parts.push({ type: 'text', value: text.slice(cursor, start) });
    parts.push({ type: 'link', value });
    cursor = start + value.length;
  }
  if (cursor < text.length) parts.push({ type: 'text', value: text.slice(cursor) });
  return parts;
}

/** In-app path for a Light Note link, or null when the link belongs to another site. */
export function chatMessageLinkAppPath(href: string, origin = window.location.origin): string | null {
  const url = new URL(href);
  if (url.origin !== origin && url.host !== SITE_HOST) return null;
  return url.pathname + url.search + url.hash;
}
