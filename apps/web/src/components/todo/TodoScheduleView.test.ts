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

  it('日历底部的当天议程列表也提供相同删除入口', async () => {
    const { host, onDelete } = mountSchedule('calendar');
    await nextTick();

    host.querySelector<HTMLElement>('.todo-calendar-day.has-items')!.click();
    await nextTick();
    host.querySelector<HTMLButtonElement>('.todo-calendar-dayitem-swipe .mobile-swipe-delete__action button')!.click();

    expect(onDelete).toHaveBeenCalledWith(todo);
  });
});
