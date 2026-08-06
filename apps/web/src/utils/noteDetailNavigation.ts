const NOTE_LIBRARY_ORIGIN = 'https://light-note.local';
const MAX_RETURN_PATH_DEPTH = 8;

function firstQueryValue(value: unknown): string {
  const raw = Array.isArray(value) ? value[0] : value;
  return String(raw ?? '').trim();
}

/**
 * 从详情页历史遗留的嵌套 `from` 中提取最初的笔记库列表地址。
 *
 * 详情页之间只传递这个稳定列表来源，避免每进入一层子页面都把整段父详情 URL
 * 再塞进下一层 `from`，最终形成难以理解、也难以可靠回退的递归地址。
 */
export function resolveNoteLibraryListPath(value: unknown): string {
  let candidate = firstQueryValue(value);

  for (let depth = 0; candidate && depth < MAX_RETURN_PATH_DEPTH; depth += 1) {
    if (!candidate.startsWith('/') || candidate.startsWith('//')) return '';

    let parsed: URL;
    try {
      parsed = new URL(candidate, NOTE_LIBRARY_ORIGIN);
    } catch {
      return '';
    }

    if (parsed.origin !== NOTE_LIBRARY_ORIGIN) return '';
    if (parsed.pathname === '/noteLibrary') {
      return `${parsed.pathname}${parsed.search}${parsed.hash}`;
    }
    if (!parsed.pathname.startsWith('/noteLibrary/')) return '';

    candidate = String(parsed.searchParams.get('from') || '').trim();
  }

  return '';
}
