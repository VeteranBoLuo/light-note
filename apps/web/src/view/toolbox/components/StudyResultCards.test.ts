import { createApp, nextTick, ref } from 'vue';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import StudyResultCards from './StudyResultCards.vue';
const api = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock('@/http/request', () => ({ apiBaseGet: api.get, apiBasePost: api.post }));
vi.mock('@/store', () => ({ useUserStore: () => ({ id: 'owner' }) }));
vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (key: string) => key }) }));
vi.mock('@/components/base/BasicComponents/BTabs.vue', () => ({
  default: {
    props: ['options'],
    template: '<div><button v-for="o in options" @click="$emit(\'update:activeTab\',o.key)">{{o.label}}</button></div>',
  },
}));
vi.mock('@/components/base/BasicComponents/BInput.vue', () => ({ default: { template: '<textarea />' } }));
const flush = async () => {
  for (let i = 0; i < 12; i++) await nextTick();
};
let cleanup = () => {};
function mount() {
  const artifactId = ref('first');
  const host = document.createElement('div');
  const app = createApp({
    components: { StudyResultCards },
    setup: () => ({ artifactId }),
    template: `<StudyResultCards :artifact-id="artifactId" :version="1" :cards="[{id:'card',kind:'flashcard',question:'Question',answer:'Answer'}]" />`,
  });
  app.mount(host);
  cleanup = () => app.unmount();
  const button = (text: string) => [...host.querySelectorAll('button')].find((b) => b.textContent?.includes(text))!;
  return { host, button, artifactId };
}
beforeEach(() => {
  api.get.mockReset();
  api.post.mockReset();
});
afterEach(() => cleanup());
it('首次加载失败可以重试，加载中不误报空内容', async () => {
  let complete!: (r: unknown) => void;
  api.get.mockRejectedValueOnce(new Error('offline')).mockImplementationOnce(
    () =>
      new Promise((r) => {
        complete = r;
      }),
  );
  const { host, button } = mount();
  await flush();
  expect(host.querySelector('[role=alert]')?.textContent).toContain('toolbox.study.loadFailed');
  button('common.retry').click();
  await flush();
  expect(host.querySelector('[role=alert]')).toBeNull();
  expect(host.textContent).not.toContain('toolbox.study.empty');
  complete({ status: 200, data: { cards: [{ id: 'card', mastered: true }] } });
  await flush();
  button('toolbox.study.flashcards').click();
  await flush();
  expect(host.textContent).toContain('Question');
  expect(button('toolbox.study.mastered').getAttribute('aria-pressed')).toBe('true');
});
it('保存失败保留卡片和答案，允许重新标记且阻止重复提交', async () => {
  api.get.mockResolvedValue({ status: 200, data: { cards: [] } });
  let fail!: (e: unknown) => void;
  api.post
    .mockImplementationOnce(
      () =>
        new Promise((_, r) => {
          fail = r;
        }),
    )
    .mockResolvedValue({ status: 200 });
  const { host, button } = mount();
  await flush();
  button('toolbox.study.flashcards').click();
  await flush();
  button('toolbox.study.reveal').click();
  await flush();
  button('toolbox.study.mastered').click();
  await flush();
  expect(button('toolbox.study.mastered').disabled).toBe(true);
  fail(new Error('offline'));
  await flush();
  expect(host.textContent).toContain('Answer');
  expect(host.textContent).toContain('toolbox.study.saveFailed');
  expect(button('toolbox.study.mastered').disabled).toBe(false);
  button('toolbox.study.mastered').click();
  await flush();
  expect(api.post).toHaveBeenCalledTimes(2);
  expect(host.querySelector('[role=alert]')).toBeNull();
  expect(button('toolbox.study.mastered').getAttribute('aria-pressed')).toBe('true');
});
it('切换成果后忽略旧重试响应', async () => {
  let old!: (r: unknown) => void;
  api.get
    .mockImplementationOnce(
      () =>
        new Promise((r) => {
          old = r;
        }),
    )
    .mockResolvedValue({ status: 200, data: { cards: [] } });
  const { host, artifactId, button } = mount();
  artifactId.value = 'second';
  await flush();
  old({ status: 500 });
  await flush();
  expect(host.querySelector('[role=alert]')).toBeNull();
  button('toolbox.study.flashcards').click();
  await flush();
  expect(button('toolbox.study.mastered').getAttribute('aria-pressed')).toBe('false');
});
