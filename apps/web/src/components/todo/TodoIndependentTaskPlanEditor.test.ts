import { afterEach, expect, it, vi } from 'vitest';
import { createApp, h, nextTick, reactive } from 'vue';
import { createPinia } from 'pinia';
import { createI18n } from 'vue-i18n';
import Editor from './TodoIndependentTaskPlanEditor.vue';
import type { TodoCreateDraftV3 } from './todoDraftNormalizer';
import zhCN from '@/i18n/locales/zh-CN';
vi.mock('@/components/base/BasicComponents/BTimePicker.vue', () => ({
  default: { props: ['value'], emits: ['update:value'], setup(props: any, { emit }: any) {
    return () => h('div', { class: 'b-time-picker' }, [h('button', 'time'), h('input', { value: props.value, onInput: (event: Event) => emit('update:value', (event.target as HTMLInputElement).value) })]);
  } },
}));
let cleanup: (() => void) | undefined;
afterEach(() => cleanup?.());
it('提醒引用唯一任务时刻，切换提醒不改写时刻；次日截止可独立修改', async () => {
  const draft = reactive<TodoCreateDraftV3>({
    task: { title: '跨夜任务', description: '', priority: 1, checklist: [], contextRefs: [] },
    timing: { startAt: null, dueAt: null, timezone: 'Asia/Shanghai' },
    reminder: { version: 1, mode: 'none', channels: [] },
    independentTasks: {
      enabled: true,
      timing: { timezone: 'Asia/Shanghai', anchorDate: '2026-09-09', startTime: '22:00', dueTime: '06:00', dueDayOffset: 0 },
      plan: { type: 'scheduled', frequency: 'daily', interval: 1, end: { mode: 'count', count: 3 } },
      reminder: { mode: 'once_per_instance', channels: ['in_app'], trigger: { type: 'at_start' } },
    },
  });
  const host = document.createElement('div');
  document.body.append(host);
  const app = createApp({ render: () => h(Editor, { draft }) });
  app.use(createPinia());
  app.use(createI18n({ legacy: false, locale: 'zh-CN', messages: { 'zh-CN': zhCN } }));
  app.mount(host);
  cleanup = () => { app.unmount(); host.remove(); };
  expect(host.querySelectorAll('.b-time-picker')).toHaveLength(2);
  expect(host.textContent).toContain('使用每次开始时刻：22:00');
  const button = (text: string) => [...host.querySelectorAll('button')].find(b => b.textContent?.trim() === text)!;
  button('截止前').click();
  await nextTick();
  expect(host.querySelectorAll('.b-time-picker')).toHaveLength(2);
  expect(host.textContent).toContain('使用每次截止时刻：06:00');
  const inputs = host.querySelectorAll<HTMLInputElement>('.b-time-picker input');
  const setTime = async (index: number, value: string) => {
    inputs[index].value = value;
    inputs[index].dispatchEvent(new Event('input', { bubbles: true }));
    await nextTick();
  };
  await setTime(0, '23:00');
  expect(draft.independentTasks.timing?.dueDayOffset).toBe(1);
  await setTime(1, '23:30');
  expect(draft.independentTasks.timing?.dueDayOffset).toBe(0);
  host.querySelector<HTMLElement>('[role="checkbox"]')!.click();
  await nextTick();
  await setTime(0, '22:00');
  expect(draft.independentTasks.timing).toMatchObject({ startTime: '22:00', dueTime: '23:30', dueDayOffset: 1 });
  const timing = host.querySelector<HTMLElement>('.todo-independent-plan__field.todo-independent-plan__time-target')!;
  timing.scrollIntoView = vi.fn();
  button('设置任务时刻').click();
  expect(timing.scrollIntoView).toHaveBeenCalled();
  expect(document.activeElement).toBe(timing.querySelector('button'));
});

it('点击日期字段标题、说明和空白后保持关闭，再次点击日期仍可打开', async () => {
  const draft = reactive<TodoCreateDraftV3>({
    task: { title: '', description: '', priority: 1, checklist: [], contextRefs: [] },
    timing: { startAt: null, dueAt: null, timezone: 'Asia/Shanghai' },
    reminder: { version: 1, mode: 'none', channels: [] },
    independentTasks: {
      enabled: true,
      timing: { timezone: 'Asia/Shanghai', anchorDate: '2026-09-09', startTime: '09:00', dueTime: null, dueDayOffset: 0 },
      plan: { type: 'scheduled', frequency: 'daily', interval: 1, end: { mode: 'until', untilDate: '2026-10-09' } },
      reminder: { mode: 'none', channels: ['in_app'] },
    },
  });
  const host = document.createElement('div');
  document.body.append(host);
  const app = createApp({ render: () => h(Editor, { draft }) });
  app.use(createPinia());
  app.use(createI18n({ legacy: false, locale: 'zh-CN', messages: { 'zh-CN': zhCN } }));
  app.mount(host);
  cleanup = () => { app.unmount(); host.remove(); };
  const click = async (element: HTMLElement) => {
    element.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    await nextTick();
    element.click();
    await nextTick();
    await new Promise(resolve => setTimeout(resolve, 250));
  };
  const triggers = host.querySelectorAll<HTMLElement>('.b-datetime-trigger');
  expect(triggers).toHaveLength(2);
  for (const trigger of triggers) {
    const field = trigger.closest('.todo-independent-plan__field')!;
    for (const target of [field, field.querySelector('span'), field.querySelector('small')].filter(Boolean)) {
      await click(trigger);
      expect(document.body.querySelector('.b-datetime-popover')).not.toBeNull();
      await click(target as HTMLElement);
      expect(document.body.querySelector('.b-datetime-popover')).toBeNull();
    }
  }
  expect(draft.independentTasks.plan.end).toEqual({ mode: 'until', untilDate: '2026-10-09' });
});
