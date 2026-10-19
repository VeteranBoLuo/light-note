import { createApp, nextTick } from 'vue';
import { createI18n } from 'vue-i18n';
import { afterEach, expect, it, vi } from 'vitest';
import FormRenderer from './FormRenderer.vue';
import { collectionFormsZh, collectionFormsEn } from '@/i18n/locales/collectionForms';
import { type FormAnswers, type FormDefinition } from '@lightnote/shared/collection-forms';

const cleanup: (() => void)[] = [];
afterEach(() => cleanup.splice(0).forEach((fn) => fn()));
function mount(type: 'single' | 'multiple' = 'single', initialAnswers: FormAnswers = {}, locale = 'zh') {
  const definition: FormDefinition = {
    title: '渠道调研',
    description: '',
    successMessage: '谢谢',
    questions: [
      {
        id: 'channel',
        type,
        title: '从哪里了解到轻笺？',
        required: true,
        allowOther: true,
        options: [
          { id: 'a', label: '搜索' },
          { id: 'b', label: '社群' },
        ],
      },
    ],
  };
  const host = document.createElement('div');
  document.body.append(host);
  const submit = vi.fn();
  const app = createApp(FormRenderer, { definition, initialAnswers, onSubmit: submit });
  app.use(
    createI18n({
      legacy: false,
      locale,
      messages: {
        zh: { collectionForms: collectionFormsZh },
        en: { collectionForms: collectionFormsEn },
      },
    }),
  );
  const renderer = app.mount(host);
  cleanup.push(() => {
    app.unmount();
    host.remove();
  });
  const choose = (text: string) => {
    const element = [...host.querySelectorAll<HTMLElement>('[role=radio], [role=checkbox]')].find(
      (el) => el.textContent?.trim() === text,
    )!;
    element.click();
    return nextTick();
  };
  const send = async () => {
    host.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }));
    await nextTick();
  };
  const fill = async (value: string) => {
    const input = host.querySelector<HTMLInputElement>('input')!;
    input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await nextTick();
  };
  return {
    host,
    definition,
    submit,
    renderer: renderer as unknown as { getAnswers(): FormAnswers },
    choose,
    send,
    fill,
  };
}
it('单选其他展开后必须填写；切回普通选项隐藏输入并清除其他内容', async () => {
  const f = mount();
  expect(f.host.querySelector('input')).toBeNull();
  await f.choose('其他（请填写）');
  expect(f.host.querySelector('input')).not.toBeNull();
  expect(f.host.querySelector('input')?.labels?.[0]?.textContent).toContain('从哪里了解到轻笺');
  await f.send();
  expect(f.submit).not.toHaveBeenCalled();
  expect(f.host.querySelector('[role=alert]')?.textContent).toContain('请填写其他选项');
  await f.fill('  工具导航  ');
  expect(f.host.querySelector('[role=alert]')).toBeNull();
  await f.send();
  expect(f.submit).toHaveBeenLastCalledWith({ channel: { optionIds: [], otherText: '工具导航' } });
  await f.choose('搜索');
  await f.send();
  expect(f.host.querySelector('input')).toBeNull();
  expect(f.submit).toHaveBeenLastCalledWith({ channel: 'a' });
  expect(f.renderer.getAnswers()).toEqual({ channel: 'a' });
});
it('多选其他可与普通项并存，取消其他保留普通项且不提交残留文字', async () => {
  const f = mount('multiple');
  await f.choose('搜索');
  await f.choose('其他（请填写）');
  await f.fill('朋友推荐');
  await f.send();
  expect(f.submit).toHaveBeenLastCalledWith({ channel: { optionIds: ['a'], otherText: '朋友推荐' } });
  await f.choose('其他（请填写）');
  await f.send();
  expect(f.submit).toHaveBeenLastCalledWith({ channel: ['a'] });
  expect(f.host.querySelector('input')).toBeNull();
});
it('回填其他文本、键盘切换单选，并只恢复仍在表单内的题目', async () => {
  const f = mount('single', { channel: { optionIds: [], otherText: '朋友分享' }, removed: '旧题' });
  expect(f.host.querySelector('input')?.value).toBe('朋友分享');
  expect(f.renderer.getAnswers()).not.toHaveProperty('removed');
  const other = f.host.querySelector('[aria-checked=true]')!;
  other.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true }));
  await nextTick();
  await f.send();
  expect(f.submit).toHaveBeenLastCalledWith({ channel: 'a' });
  expect(f.host.querySelector('[aria-checked=true]')?.textContent).toContain('搜索');
});
it('英文其他选项使用本地化校验提示且保持 500 字上限', async () => {
  const f = mount('single', {}, 'en');
  await f.choose('Other (please specify)');
  expect(f.host.querySelector('input')?.maxLength).toBe(500);
  await f.send();
  expect(f.host.textContent).toContain('Please specify your other response');
  expect(f.host.textContent).not.toContain('请填写其他');
});
