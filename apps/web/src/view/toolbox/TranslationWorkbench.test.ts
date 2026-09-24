import { createApp, nextTick, ref } from 'vue';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import Workbench from './TranslationWorkbench.vue';
const mocks = vi.hoisted(() => ({
  quote: vi.fn(),
  job: vi.fn(),
  push: vi.fn(),
  cancel: vi.fn(),
  save: vi.fn(),
  record: vi.fn(),
  artifact: vi.fn(),
  query: {} as Record<string, string>,
}));
vi.mock('@/api/toolbox', () => ({
  createToolboxQuote: mocks.quote,
  cancelToolboxJob: mocks.cancel,
  deleteTranslationHistory: vi.fn(),
  fetchTranslationHistory: vi.fn().mockResolvedValue({ items: [], nextCursor: null }),
  fetchTranslationRecord: mocks.record,
  fetchToolboxArtifact: mocks.artifact,
}));
vi.mock('@/components/base/BasicComponents/BModal/Alert', () => ({ default: { alert: vi.fn() } }));
vi.mock('@/api/translationStream', () => ({ streamTranslation: mocks.job }));
vi.mock('@/utils/aiMessageRender', () => ({ renderStreamingMarkdown: (text: string) => text }));
vi.mock('@/utils/saveToolboxNote', () => ({ saveToolboxNote: mocks.save }));
vi.mock('@/store', () => ({ useUserStore: () => ({ id: 'owner' }) }));
vi.mock('@/api/noteDetailPrefetch', () => ({ buildNoteDetailRequestScope: () => 'owner' }));
vi.mock('@/utils/translationHandoff', () => ({ takeTranslation: () => ({ text: '你好' }) }));
vi.mock('@/composables/useMobileTopBar', () => ({ useMobileTopBar: vi.fn() }));
vi.mock('vue-router', () => ({
  useRoute: () => ({ query: mocks.query }),
  useRouter: () => ({ push: mocks.push, replace: vi.fn() }),
}));
vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (key: string) => key, locale: ref('zh-CN') }) }));
vi.mock('@/components/resourcePicker/ResourcePickerPanel.vue', () => ({
  default: {
    template: `<button class="pick-material" @click="$emit('select', { id: 'note-1', type: 'note', title: 'A long selected note' })">Pick</button>`,
  },
}));
vi.mock('@/components/base/BasicComponents/BModal/BModal.vue', () => ({
  default: { props: ['visible'], template: '<div v-if="visible" class="picker-dialog"><slot /></div>' },
}));
vi.mock('@/components/base/SvgIcon/src/SvgIcon.vue', () => ({ default: { template: '<span />' } }));
vi.mock('@/components/base/BasicComponents/BInput.vue', () => ({
  default: {
    props: ['value'],
    template: `<textarea :value="value" @input="$emit('update:value', $event.target.value)" />`,
  },
}));
vi.mock('@/components/base/BasicComponents/BSelect.vue', () => ({ default: { template: '<div />' } }));
vi.mock('@/components/base/BasicComponents/BTabs.vue', () => ({
  default: {
    template: `<button class="resource-tab" @click="$emit('update:activeTab', 'resource')">Materials</button>`,
  },
}));
vi.mock('@/components/base/BasicComponents/BButton.vue', () => ({
  default: { props: ['disabled'], template: '<button :disabled="disabled"><slot /></button>' },
}));
let cleanup = () => {};
const flush = async () => {
  for (let i = 0; i < 15; i++) await nextTick();
};
beforeEach(() => {
  sessionStorage.clear();
  mocks.query = {};
  vi.clearAllMocks();
  mocks.save.mockReset().mockResolvedValue(null);
  mocks.quote.mockReset().mockResolvedValue({ id: 'quote', inputSummary: { translation: { partial: false } } });
  mocks.job.mockReset().mockResolvedValue({ id: 'artifact', title: '译文', content: 'Hello', version: 1, meta: {} });
});
afterEach(() => cleanup());
function mount() {
  const host = document.createElement('div');
  const app = createApp(Workbench);
  app.mount(host);
  cleanup = () => app.unmount();
  return host.querySelector('.translation-footer button') as HTMLButtonElement;
}
it.each([false, true])('一次点击连续预检并创建任务（部分正文：%s）', async (partial) => {
  mocks.quote.mockResolvedValue({ id: 'quote', inputSummary: { translation: { partial } } });
  const button = mount();
  button.click();
  await flush();
  expect(mocks.quote).toHaveBeenCalledOnce();
  expect(mocks.quote.mock.calls[0][0]).toMatchObject({
    billingMedium: 'ai_quota',
    input: { options: { acceptPartial: true } },
  });
  expect(mocks.job).toHaveBeenCalledOnce();
  expect(mocks.push).not.toHaveBeenCalled();
});
it('预检失败不创建任务', async () => {
  mocks.quote.mockRejectedValue(new Error('offline'));
  const button = mount();
  button.click();
  await flush();
  expect(mocks.job).not.toHaveBeenCalled();
  expect(button.disabled).toBe(false);
});
it('请求进行中拒绝重复点击，结果未知时重用同一报价和任务请求身份', async () => {
  let reject!: (reason: unknown) => void;
  mocks.job.mockImplementationOnce(
    () =>
      new Promise((_, r) => {
        reject = r;
      }),
  );
  const button = mount();
  const footer = button.parentElement!;
  button.click();
  button.click();
  await flush();
  expect(mocks.job).toHaveBeenCalledOnce();
  expect(mocks.job).toHaveBeenCalledOnce();
  reject(new Error('response lost'));
  await flush();
  (footer.querySelector('button') as HTMLButtonElement).click();
  await flush();
  expect(mocks.quote).toHaveBeenCalledOnce();
  expect(mocks.job.mock.calls[1][0]).toEqual(mocks.job.mock.calls[0][0]);
});

it('单选资料后关闭浮层并显示更换入口，重新打开保留已选资料', async () => {
  const button = mount();
  const host = button.parentElement!.parentElement!.parentElement!;
  (host.querySelector('.resource-tab') as HTMLButtonElement).click();
  await flush();
  (host.querySelector('.translation-choose') as HTMLButtonElement).click();
  await flush();
  (host.querySelector('.pick-material') as HTMLButtonElement).click();
  await flush();
  expect(host.querySelector('.picker-dialog')).toBeNull();
  expect(host.querySelector('.translation-selected')?.textContent).toContain('A long selected note');
  expect(button.disabled).toBe(false);
  (host.querySelector('.translation-selected button') as HTMLButtonElement).click();
  await flush();
  expect(host.querySelector('.picker-dialog')).not.toBeNull();
  expect(host.querySelector('.translation-selected')?.textContent).toContain('A long selected note');
});

it('收到增量立即显示，完成前不能保存，完成后在当前页保存成果', async () => {
  let resolve!: (value: unknown) => void;
  let handlers: any;
  mocks.job.mockImplementation((_input, h) => {
    handlers = h;
    return new Promise((r) => {
      resolve = r;
    });
  });
  const button = mount();
  const host = button.closest('main')!;
  button.click();
  await flush();
  handlers.onStart('job');
  handlers.onSnapshot({ original: '你好', content: 'Hel' });
  await flush();
  expect(host.textContent).toContain('Hel');
  expect(host.textContent).not.toContain('translation.save');
  resolve({ id: 'artifact', title: '译文', content: 'Hello', version: 1, meta: {} });
  await flush();
  const save = [...host.querySelectorAll('button')].find((b) => b.textContent === 'translation.save')!;
  save.click();
  await flush();
  expect(mocks.save).toHaveBeenCalledWith(
    expect.objectContaining({ artifactId: 'artifact', saveFormat: 'translationOnly' }),
  );
  expect(mocks.push).not.toHaveBeenCalled();
});
it('停止翻译调用取消接口，保留已显示片段并禁用成果保存', async () => {
  let handlers: any;
  mocks.cancel.mockResolvedValue({ status: 'cancelled' });
  mocks.job.mockImplementation((_input, h) => {
    handlers = h;
    return new Promise((_resolve, reject) => h.signal.addEventListener('abort', () => reject(new Error('aborted'))));
  });
  const button = mount();
  const host = button.closest('main')!;
  button.click();
  await flush();
  handlers.onStart('job');
  handlers.onSnapshot({ original: '你好', content: 'Hel' });
  await flush();
  ([...host.querySelectorAll('button')].find((b) => b.textContent === 'translation.stop') as HTMLButtonElement).click();
  await flush();
  expect(mocks.cancel).toHaveBeenCalledWith('job');
  expect(host.textContent).toContain('Hel');
  expect(host.textContent).toContain('translation.stopped');
  expect(host.textContent).not.toContain('translation.save');
});

it('流式译文仅在停留底部时跟随，向上阅读不会被新内容拉回', async () => {
  let handlers: any;
  mocks.job.mockImplementation((_input, h) => {
    handlers = h;
    return new Promise(() => {});
  });
  const button = mount();
  const pane = button.closest('main')!.querySelector('.translation-output-scroll') as HTMLElement;
  Object.defineProperties(pane, {
    scrollHeight: { configurable: true, value: 1000 },
    clientHeight: { configurable: true, value: 300 },
  });
  button.click();
  await flush();
  handlers.onSnapshot({ content: '第一段' });
  await flush();
  expect(pane.scrollTop).toBe(1000);
  pane.scrollTop = 100;
  pane.dispatchEvent(new Event('scroll'));
  handlers.onSnapshot({ content: '第一段，第二段' });
  await flush();
  expect(pane.scrollTop).toBe(100);
  pane.scrollTop = 700;
  pane.dispatchEvent(new Event('scroll'));
  handlers.onSnapshot({ content: '第一段，第二段，第三段' });
  await flush();
  expect(pane.scrollTop).toBe(1000);
});

it('材料预检的 HTTP 409 显示来源提示并保持可更换，不进入重新连接', async () => {
  mocks.quote.mockRejectedValue({
    response: { status: 409, data: { data: { code: 'TOOLBOX_TRANSLATION_TEXT_NOT_READY' } } },
  });
  const button = mount();
  const host = button.closest('main')!;
  button.click();
  await flush();
  expect(mocks.job).not.toHaveBeenCalled();
  expect(host.textContent).toContain('translation.notReady');
  expect(host.textContent).not.toContain('translation.reconnect');
  expect(button.disabled).toBe(false);
});
it('翻译接口明确拒绝后解除锁定，不显示连接中断', async () => {
  mocks.job.mockRejectedValue({ code: 'TRANSLATION_STREAM_UNAVAILABLE', status: 404, definitive: true });
  const button = mount();
  const host = button.closest('main')!;
  button.click();
  await flush();
  expect(host.textContent).toContain('translation.serviceUnavailable');
  expect(host.textContent).not.toContain('translation.reconnect');
  (host.querySelector('.resource-tab') as HTMLButtonElement).click();
  await flush();
  expect(host.querySelector('.translation-choose')).not.toBeNull();
});

it('编辑原文保留完成的译文与保存身份，重新翻译直接使用新输入和新请求', async () => {
  const button = mount();
  const host = button.closest('main')!;
  button.click();
  await flush();
  const oldRequest = mocks.job.mock.calls[0][0].clientRequestId;
  const input = host.querySelector('.translation-source textarea') as HTMLTextAreaElement;
  input.value = '你好3';
  input.dispatchEvent(new Event('input'));
  await flush();
  expect(host.querySelector('.translation-output')?.textContent).toContain('Hello');
  expect(mocks.job).toHaveBeenCalledOnce();
  const find = (key: string) => [...host.querySelectorAll('button')].find((b) => b.textContent === key)!;
  find('translation.save').click();
  expect(mocks.save).toHaveBeenCalledWith(expect.objectContaining({ artifactId: 'artifact' }));
  find('translation.translate').click();
  await flush();
  expect(mocks.quote.mock.calls[1][0].input.text).toBe('你好3');
  expect(mocks.job).toHaveBeenCalledTimes(2);
  expect(mocks.job.mock.calls[1][0].clientRequestId).not.toBe(oldRequest);
});

it('从历史记录恢复原文和译文，不请求报价或调用模型', async () => {
  mocks.query = { record: 'history-job' };
  mocks.record.mockResolvedValue({
    job: { id: 'history-job', status: 'succeeded', artifact: { id: 'saved-artifact' } },
    original: 'Old original',
    options: { sourceLanguage: 'en', targetLanguage: 'ja', question: '' },
    quoteId: 'q',
    clientRequestId: 'old-request',
  });
  mocks.artifact.mockResolvedValue({ id: 'saved-artifact', version: 1, content: 'Old translation', title: 'Saved' });
  const host = mount().closest('main')!;
  await flush();
  expect((host.querySelector('.translation-source textarea') as HTMLTextAreaElement).value).toBe('Old original');
  expect(host.querySelector('.translation-output')?.textContent).toContain('Old translation');
  expect(mocks.quote).not.toHaveBeenCalled();
  expect(mocks.job).not.toHaveBeenCalled();
  const save = [...host.querySelectorAll('button')].find((b) => b.textContent === 'translation.save')!;
  save.click();
  expect(mocks.save).toHaveBeenCalledWith(expect.objectContaining({ artifactId: 'saved-artifact' }));
});
it('重新进入未完成记录沿用原请求，不创建第二次报价', async () => {
  mocks.query = { record: 'running-job' };
  mocks.record.mockResolvedValue({
    job: { id: 'running-job', status: 'processing' },
    original: 'Pending original',
    options: { sourceLanguage: 'auto', targetLanguage: 'en', question: '' },
    quoteId: 'original-quote',
    clientRequestId: 'original-request',
  });
  mount();
  await flush();
  expect(mocks.quote).not.toHaveBeenCalled();
  expect(mocks.job).toHaveBeenCalledWith(
    { quoteId: 'original-quote', clientRequestId: 'original-request' },
    expect.anything(),
  );
});

it('普通进入忽略上次浏览的记录，不自动恢复旧翻译', async () => {
  sessionStorage.setItem('translation-record:owner', 'old-job');
  mount();
  await flush();
  expect(mocks.record).not.toHaveBeenCalled();
  expect(mocks.job).not.toHaveBeenCalled();
});

it.each([true, false, null])('保存弹框返回打开意图 %s 时正确处理导航', async (open) => {
  mocks.save.mockResolvedValue(open === null ? null : { noteId: 'note/id', openAfterSave: open });
  const button = mount();
  const host = button.closest('main')!;
  button.click();
  await flush();
  [...host.querySelectorAll('button')].find((b) => b.textContent === 'translation.save')!.click();
  await flush();
  if (open)
    expect(mocks.push).toHaveBeenCalledWith({
      path: '/noteLibrary/note%2Fid',
      query: { from: '/toolbox/translation' },
    });
  else expect(mocks.push).not.toHaveBeenCalled();
});
it('离开翻译页后不处理迟到的保存导航', async () => {
  let resolve!: (value: unknown) => void;
  mocks.save.mockImplementation(
    () =>
      new Promise((r) => {
        resolve = r;
      }),
  );
  const button = mount();
  const host = button.closest('main')!;
  button.click();
  await flush();
  [...host.querySelectorAll('button')].find((b) => b.textContent === 'translation.save')!.click();
  cleanup();
  cleanup = () => {};
  resolve({ noteId: 'note', openAfterSave: true });
  await flush();
  expect(mocks.push).not.toHaveBeenCalled();
});

it('从历史译文打开笔记时携带对应记录的返回地址', async () => {
  mocks.query = { record: 'history-job' };
  mocks.record.mockResolvedValue({
    job: { id: 'history-job', status: 'succeeded', artifact: { id: 'saved' } },
    original: 'Hello',
    options: {},
  });
  mocks.artifact.mockResolvedValue({ id: 'saved', version: 1, title: 'Saved', content: '你好' });
  mocks.save.mockResolvedValue({ noteId: 'note', openAfterSave: true });
  const button = mount();
  const host = button.closest('main')!;
  await flush();
  [...host.querySelectorAll('button')].find((b) => b.textContent === 'translation.save')!.click();
  await flush();
  expect(mocks.push).toHaveBeenCalledWith({
    path: '/noteLibrary/note',
    query: { from: '/toolbox/translation?record=history-job' },
  });
});
