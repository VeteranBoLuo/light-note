import { createApp, h, nextTick } from 'vue';
import { createI18n } from 'vue-i18n';
import { it, expect, afterEach } from 'vitest';
import FormEditor from './FormEditor.vue';
import { collectionFormsZh } from '@/i18n/locales/collectionForms';
import type { FormDefinition } from '@lightnote/shared/collection-forms';
const cleanups: (() => void)[] = [];
afterEach(() => cleanups.splice(0).forEach((fn) => fn()));
async function mount(questions: FormDefinition['questions'] = [], locked = false) {
  const value: FormDefinition = { title: '测试', description: '', successMessage: '谢谢', questions };
  const host = document.createElement('div');
  document.body.append(host);
  const app = createApp({ render: () => h(FormEditor, { modelValue: value, locked }) });
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
it.each(['single', 'multiple'] as const)('%s 可开启其他、复制保留设置；已发布时不能切换', async (type) => {
  const q = {
    id: 'q',
    type,
    title: '来源',
    required: true,
    options: [
      { id: 'a', label: 'A' },
      { id: 'b', label: 'B' },
    ],
  };
  const { host, value } = await mount([q]);
  const other = () =>
    [...host.querySelectorAll<HTMLElement>('[role=checkbox]')].find((el) => el.textContent?.includes('允许填写其他'))!;
  expect(other().getAttribute('aria-checked')).toBe('false');
  other().click();
  await nextTick();
  expect(value.questions[0].allowOther).toBe(true);
  [...host.querySelectorAll<HTMLButtonElement>('button')].find((el) => el.textContent?.trim() === '复制')!.click();
  await nextTick();
  expect(value.questions[1].allowOther).toBe(true);
  expect(value.questions[1].id).not.toBe(value.questions[0].id);
  expect(value.questions[1].options[0].id).not.toBe(value.questions[0].options[0].id);
  const locked = await mount([{ ...q, allowOther: true }], true);
  const lockedOther = [...locked.host.querySelectorAll<HTMLElement>('[role=checkbox]')].find((el) =>
    el.textContent?.includes('允许填写其他'),
  )!;
  expect(lockedOther.getAttribute('aria-disabled')).toBe('true');
  lockedOther.click();
  await nextTick();
  expect(locked.value.questions[0].allowOther).toBe(true);
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
