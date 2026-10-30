interface CacheableEditor {
  getBody(): HTMLElement | null;
  getContent(args?: Record<string, unknown>): string;
  on(events: string, callback: () => void): void;
}

// TinyMCE 未指定格式时按 HTML 输出；tinymce-vue 会传入 { format: undefined }。
function isDefaultHtmlRead(args?: Record<string, unknown>) {
  if (args == null) return true;
  return Object.entries(args).every(([key, value]) => value === undefined || (key === 'format' && value === 'html'));
}

/**
 * 一次按键会有多处读取整篇正文（v-model 回传、其回写比较、资源链接刷新），结果完全相同，
 * 长笔记里这几次全文序列化占输入耗时的大头。正文 DOM 仍是唯一事实源：读取前用
 * takeRecords() 同步检查节点、属性和文字变化，有任何变化就重新序列化，否则复用上次结果。
 * 只缓存默认 HTML 读取；纯文本、选区等带参数的读取照常直达编辑器。
 */
export function cacheTinyMceHtmlContent(editor: CacheableEditor): () => void {
  const body = editor.getBody();
  if (!body || typeof MutationObserver === 'undefined') return () => {};
  let cached: string | null = null;
  const invalidate = () => {
    cached = null;
  };
  const observer = new MutationObserver(invalidate);
  observer.observe(body, { subtree: true, childList: true, attributes: true, characterData: true });
  const original = editor.getContent;
  const read = (args?: Record<string, unknown>) => {
    if (!isDefaultHtmlRead(args)) return original.call(editor, args);
    if (observer.takeRecords().length) cached = null;
    if (cached === null) cached = original.call(editor, args);
    return cached;
  };
  editor.getContent = read;
  editor.on('BeforeSetContent SetContent ExecCommand undo redo', invalidate);
  return () => {
    observer.disconnect();
    cached = null;
    if (editor.getContent === read) editor.getContent = original;
  };
}
