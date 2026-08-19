import { afterEach, describe, expect, it } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import { createI18n } from 'vue-i18n';
import { createPinia } from 'pinia';
import type { TodoItem } from '@/api/todoApi';
import zhCN from '@/i18n/locales/zh-CN';
import TodoSeriesGroup from './TodoSeriesGroup.vue';

let cleanup: (() => void) | undefined;

function item(id: string, occurrenceNo: number): TodoItem {
  return {
    id,
    title: '推广',
    checklist: [],
    priority: 1,
    status: 'pending',
    seriesId: 'series-1',
    occurrenceNo,
    occurrenceDate: `2026-08-${String(17 + occurrenceNo).padStart(2, '0')}`,
    createdAt: '2026-08-18 00:00:00',
    updatedAt: '2026-08-18 00:00:00',
    series: {
      id: 'series-1',
      repeatMode: 'scheduled',
      status: 'active',
      timezone: 'Asia/Shanghai',
      version: 1,
      plan: null,
      timing: null,
      progress: { completed: 0, skipped: 0, generated: 2, total: null },
    },
  };
}

function mountGroup(selectable = false) {
  const items = [item('day-1', 1), item('day-2', 2)];
  const host = document.createElement('div');
  document.body.append(host);
  const app = createApp({
    setup() {
      return () =>
        h(TodoSeriesGroup, {
          seriesId: 'series-1',
          representative: items[0],
          items,
          selectable,
        });
    },
  });
  app.component('OriginalIcon', { render: () => h('span', { 'aria-hidden': 'true' }) });
  app.use(createPinia());
  app.use(createI18n({ legacy: false, locale: 'zh-CN', messages: { 'zh-CN': zhCN } }));
  app.mount(host);
  cleanup = () => {
    app.unmount();
    host.remove();
  };
  return host;
}

afterEach(() => {
  cleanup?.();
  cleanup = undefined;
});

describe('TodoSeriesGroup', () => {
  it('默认只展示当前项，点击后在系列明细抽屉查看独立实例', async () => {
    const host = mountGroup();
    await nextTick();
    expect(host.querySelectorAll('.todo-item')).toHaveLength(1);
    expect(host.querySelector('.todo-series-group__toggle')?.textContent).toContain('查看同系列 2 项');

    host.querySelector<HTMLButtonElement>('.todo-series-group__toggle')!.click();
    await nextTick();
    expect(document.querySelector('.b-drawer-wrapper')).not.toBeNull();
    expect(document.querySelectorAll('.todo-item')).toHaveLength(3);
  });

  it('批量选择态自动展开全部实例，避免隐藏已选项', async () => {
    const host = mountGroup(true);
    await nextTick();
    expect(host.querySelectorAll('.todo-item')).toHaveLength(2);
    expect(host.querySelector('.todo-series-group__toggle')).toBeNull();
  });
});
