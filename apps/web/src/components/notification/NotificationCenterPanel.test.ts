import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import type { NotificationItem } from '@/composables/useNotification';
import NotificationCenterPanel from './NotificationCenterPanel.vue';

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key: string) => key }),
}));

vi.mock('@/components/base/SvgIcon/src/SvgIcon.vue', () => ({
  default: { name: 'SvgIconStub', render: () => h('span', { class: 'svg-icon-stub', 'aria-hidden': 'true' }) },
}));

let cleanup: (() => void) | undefined;

function mountPanel(mobile: boolean) {
  const first: NotificationItem = {
    id: 'todo-1',
    type: 'todo_reminder',
    title: '待办提醒',
    content: '整理新增知识库',
    link: '/inbox',
    meta: { todoId: 'todo-1' },
    isRead: 0,
    createTime: '2026-08-06T09:00:00.000Z',
  };
  const second: NotificationItem = {
    id: 'system-1',
    type: 'system',
    title: '版本发布',
    content: null,
    link: null,
    meta: {},
    isRead: 1,
    createTime: '2026-08-05T09:00:00.000Z',
  };
  const onMore = vi.fn();
  const onDelete = vi.fn();
  const host = document.createElement('div');
  document.body.append(host);
  const app = createApp({
    render: () =>
      h(NotificationCenterPanel, {
        items: [first, second],
        groups: [{ key: 'today', label: '今天', items: [first, second] }],
        tabs: [
          { value: 'all', label: '全部' },
          { value: 'todo_reminder', label: '待办' },
          { value: 'system', label: '系统' },
          { value: 'feedback', label: '反馈' },
        ],
        activeTab: 'all',
        unreadTotal: 1,
        total: 2,
        loading: false,
        completingTodoId: '',
        mobile,
        tabUnread: (value: string) => (value === 'all' || value === 'todo_reminder' ? 1 : 0),
        renderTitle: (item: NotificationItem) => item.title,
        renderContent: (item: NotificationItem) => item.content || '',
        formatTime: () => '5 小时前',
        todoId: (item: NotificationItem) => String(item.meta?.todoId || ''),
        onMore,
        onDelete,
      }),
  });
  app.mount(host);
  cleanup = () => {
    app.unmount();
    host.remove();
  };
  return { host, onMore, onDelete, first };
}

afterEach(() => {
  cleanup?.();
  cleanup = undefined;
});

describe('NotificationCenterPanel', () => {
  it('移动端保留四类筛选、显式未读状态，并把行操作交给更多菜单', async () => {
    const { host, onMore, onDelete, first } = mountPanel(true);
    await nextTick();

    expect(host.querySelectorAll('.nt-tab')).toHaveLength(4);
    expect(host.querySelector('.nt-tab.active')?.textContent).toContain('全部');
    expect(host.querySelectorAll('.nt-group-surface .nt-item')).toHaveLength(2);
    expect(host.querySelector('.nt-item')?.classList.contains('unread')).toBe(true);
    expect(host.querySelector('.nt-item .nt-dot')).not.toBeNull();

    (host.querySelector('.nt-item-action') as HTMLButtonElement).click();
    expect(onMore).toHaveBeenCalledWith(first);
    expect(onDelete).not.toHaveBeenCalled();
  });

  it('桌面端继续直接触发删除操作', async () => {
    const { host, onMore, onDelete, first } = mountPanel(false);
    await nextTick();

    (host.querySelector('.nt-item-action') as HTMLButtonElement).click();
    expect(onDelete).toHaveBeenCalledWith(first);
    expect(onMore).not.toHaveBeenCalled();
  });
});
