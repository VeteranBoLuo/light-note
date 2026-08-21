const NOTE_LIBRARY_ORIGIN = 'https://light-note.local';
const MAX_RETURN_PATH_DEPTH = 8;
const WORKBENCH_PATH = '/workbenches';

function firstQueryValue(value: unknown): string {
  const raw = Array.isArray(value) ? value[0] : value;
  return String(raw ?? '').trim();
}

function normalizeNoteLibraryPath(parsed: URL): string {
  // `from` 只属于详情页，不能被带回列表后继续参与下一次详情跳转。
  // 否则每次“目录 -> 正文 -> 返回”都会再包一层自身 URL，最终形成递归地址。
  parsed.searchParams.delete('from');
  const search = parsed.searchParams.toString();
  return `${parsed.pathname}${search ? `?${search}` : ''}${parsed.hash}`;
}

/**
 * 从详情页历史遗留的嵌套 `from` 中提取最初的可信来源地址。
 *
 * 详情页之间只传递这个稳定来源，避免每进入一层子页面都把整段父详情 URL
 * 再塞进下一层 `from`，最终形成难以理解、也难以可靠回退的递归地址。
 */
function resolveNoteDetailSourcePath(value: unknown, includeWorkbench: boolean): string {
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
      return normalizeNoteLibraryPath(parsed);
    }
    if (includeWorkbench && parsed.pathname === WORKBENCH_PATH) {
      return `${parsed.pathname}${parsed.search}${parsed.hash}`;
    }
    if (!parsed.pathname.startsWith('/noteLibrary/')) return '';

    candidate = String(parsed.searchParams.get('from') || '').trim();
  }

  return '';
}

export function resolveNoteLibraryListPath(value: unknown): string {
  return resolveNoteDetailSourcePath(value, false);
}

/**
 * 解析笔记详情页的稳定返回目标。
 *
 * 笔记库来源保留目录、标签和视图参数；今日/工作台来源回到工作台。
 * 详情页之间切换时会继续沿用最初来源，未知路由和外部地址一律拒绝。
 */
export function resolveNoteDetailReturnPath(value: unknown): string {
  return resolveNoteDetailSourcePath(value, true);
}
