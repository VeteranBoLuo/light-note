import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp, h, ref } from 'vue';
import { createI18n } from 'vue-i18n';
import zhCN from '@/i18n/locales/zh-CN';
import { peekPendingPdfExcerpt, rememberPdfPage, setPendingPdfExcerpt, takeRememberedPdfPage } from '@/utils/pdfExcerptHandoff';
import { useNotePdfExcerpt, type NotePdfExcerptEditor } from './useNotePdfExcerpt';

const mocks = vi.hoisted(() => ({
  mobile: false,
  router: { back: vi.fn(), push: vi.fn(async () => undefined) },
  message: { success: vi.fn(), warning: vi.fn(), error: vi.fn() },
  recordOperation: vi.fn(async () => undefined),
  copyTextToClipboard: vi.fn(async () => true),
}));

vi.mock('vue-router', () => ({ useRouter: () => mocks.router }));
vi.mock('@/store', () => ({ bookmarkStore: () => ({ isMobile: mocks.mobile }) }));
vi.mock('@/components/base/BasicComponents/BMessage/BMessage', () => ({ default: mocks.message }));
vi.mock('@/api/commonApi', () => ({ recordOperation: mocks.recordOperation }));
vi.mock('@/utils/clipboard', () => ({ copyTextToClipboard: mocks.copyTextToClipboard }));

const arrival = {
  noteId: 'n1',
  noteTitle: '访谈发现',
  insert: true,
  html: '<blockquote><p>原话</p></blockquote>',
  markdown: '> 原话',
  text: '原话',
  fileId: 'f1',
  page: 12,
  returnTo: '/cloudSpace?fileId=f1',
};

let cleanup: (() => void) | undefined;

function setup(editor: NotePdfExcerptEditor | null, canInsert = true) {
  let api!: ReturnType<typeof useNotePdfExcerpt>;
  const app = createApp({
    setup() {
      api = useNotePdfExcerpt({
        editor: ref(editor),
        noteId: () => 'n1',
        noteTitle: () => '访谈发现与相反证据',
        canInsert: () => canInsert,
      });
      return () => h('div');
    },
  });
  app.use(createI18n({ legacy: false, locale: 'zh-CN', messages: { 'zh-CN': zhCN } }));
  const host = document.createElement('div');
  app.mount(host);
  cleanup = () => app.unmount();
  return api;
}

beforeEach(() => {
  mocks.mobile = false;
  vi.clearAllMocks();
});

afterEach(() => {
  cleanup?.();
  cleanup = undefined;
  window.history.replaceState(null, '');
});

describe('PDF 摘录交接', () => {
  it('只交给目标笔记，取走后清除；页码只给同一个文件用一次', () => {
    setPendingPdfExcerpt(arrival);
    expect(peekPendingPdfExcerpt('other')).toBeNull();
    expect(peekPendingPdfExcerpt('n1')?.page).toBe(12);
    rememberPdfPage('f1', 12);
    expect(takeRememberedPdfPage('f2')).toBeNull();
    expect(takeRememberedPdfPage('f1')).toBe(12);
    expect(takeRememberedPdfPage('f1')).toBeNull();
    rememberPdfPage('f1', 1);
    expect(takeRememberedPdfPage('f1')).toBeNull();
  });
});

describe('useNotePdfExcerpt', () => {
  it('电脑：编辑器就绪后把摘录追加到末尾，并用全局提示告知', async () => {
    const insertExcerpt = vi.fn(async () => true);
    const api = setup({ insertExcerpt });
    setPendingPdfExcerpt(arrival);
    await api.consumeArrival();
    expect(insertExcerpt).toHaveBeenCalledWith({ html: arrival.html, markdown: arrival.markdown }, 'end');
    expect(mocks.message.success).toHaveBeenCalledWith('已摘录到「访谈发现与相反证据」末尾');
    expect(mocks.recordOperation).toHaveBeenCalledWith({ module: 'PDF 摘录', operation: '插入笔记【云空间】' });
    expect(api.returnTarget.value).toBeNull();
    await api.consumeArrival();
    expect(insertExcerpt).toHaveBeenCalledTimes(1);
  });

  it('插不进去（只读或手绘笔记）时把文字复制到剪贴板并提示，不记录插入', async () => {
    const insertExcerpt = vi.fn(async () => true);
    const api = setup({ insertExcerpt }, false);
    setPendingPdfExcerpt(arrival);
    await api.consumeArrival();
    expect(insertExcerpt).not.toHaveBeenCalled();
    expect(mocks.copyTextToClipboard).toHaveBeenCalledWith('原话');
    expect(mocks.message.warning).toHaveBeenCalledWith('这篇笔记不能插入摘录，已复制到剪贴板');
    expect(mocks.recordOperation).not.toHaveBeenCalled();
  });

  it('手机：新建笔记已带上摘录时只给出「回到 PDF」；从云空间来的按浏览器返回回去', async () => {
    mocks.mobile = true;
    const insertExcerpt = vi.fn(async () => true);
    const api = setup({ insertExcerpt });
    setPendingPdfExcerpt({ ...arrival, insert: false });
    await api.consumeArrival();
    expect(insertExcerpt).not.toHaveBeenCalled();
    expect(api.returnTarget.value).toEqual({ returnTo: arrival.returnTo, fileId: 'f1' });

    window.history.replaceState({ back: arrival.returnTo }, '');
    await api.returnToPdf();
    expect(mocks.router.back).toHaveBeenCalled();
    expect(mocks.router.push).not.toHaveBeenCalled();
    expect(api.returnTarget.value).toBeNull();
  });

  it('手机：不是从云空间来时重新打开该文件', async () => {
    mocks.mobile = true;
    const api = setup({ insertExcerpt: vi.fn(async () => true) });
    setPendingPdfExcerpt({ ...arrival, returnTo: '' });
    await api.consumeArrival();
    await api.returnToPdf();
    expect(mocks.router.push).toHaveBeenCalledWith({ path: '/cloudSpace', query: { fileId: 'f1' } });
  });

  it('参考栏插入成功才记录，撤销交给编辑器', async () => {
    const insertExcerpt = vi.fn(async () => true);
    const undoLastExcerpt = vi.fn(() => true);
    const api = setup({ insertExcerpt, undoLastExcerpt });
    const ok = await api.insertReferenceExcerpt(
      { text: '原话', pageStart: 3, pageEnd: 4 },
      { fileId: 'f1', fileName: '指南.pdf' },
    );
    expect(ok).toBe(true);
    const [content, position] = insertExcerpt.mock.calls[0] as unknown as [{ html: string; markdown: string }, string];
    expect(position).toBe('cursor');
    expect(content.html).toContain('第 3–4 页');
    expect(content.markdown).toContain('(/cloudSpace?fileId=f1&page=3)');
    expect(mocks.recordOperation).toHaveBeenCalledWith({ module: 'PDF 摘录', operation: '插入笔记【参考栏】' });
    api.undoReferenceExcerpt();
    expect(undoLastExcerpt).toHaveBeenCalled();
  });
});
