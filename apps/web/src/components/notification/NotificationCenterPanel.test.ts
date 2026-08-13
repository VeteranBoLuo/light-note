import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import type { NotificationItem } from '@/composables/useNotification';
import NotificationCenterPanel from './NotificationCenterPanel.vue';

const source = readFileSync(resolve(process.cwd(), 'src/components/notification/NotificationCenterPanel.vue'), 'utf8');
const bellSource = readFileSync(resolve(process.cwd(), 'src/components/notification/NotificationBell.vue'), 'utf8');

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key: string) => key }),
}));

vi.mock('@/components/base/SvgIcon/src/SvgIcon.vue', () => ({
  default: { name: 'SvgIconStub', render: () => h('span', { class: 'svg-icon-stub', 'aria-hidden': 'true' }) },
}));

let cleanup: (() => void) | undefined;

function mountPanel(mobile: boolean, todoState: 'pending' | 'completed' | 'unavailable' = 'pending', unreadTotal = 1) {
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
        unreadTotal,
        total: 2,
        loading: false,
        completingTodoId: '',
        mobile,
        tabUnread: (value: string) => (value === 'all' || value === 'todo_reminder' ? unreadTotal : 0),
        renderTitle: (item: NotificationItem) => item.title,
        renderContent: (item: NotificationItem) => item.content || '',
        formatTime: () => '5 小时前',
        todoId: (item: NotificationItem) => String(item.meta?.todoId || ''),
        todoActionState: () => todoState,
        onMore,
        onDelete,
      }),
  });
  app.directive('click-log', { mounted: () => undefined });
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
    expect(host.querySelector('.nt-tab.active .nt-tab-check')).not.toBeNull();
    expect(host.querySelectorAll('.nt-tab:not(.active) .nt-tab-check')).toHaveLength(0);
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

  it('分组外框只用于移动端列表表面，不套在桌面通知卡片外', () => {
    expect(source).not.toMatch(/\n  \.nt-group-surface\s*\{/);
    expect(source).toMatch(
      /\.is-mobile \.nt-group-surface\s*\{[\s\S]*?overflow:\s*hidden;[\s\S]*?border:\s*1px solid var\(--surface-border-color\);[\s\S]*?background:\s*var\(--card-background\);/,
    );
  });

  it('卡片操作按钮贴近标题首行，避免落到摘要内容区域', () => {
    expect(source).toMatch(/\.nt-item-action\s*\{[\s\S]*?position:\s*absolute;[\s\S]*?top:\s*0;/);
  });

  it('延续已完成待办状态，只显示状态胶囊', async () => {
    const { host } = mountPanel(false, 'completed');
    await nextTick();

    const actions = host.querySelector('.nt-todo-actions');
    expect(actions?.textContent).toContain('notification.todoCompletedState');
    expect(actions?.querySelectorAll('.nt-todo-action')).toHaveLength(0);
    expect(actions?.querySelector('.nt-todo-state.b-chip--success')).not.toBeNull();
    expect(actions?.querySelector('.nt-todo-state')?.tagName).toBe('SPAN');
  });

  it('待办通知只保留完成操作，进入待办统一点击通知卡片', async () => {
    const { host } = mountPanel(false, 'pending');
    await nextTick();

    const actions = host.querySelector('.nt-todo-actions');
    expect(actions?.querySelectorAll('.nt-todo-action')).toHaveLength(1);
    expect(actions?.textContent).toContain('notification.todoComplete');
  });

  it('延续失效待办状态，不再暴露完成或打开入口', async () => {
    const { host } = mountPanel(false, 'unavailable');
    await nextTick();

    const actions = host.querySelector('.nt-todo-actions');
    expect(actions?.textContent).toContain('notification.todoUnavailable');
    expect(actions?.querySelectorAll('.nt-todo-action')).toHaveLength(0);
  });

  it('移动端操作按钮保留触控热区，但可见尺寸与状态胶囊一致', () => {
    expect(source).toMatch(/\.is-mobile \.nt-todo-action\s*\{[\s\S]*?height: 44px;[\s\S]*?min-height: 44px;/);
    expect(source).toMatch(
      /\.is-mobile \.nt-todo-action::before\s*\{[\s\S]*?inset: 10px 0;[\s\S]*?border-radius: 7px;/,
    );
    expect(source).toMatch(/\.nt-todo-state\s*\{[\s\S]*?min-height: 24px;[\s\S]*?border-radius: 7px;/);
  });

  it('通知分类选中态同时使用实色描边、明确文字色和勾选图标', () => {
    expect(source).toContain('class="nt-tab-check"');
    expect(source).toMatch(
      /\.nt-tab\.active\s*\{[\s\S]*?border:\s*2px solid var\(--primary-color\);[\s\S]*?color:\s*var\(--primary-color\);/,
    );
    expect(source).toMatch(
      /\.is-mobile \.nt-tab\.active\s*\{[\s\S]*?border:\s*2px solid var\(--primary-color\);[\s\S]*?background:\s*var\(--mobile-selected-bg\) !important;/,
    );
    expect(bellSource).toMatch(
      /\.notification-popover \.nt-tab\.active\s*\{[\s\S]*?border-color:\s*var\(--primary-color\);[\s\S]*?color:\s*var\(--primary-color\);/,
    );
    expect(bellSource).not.toMatch(/\.notification-popover \.nt-tab\.active\s*\{[^}]*color:\s*#fff;/);
  });

  it('未读数按个位、两位和 99+ 使用不可收缩的圆形或胶囊角标', async () => {
    const { host } = mountPanel(true, 'pending', 21);
    await nextTick();

    const badge = host.querySelector('.nt-tab.active .nt-tab-badge');
    expect(badge?.textContent?.trim()).toBe('21');
    expect(badge?.classList.contains('is-wide')).toBe(true);
    expect(badge?.classList.contains('is-capped')).toBe(false);
    expect(source).toMatch(/\.nt-tab-badge\s*\{[\s\S]*?display:\s*inline-flex;[\s\S]*?flex:\s*0 0 auto;/);
    expect(source).toMatch(/\.nt-tab-badge\.is-wide\s*\{[\s\S]*?min-width:\s*22px;[\s\S]*?padding:\s*0 5px;/);

    cleanup?.();
    cleanup = undefined;
    const capped = mountPanel(true, 'pending', 128).host.querySelector('.nt-tab.active .nt-tab-badge');
    await nextTick();
    expect(capped?.textContent?.trim()).toBe('99+');
    expect(capped?.classList.contains('is-wide')).toBe(true);
    expect(capped?.classList.contains('is-capped')).toBe(true);
    expect(bellSource).toMatch(/\.notification-popover \.nt-tab-badge\.is-capped\s*\{[\s\S]*?min-width:\s*28px;/);
  });
});
