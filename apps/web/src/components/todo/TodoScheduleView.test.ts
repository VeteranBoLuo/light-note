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

function mountSchedule(view: 'agenda' | 'calendar') {
  const onDelete = vi.fn();
  const host = document.createElement('div');
  document.body.append(host);
  const app = createApp({
    setup() {
      return () => h(TodoScheduleView, { items: [todo], view, swipeEnabled: true, onDelete });
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
  return { host, onDelete };
}

afterEach(() => {
  cleanup?.();
  cleanup = undefined;
});

describe('TodoScheduleView mobile swipe delete', () => {
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
});
