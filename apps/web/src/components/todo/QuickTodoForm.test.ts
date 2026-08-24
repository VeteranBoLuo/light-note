import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import { createI18n } from 'vue-i18n';
import QuickTodoForm from './QuickTodoForm.vue';

let cleanup: (() => void) | undefined;

function mountQuickTodoForm() {
  const onSubmit = vi.fn();
  const onDetails = vi.fn();
  const host = document.createElement('div');
  document.body.append(host);
  const app = createApp({
    setup() {
      return () => h(QuickTodoForm, { onSubmit, onDetails });
    },
  });
  app.component('OriginalIcon', { render: () => h('span') });
  app.use(
    createI18n({
      legacy: false,
      locale: 'zh-CN',
      messages: {
        'zh-CN': {
          inbox: {
            quickTodoHeading: '快速新建待办',
            quickTodoHint: '只写标题也能创建',
            todoTitle: '标题',
            todoTitlePlaceholder: '输入需要完成的事情',
            quickTodoEnterHint: '按 Enter 立即创建',
            quickTodoDue: '安排到',
            quickTodoNoDate: '无日期',
            quickTodoToday: '今天',
            quickTodoTomorrow: '明天',
            quickTodoThisWeek: '本周',
            quickTodoDetails: '完善详情',
            quickTodoAiOrganize: 'AI 补全详情',
            quickTodoAiOrganizeHint: '根据标题补全说明、日期、优先级和清单',
            quickTodoCreate: '立即创建',
            todoPriority: '优先级',
            todoPriority0: '低',
            todoPriority1: '普通',
            todoPriority2: '高',
            todoReminder: '提醒',
            todoReminderNone: '不提醒',
            quickTodoReminderBeforeDue: '截止前 1 小时',
            quickTodoReminderDaily: '每天',
            quickTodoReminderTimeLabel: '每日提醒时间',
            quickTodoReminderPastToday: '今天的提醒时间已经过去，请选择稍后的时间或调整截止日期。',
            quickTodoReminderHint: '复杂计划进入详情',
            quickTodoReminderNeedsDue: '选择截止时间后可使用截止前提醒',
          },
          common: {
            cancel: '取消',
            confirm: '确定',
            hour: '小时',
            minute: '分钟',
            noMatch: '无匹配项',
            pleaseSelect: '请选择',
            searchPlaceholder: '搜索',
            selectTime: '选择时间',
          },
        },
      },
    }),
  );
  app.mount(host);
  cleanup = () => {
    app.unmount();
    host.remove();
  };
  return { host, onSubmit, onDetails };
}

async function setTitle(host: HTMLElement, value: string) {
  const input = host.querySelector<HTMLInputElement>('input');
  expect(input).not.toBeNull();
  input!.value = value;
  input!.dispatchEvent(new Event('input', { bubbles: true }));
  await nextTick();
}

function clickButton(host: HTMLElement, label: string) {
  const button = [...host.querySelectorAll<HTMLButtonElement>('button')].find(
    (item) => item.textContent?.trim() === label,
  );
  expect(button).not.toBeUndefined();
  button!.click();
}

async function selectDailyReminderTime(host: HTMLElement, hour: string, minute: string) {
  const trigger = host.querySelector<HTMLButtonElement>('.b-time-trigger');
  expect(trigger).not.toBeNull();
  trigger!.click();
  await nextTick();

  const panel = [...document.body.querySelectorAll<HTMLElement>('.b-time-panel')].at(-1) || null;
  expect(panel).not.toBeNull();
  expect(panel!.querySelectorAll('.select-search-inline')).toHaveLength(2);

  for (const [index, value] of [hour, minute].entries()) {
    const input = panel!.querySelectorAll<HTMLInputElement>('.select-search-inline')[index];
    input!.dispatchEvent(new FocusEvent('focus', { bubbles: true }));
    await nextTick();
    const dropdownId = input!.getAttribute('aria-controls');
    expect(dropdownId).toBeTruthy();
    const dropdown = document.getElementById(dropdownId!);
    expect(dropdown).not.toBeNull();
    const option = [...dropdown!.querySelectorAll<HTMLElement>('.select-option')].find(
      (item) => item.textContent?.trim() === value,
    );
    expect(option).not.toBeUndefined();
    option!.click();
    await nextTick();
  }

  const confirm = [...panel!.querySelectorAll<HTMLButtonElement>('button')].find(
    (item) => item.textContent?.trim() === '确定',
  );
  expect(confirm).not.toBeUndefined();
  confirm!.click();
  await nextTick();
}

afterEach(() => {
  vi.useRealTimers();
  cleanup?.();
  cleanup = undefined;
  document.body.querySelectorAll('.b-popover-panel, .select-dropdown').forEach((item) => item.remove());
});

describe('QuickTodoForm', () => {
  it('空标题不能直接创建，但仍可进入完整编辑器', async () => {
    const { host, onSubmit, onDetails } = mountQuickTodoForm();

    clickButton(host, '立即创建');
    clickButton(host, '完善详情');
    await nextTick();

    expect(onSubmit).not.toHaveBeenCalled();
    expect(onDetails).toHaveBeenCalledWith({
      title: '',
      priority: 1,
      dueAt: null,
      quickReminderPreset: 'none',
    });
  });

  it('只填写标题即可创建，并把快捷日期带入待办草稿', async () => {
    const { host, onSubmit } = mountQuickTodoForm();
    await setTitle(host, '整理本周读书笔记');
    clickButton(host, '明天');
    clickButton(host, '立即创建');
    await nextTick();

    expect(onSubmit).toHaveBeenCalledTimes(1);
    const payload = onSubmit.mock.calls[0]?.[0];
    expect(payload.title).toBe('整理本周读书笔记');
    expect(payload.priority).toBe(1);
    expect(payload.dueAt).toMatch(/^\d{4}-\d{2}-\d{2}T23:59$/);
  });

  it('只选择日历日时，今天、明天和本周都以计划时区当日 23:59 截止', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-24T04:00:00.000Z'));
    const { host, onDetails } = mountQuickTodoForm();

    for (const label of ['今天', '明天', '本周']) {
      clickButton(host, label);
      clickButton(host, '完善详情');
      await nextTick();
    }

    expect(onDetails.mock.calls.map((call) => call[0].dueAt)).toEqual([
      '2026-08-24T23:59',
      '2026-08-25T23:59',
      '2026-08-30T23:59',
    ]);
  });

  it('今天的每日提醒已经错过时阻止静默创建，改到未来时刻后恢复', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-24T12:00:00.000Z'));
    const { host, onSubmit } = mountQuickTodoForm();
    await setTitle(host, '晚间复盘');
    clickButton(host, '今天');
    await selectDailyReminderTime(host, '19', '30');

    expect(host.textContent).toContain('今天的提醒时间已经过去');
    clickButton(host, '立即创建');
    expect(onSubmit).not.toHaveBeenCalled();

    await selectDailyReminderTime(host, '21', '00');
    expect(host.textContent).not.toContain('今天的提醒时间已经过去');
    clickButton(host, '立即创建');
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ dueAt: '2026-08-24T23:59', quickReminderTime: '21:00' }),
    );
  });

  it('提醒预设会随立即创建和完善详情一起传递', async () => {
    const { host, onSubmit, onDetails } = mountQuickTodoForm();
    await setTitle(host, '每天查看运营数据');
    await selectDailyReminderTime(host, '14', '30');
    clickButton(host, '完善详情');
    clickButton(host, '立即创建');
    await nextTick();

    expect(onDetails.mock.calls[0]?.[0]).toMatchObject({
      quickReminderPreset: 'daily',
      quickReminderTime: '14:30',
    });
    expect(onSubmit.mock.calls[0]?.[0]).toMatchObject({
      quickReminderPreset: 'daily',
      quickReminderTime: '14:30',
    });
  });
});
