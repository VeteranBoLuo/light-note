/**
 * 从云空间预览「摘录到笔记」跳到笔记页时的一次性交接。
 * 只保存在内存里：同一次页面会话内跳转有效，刷新后作废；笔记页消费后立即清除。
 */
export interface PendingPdfExcerpt {
  noteId: string;
  noteTitle: string;
  /** false 表示摘录已随新建笔记写入，到达后只需提示。 */
  insert: boolean;
  html: string;
  markdown: string;
  /** 整理后的正文，插入不了时复制到剪贴板。 */
  text: string;
  fileId: string;
  page: number;
  /** 发起摘录时所在的云空间预览地址，手机「回到 PDF」优先按浏览器返回回到这里。 */
  returnTo: string;
}

const MAX_AGE_MS = 10 * 60 * 1000;
let pending: (PendingPdfExcerpt & { createdAt: number }) | null = null;
let rememberedPage: { fileId: string; page: number; createdAt: number } | null = null;

/** 记住摘录所在页：下次打开同一文件的预览（电脑参考栏、手机返回云空间）从这一页开始。 */
export function rememberPdfPage(fileId: string, page: number) {
  rememberedPage = fileId && page > 1 ? { fileId, page, createdAt: Date.now() } : null;
}

export function takeRememberedPdfPage(fileId: string) {
  const value = rememberedPage;
  if (!value || value.fileId !== fileId) return null;
  rememberedPage = null;
  return Date.now() - value.createdAt > MAX_AGE_MS ? null : value.page;
}

export function setPendingPdfExcerpt(value: PendingPdfExcerpt) {
  pending = { ...value, createdAt: Date.now() };
}

function current(noteId: string) {
  if (!pending) return null;
  if (Date.now() - pending.createdAt > MAX_AGE_MS) {
    pending = null;
    return null;
  }
  return pending.noteId === noteId ? pending : null;
}

/** 只读查看，不消费；参考栏需要提前知道起始页。 */
export function peekPendingPdfExcerpt(noteId: string): PendingPdfExcerpt | null {
  return current(noteId);
}

export function takePendingPdfExcerpt(noteId: string): PendingPdfExcerpt | null {
  const value = current(noteId);
  if (value) pending = null;
  return value;
}
