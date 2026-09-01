import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp, h, nextTick, ref } from 'vue';
import { createI18n } from 'vue-i18n';
import TodoItem from './TodoItem.vue';
import type { TodoItem as TodoItemType } from '@/api/todoApi';

const todoItemSource = readFileSync(resolve(process.cwd(), 'src/components/todo/TodoItem.vue'), 'utf8');

const routerPush = vi.fn();
const { recordOperation } = vi.hoisted(() => ({ recordOperation: vi.fn() }));
vi.mock('vue-router', () => ({
  useRouter: () => ({ push: routerPush }),
}));
vi.mock('@/api/commonApi', () => ({ recordOperation }));

let cleanup: (() => void) | undefined;

const todo: TodoItemType = {
  id: 'todo-1',
  title: '整理轻笺交互',
  description: '检查移动端卡片点击边界',
  checklist: [{ id: 'check-1', text: '子待办', done: false }],
  priority: 1,
  status: 'pending',
  dueAt: null,
  createdAt: '2026-08-02T00:00:00.000Z',
  updatedAt: '2026-08-02T00:00:00.000Z',
  resourceRefs: [
    {
      type: 'note',
      id: 'note-1',
      title: '交互记录',
      snapshotTitle: '交互记录',
      available: true,
    },
  ],
};

function pointerEvent(type: string, x: number, y: number, pointerId = 1) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperties(event, {
    pointerId: { value: pointerId },
    pointerType: { value: 'touch' },
    clientX: { value: x },
    clientY: { value: y },
  });
  return event;
}

function mountTodoItem(item: TodoItemType = todo, options: { selectable?: boolean; swipeEnabled?: boolean } = {}) {
  const onPreview = vi.fn();
  const onEdit = vi.fn();
  const onDelete = vi.fn();
  const onSeriesAction = vi.fn();
  const swipeOpen = ref(false);
  const host = document.createElement('div');
  document.body.append(host);
  const app = createApp({
    setup() {
      return () =>
        h(TodoItem, {
          item,
          selectable: options.selectable,
          swipeEnabled: options.swipeEnabled,
          swipeOpen: swipeOpen.value,
          onPreview,
          onEdit,
          onDelete,
          onSeriesAction,
          'onUpdate:swipe-open': (open: boolean) => (swipeOpen.value = open),
        });
    },
  });
  app.use(
    createI18n({
      legacy: false,
      locale: 'zh-CN',
      missingWarn: false,
      fallbackWarn: false,
      messages: {
        'zh-CN': {
          common: { more: '更多', noMatch: '无匹配项', pleaseSelect: '请选择', searchPlaceholder: '搜索' },
          inbox: {
            todo: '待办',
            todoSelect: '选择 {title}',
            todoPriority: '优先级',
            todoPriority0: '低',
            todoPriority1: '普通',
            todoPriority2: '高',
            todoChecklist: '子待办',
            todoChecklistProgress: '{done}/{total}',
            todoResourceRefsTitle: '参考资料',
            todoOpenResource: '打开{type}“{title}”',
            todoRemoveResource: '移除关联资料“{title}”',
            todoMoreResources: '还有 {count} 个关联资料',
            todoResourceUnavailable: '已不可用',
            editTodo: '编辑',
            addToCalendar: '添加日历',
            deleteTodo: '删除',
            todoSnooze: '稍后',
            todoSnoozeTenMinutes: '10 分钟后',
            todoSnoozeTomorrow: '明天',
            todoSnoozeNextWeek: '下周',
            todoReminderInApp: '站内',
            todoReminderEmail: '邮箱',
            todoReminderOnceSummary: '{channels} · 单次提醒',
            todoReminderRepeatSummary: '{channels} · 周期提醒',
            todoNextReminder: '下一次提醒：{time}',
            todoPastReminder: '提醒时间已过：{time}',
            todoToday: '今天',
            todoTomorrow: '明天',
            todoLegacyCompletionBadge: '旧版完成触发重复',
            todoLegacyReminderBadge: '旧版多次提醒',
            todoSeriesPausedBadge: '系列已暂停',
            todoSeriesSkipInstance: '跳过本次',
            todoSeriesPause: '暂停系列',
            todoSeriesResume: '恢复系列',
            todoRecurrenceSummary: { daily: '每 {interval} 天生成下一项' },
            todoSnoozeOneHour: '1 小时后',
            todoSnoozeThreeHours: '3 小时后',
            todoSnoozeOneDay: '1 天后',
          },
          ai: { sourceTypes: { note: '笔记' } },
        },
      },
    }),
  );
  app.directive('click-log', {});
  app.mount(host);
  cleanup = () => {
    app.unmount();
    host.remove();
  };
  return { host, onPreview, onEdit, onDelete, onSeriesAction, swipeOpen };
}

afterEach(() => {
  vi.useRealTimers();
  cleanup?.();
  cleanup = undefined;
  routerPush.mockReset();
  recordOperation.mockReset();
  document
    .querySelectorAll('.b-popover-panel, .b-action-menu-panel, .select-dropdown')
    .forEach((element) => element.remove());
});

describe('TodoItem card preview', () => {
  it('桌面操作区靠右上单行展示，窄桌面空间不足时落到正文下方', () => {
    expect(todoItemSource).toMatch(
      /\.todo-item__actions--desktop\s*\{[\s\S]*?align-self:\s*start;[\s\S]*?flex-wrap:\s*nowrap;[\s\S]*?margin-top:\s*5px;/,
    );
    expect(todoItemSource).toMatch(
      /@media \(min-width: 768px\) and \(max-width: 900px\)[\s\S]*?\.todo-item\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0, 1fr\);[\s\S]*?\.todo-item__actions--desktop\s*\{[\s\S]*?grid-column:\s*1 \/ -1;[\s\S]*?justify-self:\s*end;/,
    );
  });

  it('点击正文进入预览，子待办、参考资料和操作按钮不会透传到卡片预览', async () => {
    const { host, onPreview, onEdit } = mountTodoItem();
    await nextTick();

    host.querySelector<HTMLElement>('.todo-item__description')!.click();
    expect(onPreview).toHaveBeenCalledTimes(1);
    expect(onEdit).not.toHaveBeenCalled();

    host.querySelector<HTMLElement>('.todo-checklist')!.click();
    host.querySelector<HTMLElement>('.todo-resource-refs')!.click();
    host.querySelector<HTMLElement>('.todo-item__main-check')!.click();
    host.querySelector<HTMLButtonElement>('.todo-item__actions--desktop button:last-child')!.click();
    await nextTick();

    expect(onPreview).toHaveBeenCalledTimes(1);
  });

  it('批量选择态不通过正文打开预览', async () => {
    const { host, onPreview } = mountTodoItem(todo, { selectable: true });
    await nextTick();

    host.querySelector<HTMLElement>('.todo-item__body')!.click();
    expect(onPreview).not.toHaveBeenCalled();
  });

  it('批量选择框位于标题行的正常布局流中，不占用截止时间区域', async () => {
    const dueTodo = { ...todo, dueAt: '2026-08-07 18:30:00' };
    const { host } = mountTodoItem(dueTodo, { selectable: true });
    await nextTick();

    const selectionLine = host.querySelector('.todo-item__selection-line');
    expect(selectionLine).not.toBeNull();
    expect(selectionLine?.querySelector('.todo-item__select')).not.toBeNull();
    expect(host.querySelector('.todo-item__meta .todo-item__select')).toBeNull();
  });

  it('按原型先展示标题，再展示计划胶囊和下一次提醒摘要', async () => {
    const { host } = mountTodoItem({
      ...todo,
      reminder: {
        mode: 'once_per_instance',
        channels: ['in_app'],
        nextAt: '2026-08-08 14:00:00',
      },
    });
    await nextTick();

    const title = host.querySelector('.todo-item__main-line')!;
    const chips = host.querySelector('.todo-item__chips')!;
    expect(title.compareDocumentPosition(chips) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(chips.textContent).toContain('站内 · 单次提醒');
    expect(host.querySelector('.todo-reminder-summary')?.textContent).toContain('下一次提醒：');
  });

  it('固定提醒已投递但待办未完成时明确显示提醒时间已过，而不是伪装成任务逾期', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-18T12:00:00'));
    const { host } = mountTodoItem({
      ...todo,
      occurrenceDate: '2026-08-18',
      reminder: {
        mode: 'once_per_instance',
        trigger: { type: 'fixed_time', fixedTime: '10:30' },
        channels: ['in_app'],
        nextAt: null,
        remainingCount: 0,
      },
    });
    await nextTick();

    expect(host.querySelector('.todo-item')?.classList.contains('is-overdue')).toBe(false);
    expect(host.querySelector('.todo-reminder-summary')?.classList.contains('is-past')).toBe(true);
    expect(host.querySelector('.todo-reminder-summary__past')?.textContent).toContain('提醒时间已过：今天 10:30');
  });

  it('稍后提醒仅展示四个相对时间预设', async () => {
    const { host } = mountTodoItem();
    await nextTick();

    const mobileActions = host.querySelectorAll<HTMLButtonElement>('.todo-item__actions--mobile button');
    mobileActions[1]?.click();
    await nextTick();

    const drawerText = document.body.textContent || '';
    expect(drawerText).toContain('10 分钟后');
    expect(drawerText).toContain('1 小时后');
    expect(drawerText).toContain('3 小时后');
    expect(drawerText).toContain('1 天后');
  });

  it('已完成卡片也能通过正文进入预览', async () => {
    const { host, onPreview } = mountTodoItem({ ...todo, status: 'completed' });
    await nextTick();

    host.querySelector<HTMLElement>('.todo-item__body')!.click();
    expect(onPreview).toHaveBeenCalledOnce();
  });

  it('左滑卡片只展开删除操作，不透传预览；点击操作后才请求删除', async () => {
    const { host, onPreview, onEdit, onDelete, swipeOpen } = mountTodoItem(todo, { swipeEnabled: true });
    await nextTick();
    const content = host.querySelector<HTMLElement>('.mobile-swipe-delete__content')!;
    const description = host.querySelector<HTMLElement>('.todo-item__description')!;

    content.dispatchEvent(pointerEvent('pointerdown', 190, 40));
    content.dispatchEvent(pointerEvent('pointermove', 100, 42));
    content.dispatchEvent(pointerEvent('pointerup', 100, 42));
    description.click();
    await nextTick();

    expect(swipeOpen.value).toBe(true);
    expect(onPreview).not.toHaveBeenCalled();
    expect(onEdit).not.toHaveBeenCalled();
    host.querySelector<HTMLButtonElement>('.mobile-swipe-delete__action button')!.click();
    expect(onDelete).toHaveBeenCalledOnce();
  });

  it('旧版重复/周期提醒与新版暂停状态都有不依赖混色的文字标记', async () => {
    const legacy = mountTodoItem({
      ...todo,
      planVersion: 1,
      recurrence: { frequency: 'daily', interval: 1 },
      reminder: {
        mode: 'repeat',
        channels: ['in_app'],
        startAt: '2026-08-06 09:00:00',
        endAt: '2026-08-06 18:00:00',
        intervalMinutes: 60,
      },
    });
    await nextTick();
    expect(legacy.host.querySelectorAll('.todo-legacy-label')).toHaveLength(2);
    expect(legacy.host.textContent).toContain('旧版完成触发重复');
    expect(legacy.host.textContent).toContain('旧版多次提醒');
    cleanup?.();
    cleanup = undefined;

    const paused = mountTodoItem({
      ...todo,
      planVersion: 2,
      seriesId: 'series-1',
      occurrenceNo: 1,
      series: {
        id: 'series-1',
        repeatMode: 'scheduled',
        status: 'paused',
        timezone: 'Asia/Shanghai',
        version: 1,
        plan: { type: 'scheduled', frequency: 'daily', interval: 1, end: { mode: 'never' } },
        timing: null,
        progress: { completed: 0, skipped: 0, generated: 8, total: null },
      },
    });
    await nextTick();
    expect(paused.host.querySelector('.todo-plan-state-label')?.textContent).toBe('系列已暂停');
  });

  it('移动端更多操作通过统一 Action Drawer 发出系列操作', async () => {
    const { host, onSeriesAction } = mountTodoItem({
      ...todo,
      planVersion: 2,
      seriesId: 'series-1',
      occurrenceNo: 1,
      series: {
        id: 'series-1',
        repeatMode: 'scheduled',
        status: 'active',
        timezone: 'Asia/Shanghai',
        version: 1,
        plan: { type: 'scheduled', frequency: 'daily', interval: 1, end: { mode: 'never' } },
        timing: null,
        progress: { completed: 0, skipped: 0, generated: 8, total: null },
      },
    });
    await nextTick();

    const moreButton = Array.from(host.querySelectorAll<HTMLButtonElement>('.todo-item__actions--mobile button')).find(
      (button) => button.textContent?.includes('更多'),
    );
    moreButton?.click();
    await nextTick();

    const pauseButton = Array.from(
      document.body.querySelectorAll<HTMLButtonElement>('.mobile-page-actions__item'),
    ).find((button) => button.textContent?.includes('暂停系列'));
    expect(pauseButton).toBeTruthy();
    expect(document.body.textContent).toContain('删除');
    expect(document.body.textContent).not.toContain('停止整个系列');
    expect(document.body.textContent).not.toContain('结束系列');
    pauseButton?.click();
    await vi.waitFor(() => {
      expect(onSeriesAction).toHaveBeenCalledWith('pause');
    });
  });

  it('桌面更多菜单使用轻量操作项、图标和独立危险分组', async () => {
    const { host, onEdit } = mountTodoItem();
    await nextTick();

    host.querySelector<HTMLButtonElement>('.todo-more-button')?.click();
    await nextTick();

    const panel = document.body.querySelector<HTMLElement>('.b-action-menu-panel');
    expect(panel).toBeTruthy();
    expect(panel?.querySelectorAll('[role="menuitem"]')).toHaveLength(3);
    expect(panel?.querySelectorAll('.b-action-menu__icon')).toHaveLength(3);
    expect(panel?.querySelectorAll('[role="separator"]')).toHaveLength(1);
    expect(panel?.querySelector('.is-danger')?.textContent).toContain('删除');

    const editButton = Array.from(panel?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') || []).find(
      (button) => button.textContent?.includes('编辑'),
    );
    editButton?.click();
    expect(onEdit).toHaveBeenCalledOnce();
    await vi.waitFor(() => {
      expect(document.body.querySelector('.b-action-menu-panel')).toBeNull();
    });
  });

  it('已完成待办的桌面更多菜单只显示删除且没有多余分隔线', async () => {
    const { host } = mountTodoItem({ ...todo, status: 'completed' });
    await nextTick();

    host.querySelector<HTMLButtonElement>('.todo-more-button')?.click();
    await nextTick();

    const panel = document.body.querySelector<HTMLElement>('.b-action-menu-panel');
    expect(panel?.querySelectorAll('[role="menuitem"]')).toHaveLength(1);
    expect(panel?.querySelectorAll('[role="separator"]')).toHaveLength(0);
    expect(panel?.textContent).toContain('删除');
  });
});
