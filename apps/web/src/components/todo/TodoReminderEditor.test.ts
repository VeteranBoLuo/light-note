import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp, h, nextTick, ref } from 'vue';
import { createI18n } from 'vue-i18n';
import type { TodoSingleTaskReminderSchedule } from '@/api/todoApi';
import zhCN from '@/i18n/locales/zh-CN';
import TodoReminderEditor from './TodoReminderEditor.vue';
import { normalizeTodoCreateDraft } from './todoDraftNormalizer';

vi.mock('@/components/base/SvgIcon/src/SvgIcon.vue', () => ({
  default: { template: '<span />' },
}));

let cleanup: (() => void) | undefined;
afterEach(() => {
  cleanup?.();
  document
    .querySelectorAll('.b-datetime-popover, .b-time-popover, .select-dropdown')
    .forEach((element) => element.remove());
});

function mountEditor(initial: TodoSingleTaskReminderSchedule) {
  const model = ref(initial);
  const host = document.createElement('div');
  document.body.append(host);
  const app = createApp({
    render: () =>
      h(TodoReminderEditor, {
        modelValue: model.value,
        'onUpdate:modelValue': (value: TodoSingleTaskReminderSchedule) => {
          model.value = value;
        },
      }),
  });
  app.use(createI18n({ legacy: false, locale: 'zh-CN', messages: { 'zh-CN': zhCN } }));
  app.mount(host);
  cleanup = () => {
    app.unmount();
    host.remove();
  };
  async function click(text: string, root: ParentNode = host) {
    const button = [...root.querySelectorAll<HTMLButtonElement>('button')].find(
      (element) => element.textContent?.trim() === text && !element.closest('.b-popover-fade-leave-active'),
    );
    expect(button, text).toBeTruthy();
    button!.click();
    await nextTick();
  }
  return { host, model, click };
}

function fixedReminder(): TodoSingleTaskReminderSchedule {
  return { version: 1, mode: 'once', once: { type: 'fixed_at', fixedAt: '2026-10-22T23:17' }, channels: ['in_app'] };
}

describe('提醒编辑器切换与日期输入', () => {
  it('从固定一次沿用完整日期和原始分钟，并在所有周期类型之间保留', async () => {
    const { host, model, click } = mountEditor(fixedReminder());
    await click('按周期重复');
    expect(model.value.repeat?.startAt).toBe('2026-10-22T23:17');
    for (const kind of ['按周', '按月', '按间隔']) {
      await click(kind);
      expect(host.querySelector(kind === '按间隔' ? '.b-datetime-trigger' : '.b-time-trigger')?.textContent).toContain(
        '23:17',
      );
      expect(model.value.repeat?.startAt).toBe('2026-10-22T23:17');
      expect(model.value.repeat?.localTime).toBe('23:17');
      expect(host.querySelectorAll('.b-datetime-trigger')).toHaveLength(1);
      expect(host.querySelectorAll('.b-time-trigger')).toHaveLength(kind === '按间隔' ? 0 : 1);
    }
    await click('定时提醒');
    expect(model.value.once?.fixedAt).toBe('2026-10-22T23:17');
    await click('按周期重复');
    expect(model.value.repeat?.startAt).toBe('2026-10-22T23:17');
  });

  it('切回已有周期草稿时保留单独设置的时间、日期与停止条件', async () => {
    const { model, click } = mountEditor({
      ...fixedReminder(),
      mode: 'repeat',
      repeat: {
        kind: 'monthly',
        startDate: '2026-11-01',
        localTime: '14:23',
        monthDays: [15, 31],
        stop: { type: 'max_count', maxCount: 8 },
      },
    });
    await click('定时提醒');
    await click('按周期重复');
    expect(model.value.repeat).toMatchObject({
      startDate: '2026-11-01',
      localTime: '14:23',
      monthDays: [15, 31],
      stop: { maxCount: 8 },
    });
    await click('按间隔');
    expect(model.value.repeat?.startAt).toBe('2026-11-01T14:23');
    await click('按月');
    expect(model.value.repeat?.monthDays).toEqual([15, 31]);
  });

  it('未填固定时间时保留空选择器，不用相对提醒冒充绝对时间', async () => {
    const { host, model, click } = mountEditor({
      version: 1,
      mode: 'once',
      once: { type: 'before_due', offsetMinutes: 60 },
      channels: ['in_app'],
    });
    await click('按周期重复');
    expect(model.value.repeat?.startAt).toBeUndefined();
    expect(host.querySelector('.b-datetime-trigger')?.textContent).toContain('选择日期和时间');
    await click('按周');
    expect(host.querySelector('.b-datetime-trigger')?.textContent).toContain('选择日期');
    expect(host.querySelector('.b-time-trigger')?.textContent).toContain('09:00');
  });

  it.each(['weekly', 'monthly'] as const)('编辑已有 %s 时分别修改开始日期和提醒时刻，切换间隔仍沿用', async (kind) => {
    const { host, model, click } = mountEditor({
      version: 1,
      mode: 'repeat',
      channels: ['in_app'],
      repeat: {
        kind,
        startDate: '2026-10-22',
        localTime: '23:17',
        weekdays: [4],
        monthDays: [22],
        stop: { type: 'completion' },
      },
    });
    expect(host.textContent).toContain('从哪天开始');
    expect(host.textContent).toContain('每次几点提醒');
    expect(host.textContent).toContain('首次提醒不一定在开始当天');
    host.querySelector<HTMLButtonElement>('.b-datetime-trigger')!.click();
    await nextTick();
    expect(document.querySelector('.b-datetime-times')).toBeNull();
    await click('23', document);
    await click('确定', document);
    expect(model.value.repeat).toMatchObject({ startDate: '2026-10-23', localTime: '23:17' });

    host.querySelector<HTMLButtonElement>('.b-time-trigger')!.click();
    await nextTick();
    const inputs = document.querySelectorAll<HTMLInputElement>('.b-time-popover .select-search-inline');
    expect(inputs).toHaveLength(2);
    inputs[0].value = '14';
    inputs[0].dispatchEvent(new Event('input', { bubbles: true }));
    await nextTick();
    await click('确定', document);
    expect(model.value.repeat).toMatchObject({ startDate: '2026-10-23', localTime: '14:17' });
    await click('按间隔');
    expect(model.value.repeat?.startAt).toBe('2026-10-23T14:17');

    await click(kind === 'weekly' ? '按周' : '按月');
    host.querySelector<HTMLButtonElement>('.b-datetime-trigger')!.click();
    await nextTick();
    await click('清空', document);
    expect(model.value.repeat).toMatchObject({ startDate: '', localTime: '14:17', startAt: '' });
    await click('按间隔');
    expect(model.value.repeat?.startAt).toBe('');
  });

  it('只有输入了 29、30 或 31 日时才展示缺失日期处理，隐藏后保留用户选择', async () => {
    const { host, model, click } = mountEditor(fixedReminder());
    await click('按周期重复');
    await click('按月');
    const input = host.querySelector<HTMLInputElement>('input[placeholder="例如 1、15、31"]')!;
    async function inputDays(text: string) {
      input.value = text;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      await nextTick();
    }
    for (const text of ['', '1、15、28', '32']) {
      await inputDays(text);
      expect(host.textContent).not.toContain('当月没有这一天时');
    }
    for (const text of ['29', '30', '31', '15、31']) {
      await inputDays(text);
      expect(host.textContent).toContain('当月没有这一天时');
    }
    model.value = { ...model.value, repeat: { ...model.value.repeat!, shortMonthPolicy: 'skip' } };
    await nextTick();
    expect(host.textContent).toContain('当月跳过这一天');
    await inputDays('15');
    expect(host.textContent).not.toContain('当月没有这一天时');
    await inputDays('15、31');
    expect(host.textContent).toContain('当月跳过这一天');
    expect(model.value.repeat?.shortMonthPolicy).toBe('skip');
    await click('按周');
    expect(host.textContent).not.toContain('当月没有这一天时');
  });

  it.each(['、', ',', '，', ' '])('按月初次留空，连续输入 %s 分隔的日期不会丢分隔符或两位日期', async (separator) => {
    const { host, model, click } = mountEditor(fixedReminder());
    await click('按周期重复');
    await click('按月');
    const input = host.querySelector<HTMLInputElement>('input[placeholder="例如 1、15、31"]')!;
    expect(input.value).toBe('');
    expect(model.value.repeat?.monthDays).toEqual([]);
    let text = '';
    for (const character of `31${separator}1${separator}15${separator}1`) {
      text += character;
      input.value = text;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      await nextTick();
      expect(input.value).toBe(text);
    }
    expect(model.value.repeat?.monthDays).toEqual([1, 15, 31]);
    await click('按周');
    await click('按月');
    expect(model.value.repeat?.monthDays).toEqual([1, 15, 31]);
  });

  it('外部替换月份配置时同步输入，提交只使用当前模式的规则', async () => {
    const { host, model, click } = mountEditor(fixedReminder());
    await click('按周期重复');
    await click('按月');
    model.value = { ...model.value, repeat: { ...model.value.repeat!, monthDays: [8, 20] } };
    await nextTick();
    expect(host.querySelector<HTMLInputElement>('input[placeholder="例如 1、15、31"]')!.value).toBe('8、20');
    const normalized = normalizeTodoCreateDraft({
      task: { title: '测试提醒', description: '', priority: 1, checklist: [], contextRefs: [] },
      timing: { startAt: null, dueAt: null, timezone: 'Asia/Shanghai' },
      reminder: model.value,
      independentTasks: { enabled: false, plan: { type: 'once' }, reminder: { mode: 'none', channels: [] } },
    });
    expect(normalized.singleTaskReminder?.once).toBeUndefined();
    expect(normalized.singleTaskReminder?.repeat).toMatchObject({
      startDate: '2026-10-22',
      localTime: '23:17',
      monthDays: [8, 20],
    });
  });
});

it('定时提醒可加多个日期时间、填写空行和删除指定行，切换模式后保留', async () => {
  const { host, model, click } = mountEditor(fixedReminder());
  expect(host.textContent).toContain('定时提醒');
  async function clickNamed(name: string) {
    const button = host.querySelector<HTMLButtonElement>(`button[aria-label="${name}"]`);
    expect(button).toBeTruthy();
    button!.click();
    await nextTick();
  }
  await clickNamed('添加提醒时间');
  expect(host.querySelectorAll('.b-datetime-trigger')).toHaveLength(2);
  expect(model.value.once?.fixedAts).toEqual(['2026-10-22T23:17', '']);
  host.querySelectorAll<HTMLButtonElement>('.b-datetime-trigger')[1].click();
  await nextTick();
  await click('确定', document);
  const second = model.value.once?.fixedAts?.[1];
  expect(second).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
  expect(model.value.once?.fixedAt).toBe('2026-10-22T23:17');
  await click('按周期重复');
  expect(model.value.repeat?.startAt).toBe('2026-10-22T23:17');
  await click('定时提醒');
  expect(model.value.once?.fixedAts).toEqual(['2026-10-22T23:17', second]);
  await clickNamed('删除第 1 个提醒时间');
  expect(host.querySelectorAll('.b-datetime-trigger')).toHaveLength(1);
  expect(model.value.once).toEqual({ type: 'fixed_at', fixedAt: second });
  expect(host.querySelector('[aria-label="删除第 1 个提醒时间"]')).toBeNull();
});

it('已有多时间配置原样回显，外部重置为单个时间后清理多余行', async () => {
  const { host, model } = mountEditor({
    ...fixedReminder(),
    once: { type: 'fixed_at', fixedAt: '2026-10-22T23:17', fixedAts: ['2026-10-22T23:17', '2026-10-24T11:23'] },
  });
  expect(host.querySelectorAll('.b-datetime-trigger')).toHaveLength(2);
  model.value = fixedReminder();
  await nextTick();
  expect(host.querySelectorAll('.b-datetime-trigger')).toHaveLength(1);
  expect(model.value.once?.fixedAts).toBeUndefined();
});
