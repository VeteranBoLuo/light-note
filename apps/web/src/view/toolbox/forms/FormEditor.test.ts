import { createApp, h, nextTick } from 'vue';
import { createI18n } from 'vue-i18n';
import { it, expect, afterEach } from 'vitest';
import FormEditor from './FormEditor.vue';
import { collectionFormsZh } from '@/i18n/locales/collectionForms';
import type { FormDefinition } from '@lightnote/shared/collection-forms';
const cleanups: (() => void)[] = [];
afterEach(() => cleanups.splice(0).forEach((fn) => fn()));
async function mount() {
  const value: FormDefinition = { title: '测试', description: '', successMessage: '谢谢', questions: [] };
  const host = document.createElement('div');
  document.body.append(host);
  const app = createApp({ render: () => h(FormEditor, { modelValue: value, locked: false }) });
  app.use(
    createI18n({
      legacy: false,
      locale: 'zh',
      messages: { zh: { collectionForms: collectionFormsZh, common: { close: '关闭' } } },
    }),
  );
  app.mount(host);
  cleanups.push(() => {
    app.unmount();
    host.remove();
  });
  return { host, value };
}
it('直接选择七种题型，自动聚焦新题且保留先前编辑', async () => {
  const { host, value } = await mount();
  for (const [index, type] of ['short', 'long', 'single', 'multiple', 'rating', 'number', 'date'].entries()) {
    (host.querySelector('.collection-add-trigger') as HTMLButtonElement).click();
    await nextTick();
    (host.querySelectorAll('.collection-type-choice')[index] as HTMLButtonElement).click();
    await nextTick();
    await nextTick();
    expect(value.questions[index].type).toBe(type);
    expect(host.querySelector('.collection-type-picker')).toBeNull();
    const input = host.querySelector('.is-expanded input:not([type="checkbox"])') as HTMLInputElement;
    expect(document.activeElement).toBe(input);
    input.value = `问题 ${index}`;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await nextTick();
  }
  expect(value.questions.map((q) => q.title)).toEqual(Array.from({ length: 7 }, (_, i) => `问题 ${i}`));
  expect(value.questions[2].options).toHaveLength(2);
  expect(value.questions[3].options).toHaveLength(2);
  expect(new Set(value.questions.map((q) => q.id)).size).toBe(7);
});
it('取消题型选择不创建题目并恢复添加按钮焦点', async () => {
  const { host, value } = await mount();
  (host.querySelector('.collection-add-trigger') as HTMLButtonElement).click();
  await nextTick();
  await nextTick();
  host
    .querySelector('.collection-type-choice')!
    .dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  await nextTick();
  expect(host.querySelector('.collection-type-picker')).toBeNull();
  expect(value.questions).toHaveLength(0);
  expect(document.activeElement).toBe(host.querySelector('.collection-add-trigger'));
});
