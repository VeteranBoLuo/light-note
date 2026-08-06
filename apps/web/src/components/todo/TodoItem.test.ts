import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp, h, nextTick, ref } from 'vue';
import { createI18n } from 'vue-i18n';
import TodoItem from './TodoItem.vue';
import type { TodoItem as TodoItemType } from '@/api/todoApi';

const routerPush = vi.fn();
vi.mock('vue-router', () => ({
  useRouter: () => ({ push: routerPush }),
}));

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
  const onEdit = vi.fn();
  const onDelete = vi.fn();
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
          onEdit,
          onDelete,
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
            editTodo: '编辑',
            addToCalendar: '添加日历',
            deleteTodo: '删除',
            todoSnooze: '稍后',
            todoSnoozeTenMinutes: '10 分钟后',
            todoSnoozeTomorrow: '明天',
            todoSnoozeNextWeek: '下周',
            todoReminderInApp: '站内',
            todoReminderEmail: '邮箱',
            todoReminderRepeatSummary: '{channels} · 周期提醒',
            todoLegacyCompletionBadge: '旧版完成触发重复',
            todoLegacyReminderBadge: '旧版多次提醒',
            todoSeriesPausedBadge: '系列已暂停',
            todoRecurrenceSummary: { daily: '每 {interval} 天生成下一项' },
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
  return { host, onEdit, onDelete, swipeOpen };
}

afterEach(() => {
  cleanup?.();
  cleanup = undefined;
  routerPush.mockReset();
  document.querySelectorAll('.b-popover-panel, .select-dropdown').forEach((element) => element.remove());
});

describe('TodoItem card editing', () => {
  it('点击正文进入编辑，子待办、参考资料和操作按钮不会透传到卡片编辑', async () => {
    const { host, onEdit } = mountTodoItem();
    await nextTick();

    host.querySelector<HTMLElement>('.todo-item__description')!.click();
    expect(onEdit).toHaveBeenCalledTimes(1);

    host.querySelector<HTMLElement>('.todo-checklist')!.click();
    host.querySelector<HTMLElement>('.todo-resource-refs')!.click();
    host.querySelector<HTMLElement>('.todo-item__main-check')!.click();
    host.querySelector<HTMLButtonElement>('.todo-item__actions--desktop button:last-child')!.click();
    await nextTick();

    expect(onEdit).toHaveBeenCalledTimes(1);
  });

  it('批量选择态不通过正文打开编辑', async () => {
    const { host, onEdit } = mountTodoItem(todo, { selectable: true });
    await nextTick();

    host.querySelector<HTMLElement>('.todo-item__body')!.click();
    expect(onEdit).not.toHaveBeenCalled();
  });

  it('已完成卡片也能通过正文进入编辑', async () => {
    const { host, onEdit } = mountTodoItem({ ...todo, status: 'completed' });
    await nextTick();

    host.querySelector<HTMLElement>('.todo-item__body')!.click();
    expect(onEdit).toHaveBeenCalledOnce();
  });

  it('左滑卡片只展开删除操作，不透传编辑；点击操作后才请求删除', async () => {
    const { host, onEdit, onDelete, swipeOpen } = mountTodoItem(todo, { swipeEnabled: true });
    await nextTick();
    const content = host.querySelector<HTMLElement>('.mobile-swipe-delete__content')!;
    const description = host.querySelector<HTMLElement>('.todo-item__description')!;

    content.dispatchEvent(pointerEvent('pointerdown', 190, 40));
    content.dispatchEvent(pointerEvent('pointermove', 100, 42));
    content.dispatchEvent(pointerEvent('pointerup', 100, 42));
    description.click();
    await nextTick();

    expect(swipeOpen.value).toBe(true);
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
});
