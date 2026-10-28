import { createApp, h, nextTick, ref } from 'vue';
import { createI18n } from 'vue-i18n';
import { afterEach, expect, it } from 'vitest';
import { collectionFormsZh } from '@/i18n/locales/collectionForms';
import { validateDefinition, type FormDefinition } from '@lightnote/shared/collection-forms';
import FormParticipation from './FormParticipation.vue';
const cleanup: (() => void)[] = [];
afterEach(() => cleanup.splice(0).forEach((f) => f()));
function mount(locked = false) {
  const model = ref<FormDefinition>({ title: '调研', description: '', successMessage: '谢谢', questions: [] });
  const host = document.createElement('div');
  document.body.append(host);
  const app = createApp({
    render: () =>
      h(FormParticipation, {
        modelValue: model.value,
        'onUpdate:modelValue': (v: FormDefinition) => {
          model.value = v;
        },
        locked,
      }),
  });
  app.use(
    createI18n({ legacy: false, locale: 'zh-CN', messages: { 'zh-CN': { collectionForms: collectionFormsZh } } }),
  );
  app.mount(host);
  cleanup.push(() => {
    app.unmount();
    host.remove();
  });
  return { host, model };
}
it('奖励开启自动限制账号，必须填写有效金额与名额，关闭奖励保留登录限制', async () => {
  const { host, model } = mount();
  (host.querySelectorAll('[role="switch"]')[1] as HTMLElement).click();
  await nextTick();
  expect(model.value.membersOnly).toBe(true);
  expect(() => validateDefinition(model.value)).toThrow('奖励');
  for (const [i, value] of ['20', '100'].entries()) {
    const input = host.querySelectorAll('input')[i];
    input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await nextTick();
  }
  expect(validateDefinition(model.value).reward).toEqual({ points: 20, maxRecipients: 100 });
  expect(host.textContent).toContain('最多发放 2000 积分');
  (host.querySelector('[role="switch"]') as HTMLElement).click();
  expect(model.value.membersOnly).toBe(true);
  (host.querySelectorAll('[role="switch"]')[1] as HTMLElement).click();
  await nextTick();
  expect(model.value.reward).toBeNull();
  expect(model.value.membersOnly).toBe(true);
});
it('已发布设置不可切换', () => {
  const { host, model } = mount(true);
  host.querySelectorAll('[role="switch"]').forEach((switchEl) => (switchEl as HTMLElement).click());
  expect(model.value.membersOnly).toBeUndefined();
  expect(model.value.reward).toBeUndefined();
});
it('长期调查展示不限名额，不展示零预算或空名额输入，原配置可保存', async () => {
  const { host, model } = mount(true);
  model.value.membersOnly = true;
  model.value.reward = { points: 50, maxRecipients: null };
  await nextTick();
  expect(host.textContent).toContain('不限奖励名额');
  expect(host.textContent).not.toContain('最多发放');
  expect(host.querySelectorAll('input')).toHaveLength(1);
  expect(host.querySelector('input')?.disabled).toBe(true);
  expect(validateDefinition(model.value).reward).toEqual({ points: 50, maxRecipients: null });
});
