import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import { createI18n } from 'vue-i18n';
import zhCN from '@/i18n/locales/zh-CN';

/**
 * 工作台「明天再看」必须真的把事情挪到明天。
 *
 * 原来它复用待办页的「稍后提醒」接口，那个接口只改 todo_reminders.scheduled_at；
 * 而今日区是按 dueAt 判逾期的，于是逾期待办点完照旧留在工作台 —— 提示说「已更新下次提醒时间」，
 * 用户看到的却是列表没变。这里锁住：普通待办走 updateTodo 改 dueAt，
 * 重复待办才退回只推提醒（顺延它的 dueAt 会让整条周期漂移）。
 */
const updateTodo = vi.fn();
const snoozeTodo = vi.fn();
const completeTodo = vi.fn();
const success = vi.fn();
const error = vi.fn();

vi.mock('@/api/todoApi', () => ({ updateTodo, snoozeTodo, completeTodo }));
vi.mock('@/api/inboxApi', () => ({ completeInbox: vi.fn() }));
vi.mock('@/api/commonApi', () => ({ recordOperation: vi.fn() }));
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
vi.mock('vue-router', () => ({ useRouter: () => ({ push: vi.fn() }) }));

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

async function mountSection(todos: Record<string, unknown>[]) {
  const host = document.createElement('div');
  document.body.append(host);
  const app = createApp({
    render: () =>
      h(TodayActionSection, {
        overdueTodos: todos,
        dueTodayTodos: [],
        inboxItems: [],
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
  snoozeTodo.mockReset();
  completeTodo.mockReset();
  success.mockReset();
  error.mockReset();
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

  it('顺延失败时报错，且不把条目从列表里抹掉', async () => {
    updateTodo.mockResolvedValue({ status: 500, msg: 'boom' });
    const host = await mountSection([OVERDUE]);

    await clickSnooze(host);

    expect(error).toHaveBeenCalled();
    expect(success).not.toHaveBeenCalled();
    expect(host.querySelectorAll('.today-action-row').length).toBe(1);
  });
});
