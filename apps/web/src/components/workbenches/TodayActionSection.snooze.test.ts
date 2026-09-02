import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import { createI18n } from 'vue-i18n';
import zhCN from '@/i18n/locales/zh-CN';

/**
 * 工作台「明天再看」必须真的把事情挪到明天。
 *
 * 原来它复用待办页的「稍后提醒」接口，那个接口只改 todo_reminders.scheduled_at；
 * 而今日区是按 dueAt 判逾期的，于是逾期待办点完照旧留在工作台 —— 提示说「已更新下次提醒时间」，
 * 用户看到的却是列表没变。这里锁住：v1 普通待办走 updateTodo 改 dueAt，v2 单任务走
 * “预览 → 当前项更新”；v1/v2 重复待办都只推提醒（顺延 dueAt 会破坏系列日程）。
 */
const updateTodo = vi.fn();
const previewTodoPlanUpdateV2 = vi.fn();
const updateTodoPlanV2 = vi.fn();
const snoozeTodo = vi.fn();
const completeTodo = vi.fn();
const success = vi.fn();
const error = vi.fn();
const routerPush = vi.fn();

vi.mock('@/api/todoApi', () => ({
  updateTodo,
  previewTodoPlanUpdateV2,
  updateTodoPlanV2,
  snoozeTodo,
  completeTodo,
}));
vi.mock('@/api/inboxApi', () => ({ completeInbox: vi.fn() }));
vi.mock('@/api/commonApi', () => ({ recordOperation: vi.fn() }));
vi.mock('@/utils/common', () => ({ generateUUID: vi.fn(() => 'todo-idempotency-key') }));
vi.mock('@/composables/useGuestGuard', () => ({ blockGuestWrite: vi.fn(() => false) }));
vi.mock('@/store', () => ({ inboxStore: () => ({ refreshCount: vi.fn() }) }));
vi.mock('@/components/base/BasicComponents/BMessage/BMessage', () => ({
  default: { success, error, warning: vi.fn(), info: vi.fn() },
}));
vi.mock('@/components/base/BasicComponents/BMessage/BMessage.ts', () => ({
  default: { success, error, warning: vi.fn(), info: vi.fn() },
}));
vi.mock('@/components/todo/TodoEditorModal.vue', () => ({
  default: { name: 'TodoEditorModalStub', template: '<div />' },
}));
vi.mock('vue-router', () => ({
  useRouter: () => ({ push: routerPush, currentRoute: { value: { fullPath: '/workbenches' } } }),
}));

const { default: TodayActionSection } = await import('./TodayActionSection.vue');

/** 逾期两天的普通待办 */
const OVERDUE = {
  id: 'todo-overdue',
  title: '测试',
  checklist: [],
  priority: 'normal',
  status: 'pending',
  dueAt: '2026-08-01 16:45',
  createdAt: '2026-08-01 10:00',
  updatedAt: '2026-08-01 10:00',
};

let cleanup: (() => void) | undefined;

interface MountSectionOptions {
  contained?: boolean;
  inboxItems?: Array<{ resourceType: 'note'; resourceId: string; title: string; collectedAt: string }>;
  inboxTotal?: number;
}

async function mountSection(todos: Record<string, unknown>[], options: MountSectionOptions = {}) {
  const host = document.createElement('div');
  document.body.append(host);
  const app = createApp({
    render: () =>
      h(TodayActionSection, {
        overdueTodos: todos,
        dueTodayTodos: [],
        inboxItems: options.inboxItems || [],
        inboxTotal: options.inboxTotal,
        contained: options.contained,
      }),
  });
  app.use(createI18n({ legacy: false, locale: 'zh-CN', messages: { 'zh-CN': zhCN } }));
  app.mount(host);
  await nextTick();
  cleanup = () => {
    app.unmount();
    host.remove();
  };
  return host;
}

function inboxItems(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    resourceType: 'note' as const,
    resourceId: `note-${index + 1}`,
    title: `待整理笔记 ${index + 1}`,
    collectedAt: '2026-08-14 10:00',
  }));
}

/** 取这一行的推迟按钮：普通待办叫「明天再看」，重复待办叫「推迟提醒」 */
function snoozeButton(host: HTMLElement) {
  const buttons = [...host.querySelectorAll<HTMLElement>('.today-action-row__actions button')];
  return buttons.find((b) => /明天再看|推迟提醒/.test(b.textContent || ''));
}

async function clickSnooze(host: HTMLElement) {
  snoozeButton(host)?.click();
  await nextTick();
  await Promise.resolve();
  await Promise.resolve();
  await nextTick();
}

afterEach(() => {
  cleanup?.();
  cleanup = undefined;
  updateTodo.mockReset();
  previewTodoPlanUpdateV2.mockReset();
  updateTodoPlanV2.mockReset();
  snoozeTodo.mockReset();
  completeTodo.mockReset();
  success.mockReset();
  error.mockReset();
  routerPush.mockReset();
});

describe('工作台待整理明细入口', () => {
  it('查看全部直达整理中心的待整理子页', async () => {
    const host = await mountSection([], { inboxItems: inboxItems(1), inboxTotal: 1 });
    const button = [...host.querySelectorAll<HTMLButtonElement>('button')].find(
      (item) => item.textContent?.trim() === '查看全部',
    );

    button?.click();
    await nextTick();

    expect(routerPush).toHaveBeenCalledWith({ path: '/organize', query: { issue: 'pending' } });
  });
});

describe('工作台今日待办 · 明天再看', () => {
  it('逾期待办顺延 dueAt，而不是只推提醒', async () => {
    updateTodo.mockResolvedValue({ status: 200 });
    const host = await mountSection([OVERDUE]);

    expect(snoozeButton(host)?.textContent?.trim()).toBe('明天再看');

    await clickSnooze(host);

    expect(updateTodo).toHaveBeenCalledTimes(1);
    const [id, payload] = updateTodo.mock.calls[0];
    expect(id).toBe('todo-overdue');
    // 顺延到明天上午 9 点，格式与 todoSnoozeAt('tomorrow') 一致
    expect(payload.dueAt).toMatch(/^\d{4}-\d{2}-\d{2}T09:00$/);
    // 关键:不能再走只改提醒时间的接口，否则 dueAt 还在过去、条目一刷新就回来
    expect(snoozeTodo).not.toHaveBeenCalled();
  });

  it('顺延成功后本条从今日区移除', async () => {
    updateTodo.mockResolvedValue({ status: 200 });
    const host = await mountSection([OVERDUE]);
    expect(host.querySelectorAll('.today-action-row').length).toBe(1);

    await clickSnooze(host);

    expect(host.querySelectorAll('.today-action-row').length).toBe(0);
    expect(success).toHaveBeenCalledWith('已顺延到明天上午 9 点');
  });

  it('重复待办只推提醒、不动 dueAt，且条目仍留在今日区', async () => {
    snoozeTodo.mockResolvedValue({ status: 200 });
    const host = await mountSection([{ ...OVERDUE, recurrence: { mode: 'daily', interval: 1 } }]);

    // 按钮不能叫「明天再看」——它不会把这条挪到明天
    expect(snoozeButton(host)?.textContent?.trim()).toBe('推迟提醒');

    await clickSnooze(host);

    // 顺延 dueAt 会让整条周期一起漂移，所以这里只能推提醒
    expect(snoozeTodo).toHaveBeenCalledTimes(1);
    expect(updateTodo).not.toHaveBeenCalled();
    // 截止时间没动 → 它确实还属于今天，留在列表里才和提示一致，不能乐观移除
    expect(host.querySelectorAll('.today-action-row').length).toBe(1);
    expect(success).toHaveBeenCalledWith('已推迟提醒；重复待办的截止时间保持不变');
  });

  it('v2 单任务通过当前项计划预览顺延截止时间', async () => {
    previewTodoPlanUpdateV2.mockResolvedValue({ status: 200, data: { previewHash: 'preview-v2' } });
    updateTodoPlanV2.mockResolvedValue({ status: 200 });
    const host = await mountSection([
      {
        ...OVERDUE,
        planVersion: 2,
        seriesId: null,
        instanceTimezone: 'Asia/Shanghai',
        reminder: { version: 1, mode: 'none', channels: [] },
      },
    ]);

    expect(snoozeButton(host)?.textContent?.trim()).toBe('明天再看');
    await clickSnooze(host);

    expect(previewTodoPlanUpdateV2).toHaveBeenCalledWith('todo-overdue', 'current', expect.any(Object));
    expect(updateTodoPlanV2).toHaveBeenCalledWith(
      'todo-overdue',
      'current',
      expect.objectContaining({ previewHash: 'preview-v2', idempotencyKey: expect.any(String) }),
      { silent: true },
    );
    expect(updateTodo).not.toHaveBeenCalled();
    expect(snoozeTodo).not.toHaveBeenCalled();
    expect(success).toHaveBeenCalledWith('已顺延到明天上午 9 点');
  });

  it('v2 系列实例识别为重复任务并只推迟提醒', async () => {
    snoozeTodo.mockResolvedValue({ status: 200 });
    const host = await mountSection([{ ...OVERDUE, planVersion: 2, seriesId: 'series-1', recurrence: null }]);

    expect(snoozeButton(host)?.textContent?.trim()).toBe('推迟提醒');
    await clickSnooze(host);

    expect(snoozeTodo).toHaveBeenCalledWith('todo-overdue', expect.any(String), { silent: true });
    expect(updateTodo).not.toHaveBeenCalled();
    expect(previewTodoPlanUpdateV2).not.toHaveBeenCalled();
    expect(updateTodoPlanV2).not.toHaveBeenCalled();
    expect(host.querySelectorAll('.today-action-row').length).toBe(1);
  });

  it('计划预览失败只展示一次后端错误', async () => {
    previewTodoPlanUpdateV2.mockResolvedValue({ status: 409, msg: '计划预览已变化' });
    const host = await mountSection([
      {
        ...OVERDUE,
        planVersion: 2,
        seriesId: null,
        reminder: { version: 1, mode: 'none', channels: [] },
      },
    ]);

    await clickSnooze(host);

    expect(error).toHaveBeenCalledTimes(1);
    expect(error).toHaveBeenCalledWith('计划预览已变化');
    expect(updateTodoPlanV2).not.toHaveBeenCalled();
  });

  it('顺延失败时报错，且不把条目从列表里抹掉', async () => {
    updateTodo.mockResolvedValue({ status: 500, msg: 'boom' });
    const host = await mountSection([OVERDUE]);

    await clickSnooze(host);

    expect(error).toHaveBeenCalled();
    expect(success).not.toHaveBeenCalled();
    expect(host.querySelectorAll('.today-action-row').length).toBe(1);
  });
});

describe('桌面工作台行动摘要布局', () => {
  it('待办与待整理同时存在时总共只展示五条，并为待整理保留位置', async () => {
    const host = await mountSection(
      Array.from({ length: 6 }, (_, index) => ({ ...OVERDUE, id: `todo-${index + 1}`, title: `待办 ${index + 1}` })),
      { contained: true, inboxItems: inboxItems(5), inboxTotal: 8 },
    );
    const groups = host.querySelectorAll('.today-actions__group');

    expect(groups).toHaveLength(2);
    expect(groups[0].querySelectorAll('.today-action-row')).toHaveLength(4);
    expect(groups[1].querySelectorAll('.today-action-row')).toHaveLength(1);
    expect(host.querySelectorAll('.today-action-row')).toHaveLength(5);
    expect(groups[1].querySelector('.today-actions__group-head span')?.textContent).toBe('8');
  });

  it('只有一条待办时用四条待整理补满摘要预算', async () => {
    const host = await mountSection([OVERDUE], { contained: true, inboxItems: inboxItems(5) });
    const groups = host.querySelectorAll('.today-actions__group');

    expect(groups[0].querySelectorAll('.today-action-row')).toHaveLength(1);
    expect(groups[1].querySelectorAll('.today-action-row')).toHaveLength(4);
    expect(host.querySelectorAll('.today-action-row')).toHaveLength(5);
  });

  it('移动端非 contained 模式继续展示接口返回的全部明细', async () => {
    const host = await mountSection(
      Array.from({ length: 6 }, (_, index) => ({ ...OVERDUE, id: `todo-${index + 1}` })),
      { inboxItems: inboxItems(5) },
    );

    expect(host.querySelectorAll('.today-action-row')).toHaveLength(11);
  });
});
