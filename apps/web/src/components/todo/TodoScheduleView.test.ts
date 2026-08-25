import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import { createI18n } from 'vue-i18n';
import { createPinia } from 'pinia';
import TodoScheduleView from './TodoScheduleView.vue';
import type { TodoItem } from '@/api/todoApi';

let cleanup: (() => void) | undefined;

const today = new Date();
const dueAt = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(
  today.getDate(),
).padStart(2, '0')}T09:00:00`;
const todo: TodoItem = {
  id: 'todo-scheduled-1',
  title: '移动端议程滑动测试',
  description: '',
  checklist: [],
  priority: 1,
  status: 'pending',
  dueAt,
  createdAt: dueAt,
  updatedAt: dueAt,
  resourceRefs: [],
};

function mountSchedule(view: 'agenda' | 'calendar', item: TodoItem = todo) {
  const onPreview = vi.fn();
  const onDelete = vi.fn();
  const host = document.createElement('div');
  document.body.append(host);
  const app = createApp({
    setup() {
      return () => h(TodoScheduleView, { items: [item], view, swipeEnabled: true, onPreview, onDelete });
    },
  });
  app.use(createPinia());
  app.use(
    createI18n({
      legacy: false,
      locale: 'zh-CN',
      missingWarn: false,
      fallbackWarn: false,
      messages: {
        'zh-CN': {
          inbox: {
            deleteTodo: '删除',
            todoPending: '未完成',
            todoCompleted: '已完成',
            todoPriority0: '低',
            todoPriority1: '普通',
            todoPriority2: '高',
            todoAllDay: '全天',
            todoGroups: { overdue: '已逾期' },
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
  return { host, onPreview, onDelete };
}

afterEach(() => {
  cleanup?.();
  cleanup = undefined;
});

describe('TodoScheduleView mobile swipe delete', () => {
  it('议程条目默认发出预览而不是编辑', async () => {
    const { host, onPreview } = mountSchedule('agenda');
    await nextTick();

    host.querySelector<HTMLButtonElement>('.todo-agenda-card')!.click();
    expect(onPreview).toHaveBeenCalledWith(todo);
  });

  it('议程卡片的滑动操作会把对应待办交给上层确认删除', async () => {
    const { host, onDelete } = mountSchedule('agenda');
    await nextTick();

    host.querySelector<HTMLButtonElement>('.todo-agenda-card-swipe .mobile-swipe-delete__action button')!.click();
    expect(onDelete).toHaveBeenCalledWith(todo);
  });

  /**
   * 「今天」的高亮曾经全靠 color-mix 的描边与底色，在不支持 color-mix 的移动端 WebView 上
   * 整条声明被丢弃，当天格子看不出任何标记。日期数字必须是独立元素，才能挂实心圆底。
   */
  it('当天格子把日期数字包成独立元素，供不依赖 color-mix 的圆底标记使用', async () => {
    const { host } = mountSchedule('calendar');
    await nextTick();

    const todayCell = host.querySelector<HTMLElement>('.todo-calendar-day.is-today');
    expect(todayCell).not.toBeNull();
    const dayNumber = todayCell!.querySelector<HTMLElement>('.todo-calendar-daynum');
    expect(dayNumber?.textContent).toBe(String(today.getDate()));
  });

  it('日历底部的当天议程列表也提供相同删除入口', async () => {
    const { host, onDelete } = mountSchedule('calendar');
    await nextTick();

    host.querySelector<HTMLElement>('.todo-calendar-day.has-items')!.click();
    await nextTick();
    host.querySelector<HTMLButtonElement>('.todo-calendar-dayitem-swipe .mobile-swipe-delete__action button')!.click();

    expect(onDelete).toHaveBeenCalledWith(todo);
  });

  it('同时有开始与截止时间时，议程按开始时间定位并展示', async () => {
    const startAt = dueAt.replace('T09:00:00', 'T14:00:00');
    const dueTomorrow = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1, 17, 30);
    const item = {
      ...todo,
      id: 'todo-start-first',
      startAt,
      dueAt: `${dueTomorrow.getFullYear()}-${String(dueTomorrow.getMonth() + 1).padStart(2, '0')}-${String(
        dueTomorrow.getDate(),
      ).padStart(2, '0')}T17:30:00`,
    };
    const { host } = mountSchedule('agenda', item);
    await nextTick();

    expect(host.querySelector('.todo-agenda-item time')?.getAttribute('datetime')).toBe(startAt);
  });

  it('跨日任务开始时间已过但截止时间仍在未来时保持未完成状态', async () => {
    const startedYesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1, 15, 35);
    const dueInThreeDays = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 3, 15, 35);
    const local = (value: Date) =>
      `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(
        2,
        '0',
      )}T${String(value.getHours()).padStart(2, '0')}:${String(value.getMinutes()).padStart(2, '0')}:00`;
    const item = {
      ...todo,
      id: 'todo-cross-day',
      startAt: local(startedYesterday),
      dueAt: local(dueInThreeDays),
    };
    const { host } = mountSchedule('agenda', item);
    await nextTick();

    const card = host.querySelector('.todo-agenda-card');
    expect(card?.classList.contains('is-overdue')).toBe(false);
    expect(card?.textContent).toContain('未完成');
    expect(card?.textContent).not.toContain('已逾期');
  });

  it('仅有计划日期的重复实例会作为全天待办出现在议程中', async () => {
    const occurrenceDate = `${dueAt.slice(0, 10)}T00:00:00.000Z`;
    const item: TodoItem = {
      ...todo,
      id: 'todo-all-day',
      title: '每天点外卖',
      startAt: null,
      dueAt: null,
      occurrenceDate,
    };
    const { host } = mountSchedule('agenda', item);
    await nextTick();

    const time = host.querySelector('.todo-agenda-item time');
    expect(time?.getAttribute('datetime')).toBe(occurrenceDate.slice(0, 10));
    expect(time?.textContent).toContain('全天');
    expect(host.querySelector('.todo-agenda-card')?.textContent).toContain('每天点外卖');
  });

  it('切换日历月份时把完整 6 周可视范围交给上层按需补齐', async () => {
    const ranges: Array<{ startDate: string; endDate: string }> = [];
    const host = document.createElement('div');
    document.body.append(host);
    const app = createApp({
      setup() {
        return () =>
          h(TodoScheduleView, { items: [todo], view: 'calendar', onRangeChange: (range) => ranges.push(range) });
      },
    });
    app.use(createPinia());
    app.use(createI18n({ legacy: false, locale: 'zh-CN', messages: { 'zh-CN': { inbox: {} } } }));
    app.mount(host);
    cleanup = () => {
      app.unmount();
      host.remove();
    };
    await nextTick();
    expect(ranges.at(-1)?.startDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(ranges.at(-1)?.endDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);

    host.querySelectorAll<HTMLButtonElement>('.todo-calendar-head button')[1].click();
    await nextTick();
    expect(ranges).toHaveLength(2);
  });
});
