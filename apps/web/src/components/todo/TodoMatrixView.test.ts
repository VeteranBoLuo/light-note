import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import { createI18n } from 'vue-i18n';
import { createPinia } from 'pinia';
import TodoMatrixView from './TodoMatrixView.vue';
import type { TodoItem } from '@/api/todoApi';
import zhCN from '@/i18n/locales/zh-CN';

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

function mountMatrix(options: { mobile?: boolean; items?: TodoItem[] } = {}) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 30);
  const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 12);
  const items = options.items || [
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
          mobile: options.mobile,
          onEdit,
          onDelete,
          onToggleComplete,
        });
    },
  });
  app.component('OriginalIcon', { render: () => h('span', { 'aria-hidden': 'true' }) });
  app.use(createPinia());
  app.use(
    createI18n({
      legacy: false,
      locale: 'zh-CN',
      missingWarn: false,
      fallbackWarn: false,
      messages: { 'zh-CN': zhCN },
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
  it('桌面端在中性 2×2 矩阵中渲染计数，并复用既有编辑、完成、删除动作', async () => {
    const { host, items, onEdit, onDelete, onToggleComplete } = mountMatrix();
    await nextTick();

    expect(host.querySelectorAll('.todo-matrix__quadrant')).toHaveLength(4);
    for (const key of ['importantUrgent', 'importantNotUrgent', 'otherUrgent', 'otherNotUrgent']) {
      expect(host.querySelector(`[data-quadrant="${key}"] .todo-matrix__count`)?.textContent?.trim()).toBe('1');
    }

    host.querySelector<HTMLButtonElement>('.todo-matrix-card__content')!.click();
    expect(onEdit).toHaveBeenCalledWith(items[0]);

    host.querySelector<HTMLElement>('.todo-matrix-card__checkbox')!.click();
    expect(onToggleComplete).toHaveBeenCalledWith(items[0], true);

    host.querySelector<HTMLButtonElement>('.todo-matrix-card__more')!.click();
    await nextTick();
    await nextTick();
    document.querySelector<HTMLButtonElement>('.b-action-menu__item.is-danger')!.click();
    expect(onDelete).toHaveBeenCalledWith(items[0]);
  });

  it('移动端显示 2×2 象限概览，并且一次只展开用户选中的一个象限', async () => {
    const { host } = mountMatrix({ mobile: true });
    await nextTick();

    expect(host.querySelectorAll('.todo-matrix__overview-button')).toHaveLength(4);
    expect(host.querySelectorAll('.todo-matrix__quadrant')).toHaveLength(1);
    expect(host.querySelector('.todo-matrix__quadrant')?.getAttribute('data-quadrant')).toBe('importantUrgent');

    host.querySelector<HTMLButtonElement>('.todo-matrix__overview-button.is-otherNotUrgent')!.click();
    await nextTick();

    expect(host.querySelectorAll('.todo-matrix__quadrant')).toHaveLength(1);
    expect(host.querySelector('.todo-matrix__quadrant')?.getAttribute('data-quadrant')).toBe('otherNotUrgent');
    expect(host.querySelector('.todo-matrix-card__title')?.textContent).toBe('低优先无日期');
  });

  it('固定日程在四象限只显示下一项，系列胶囊可打开共享明细抽屉且不误触编辑', async () => {
    const now = new Date();
    const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 12);
    const series = { id: 'series-1', repeatMode: 'scheduled', status: 'active' } as TodoItem['series'];
    const first = {
      ...todo('series-1', '每日推广', 1, localDateTime(tomorrow)),
      seriesId: 'series-1',
      series,
      occurrenceNo: 1,
      occurrenceDate: '2026-08-18',
    };
    const second = {
      ...todo('series-2', '每日推广', 1, localDateTime(tomorrow)),
      seriesId: 'series-1',
      series,
      occurrenceNo: 2,
      occurrenceDate: '2026-08-19',
    };
    const { host, onEdit } = mountMatrix({ items: [first, second, todo('single', '单个待办', 1, null)] });
    await nextTick();

    expect(host.querySelectorAll('.todo-matrix-card')).toHaveLength(2);
    expect(host.querySelectorAll('.todo-matrix-card__series')).toHaveLength(1);
    expect(host.querySelector('.todo-matrix-card__series')?.textContent).toContain('今天 1 · 错过 1 · 后续 0');

    const trigger = host.querySelector<HTMLButtonElement>('.todo-matrix-card__series-trigger')!;
    expect(trigger.getAttribute('aria-label')).toContain('查看“每日推广”系列明细，共 2 项');
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    trigger.click();
    await nextTick();

    expect(onEdit).not.toHaveBeenCalled();
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    expect(document.querySelector('.b-drawer-wrapper')).not.toBeNull();
    expect(document.querySelectorAll('.todo-series-drawer__list .todo-item')).toHaveLength(2);
  });
});
