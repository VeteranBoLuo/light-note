import { createApp, nextTick } from 'vue';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import FormStatistics from './FormStatistics.vue';
const api = vi.hoisted(() => vi.fn());
vi.mock('./api', () => ({ formsApi: api }));
vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (k: string) => k }) }));
vi.mock('@/components/base/BasicComponents/BDrawer.vue', () => ({
  default: {
    props: ['open'],
    template: '<div v-if="open" class="drawer"><button @click="$emit(\'close\')">Close</button><slot/></div>',
  },
}));
vi.mock('@/components/base/BasicComponents/BInput.vue', () => ({
  default: {
    props: ['value'],
    template: '<input :value="value" @input="$emit(\'update:value\',$event.target.value)" />',
  },
}));
const flush = async () => {
  for (let i = 0; i < 12; i++) await nextTick();
};
let cleanup = () => {};
function mount() {
  const host = document.createElement('div');
  const app = createApp(FormStatistics, { formId: 'form', from: '2026-10-01', to: '2026-10-14' });
  app.mount(host);
  cleanup = () => app.unmount();
  const button = (text: string) => [...host.querySelectorAll('button')].find((b) => b.textContent?.includes(text))!;
  return { host, button };
}
const summary = {
  summary: { valid: 30, total: 30, spam: 0 },
  trend: [],
  questions: [{ id: 'question', type: 'long', title: 'Feedback', answered: 30 }],
};
beforeEach(() => {
  api.mockReset();
});
afterEach(() => cleanup());
it('文本答案加载、空结果与错误互斥，失败提供重试入口', async () => {
  let resolve!: (v: unknown) => void;
  api.mockImplementation((p: string) =>
    p.endsWith('/statistics')
      ? Promise.resolve(summary)
      : new Promise((r) => {
          resolve = r;
        }),
  );
  const { host, button } = mount();
  await flush();
  button('collectionForms.viewText').click();
  await flush();
  expect(host.querySelector('.drawer [role=status]')?.textContent).toContain('common.loading');
  expect(host.textContent).not.toContain('collectionForms.emptyTextAnswers');
  resolve([]);
  await flush();
  expect(host.textContent).toContain('collectionForms.emptyTextAnswers');
  api.mockRejectedValueOnce(new Error('offline'));
  button('collectionForms.search').click();
  await flush();
  expect(host.textContent).not.toContain('collectionForms.emptyTextAnswers');
  expect(host.querySelector('[role=alert]')?.textContent).toContain('offline');
  api.mockResolvedValueOnce([{ text_value: 'Recovered answer' }]);
  button('collectionForms.retry').click();
  await flush();
  expect(host.textContent).toContain('Recovered answer');
  expect(host.querySelector('[role=alert]')).toBeNull();
});
it('翻页失败保留上一页，重试请求失败页，关闭后忽略迟到响应', async () => {
  api
    .mockResolvedValueOnce(summary)
    .mockResolvedValueOnce(Array.from({ length: 30 }, () => ({ text_value: 'Original answer' })))
    .mockRejectedValueOnce(new Error('offline'));
  const { host, button } = mount();
  await flush();
  button('collectionForms.viewText').click();
  await flush();
  button('collectionForms.next').click();
  await flush();
  expect(host.textContent).toContain('Original answer');
  expect(api).toHaveBeenLastCalledWith('/form/text-answers', 'GET', expect.objectContaining({ page: 2 }));
  const search = host.querySelector('.drawer input') as HTMLInputElement;
  search.value = 'unapplied search';
  search.dispatchEvent(new Event('input'));
  await flush();
  let complete!: (r: unknown) => void;
  api.mockImplementationOnce(
    () =>
      new Promise((r) => {
        complete = r;
      }),
  );
  button('collectionForms.retry').click();
  await flush();
  expect(button('collectionForms.next').disabled).toBe(true);
  expect(api).toHaveBeenLastCalledWith('/form/text-answers', 'GET', expect.objectContaining({ page: 2, search: '' }));
  button('Close').click();
  await flush();
  complete([{ text_value: 'Late answer' }]);
  await flush();
  expect(host.querySelector('.drawer')).toBeNull();
  api.mockResolvedValueOnce([]);
  button('collectionForms.viewText').click();
  await flush();
  expect(host.textContent).not.toContain('Late answer');
});
