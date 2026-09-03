const NOTE_LIBRARY_ORIGIN = 'https://light-note.local';
const MAX_RETURN_PATH_DEPTH = 8;
const WORKBENCH_PATH = '/workbenches';
const ORGANIZE_PATH = '/organize';
const TODO_PATH = '/inbox';
const KNOWLEDGE_AUDIT_PATH = '/toolbox/knowledge_structure_audit';
const TOOLBOX_TASK_PATH_PATTERN = /^\/toolbox\/task\/[^/]+$/u;

interface NoteDeletionFallbackInput {
  currentId: unknown;
  parentId?: unknown;
  siblings?: Array<{ id?: unknown }> | null;
}

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
function resolveNoteDetailSourcePath(value: unknown, includeFeatureSources: boolean): string {
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
    if (
      includeFeatureSources &&
      (parsed.pathname === WORKBENCH_PATH ||
        parsed.pathname === ORGANIZE_PATH ||
        parsed.pathname === TODO_PATH ||
        parsed.pathname === KNOWLEDGE_AUDIT_PATH ||
        TOOLBOX_TASK_PATH_PATTERN.test(parsed.pathname))
    ) {
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
 * 笔记库来源保留目录、标签和视图参数；工作台、待办、整理中心与工具任务来源回到原功能现场。
 * 详情页之间切换时会继续沿用最初来源，未知路由、工具首页和外部地址一律拒绝。
 */
export function resolveNoteDetailReturnPath(value: unknown): string {
  return resolveNoteDetailSourcePath(value, true);
}

/**
 * 当前笔记被移入回收站后，选择仍然存在且最贴近用户阅读位置的页面。
 *
 * 顺序固定为“同级下一篇 -> 同级上一篇 -> 父页面 -> 笔记库”。这里不读取浏览器
 * 历史，也不沿用工具/工作台来源，避免删除后重新落回已经不存在的详情地址。
 */
export function resolveDeletedNoteFallbackId({
  currentId,
  parentId,
  siblings = [],
}: NoteDeletionFallbackInput): string {
  const normalizedCurrentId = firstQueryValue(currentId);
  const normalizedParentId = firstQueryValue(parentId);
  const normalizedSiblings = (Array.isArray(siblings) ? siblings : [])
    .map((item) => firstQueryValue(item?.id))
    .filter(Boolean);
  const currentIndex = normalizedSiblings.indexOf(normalizedCurrentId);

  if (currentIndex >= 0) {
    return normalizedSiblings[currentIndex + 1] || normalizedSiblings[currentIndex - 1] || normalizedParentId;
  }
  return normalizedSiblings.find((id) => id !== normalizedCurrentId) || normalizedParentId;
}
