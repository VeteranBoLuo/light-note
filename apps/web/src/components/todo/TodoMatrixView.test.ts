import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import { createI18n } from 'vue-i18n';
import TodoMatrixView from './TodoMatrixView.vue';
import type { TodoItem } from '@/api/todoApi';

let cleanup: (() => void) | undefined;

function localDateTime(date: Date) {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(
    date.getMinutes(),
  )}:00`;
}

function todo(id: string, title: string, priority: TodoItem['priority'], dueAt: string | null): TodoItem {
  return {
    id,
    title,
    checklist: [],
    priority,
    status: 'pending',
    dueAt,
    createdAt: '2026-08-11T08:00:00',
    updatedAt: '2026-08-11T08:00:00',
    resourceRefs: [],
  };
}

function mountMatrix() {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 30);
  const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 12);
  const items = [
    todo('important-urgent', '高优先今天截止', 2, localDateTime(today)),
    todo('important-later', '高优先稍后处理', 2, localDateTime(tomorrow)),
    todo('other-urgent', '普通优先今天截止', 1, localDateTime(today)),
    todo('other-later', '低优先无日期', 0, null),
  ];
  const onEdit = vi.fn();
  const onDelete = vi.fn();
  const onToggleComplete = vi.fn();
  const host = document.createElement('div');
  document.body.append(host);
  const app = createApp({
    setup() {
      return () =>
        h(TodoMatrixView, {
          items,
          onEdit,
          onDelete,
          onToggleComplete,
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
          common: { delete: '删除' },
          inbox: {
            todoMatrixLabel: '待办四象限',
            todoMatrixGuide: '自动分类说明',
            todoMatrixCount: '{count} 项待办',
            todoMatrixEmpty: '暂无待办',
            todoMatrixQuadrants: {
              importantUrgent: '重要且紧急',
              importantNotUrgent: '重要但不紧急',
              otherUrgent: '普通或低优先且紧急',
              otherNotUrgent: '普通或低优先且不紧急',
            },
            todoMatrixDescriptions: {
              importantUrgent: '高优先，今天截止',
              importantNotUrgent: '高优先，稍后截止',
              otherUrgent: '普通或低优先，今天截止',
              otherNotUrgent: '普通或低优先，稍后截止',
            },
            todoSelect: '选择待办“{title}”',
            deleteTodo: '删除待办',
            todoPriority0: '低',
            todoPriority1: '普通',
            todoPriority2: '高',
            todoToday: '今天',
            todoTomorrow: '明天',
            todoDue: '截止 {time}',
            todoOverdue: '已逾期 · {time}',
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
  return { host, items, onEdit, onDelete, onToggleComplete };
}

afterEach(() => {
  cleanup?.();
  cleanup = undefined;
});

describe('TodoMatrixView', () => {
  it('按四种组合渲染计数，并把编辑、完成、删除交给既有上层动作', async () => {
    const { host, items, onEdit, onDelete, onToggleComplete } = mountMatrix();
    await nextTick();

    expect(host.querySelectorAll('.todo-matrix__quadrant')).toHaveLength(4);
    for (const key of ['importantUrgent', 'importantNotUrgent', 'otherUrgent', 'otherNotUrgent']) {
      expect(host.querySelector(`.is-${key} .todo-matrix__count`)?.textContent?.trim()).toBe('1');
    }

    host.querySelector<HTMLButtonElement>('.todo-matrix-card__content')!.click();
    expect(onEdit).toHaveBeenCalledWith(items[0]);

    host.querySelector<HTMLElement>('.todo-matrix-card__checkbox')!.click();
    expect(onToggleComplete).toHaveBeenCalledWith(items[0], true);

    host.querySelector<HTMLButtonElement>('.todo-matrix-card__delete')!.click();
    expect(onDelete).toHaveBeenCalledWith(items[0]);
  });
});
