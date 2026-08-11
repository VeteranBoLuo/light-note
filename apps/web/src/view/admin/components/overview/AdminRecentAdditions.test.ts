import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp, h, nextTick, ref } from 'vue';
import AdminRecentAdditions from './AdminRecentAdditions.vue';
import type { AdminRecentData } from './adminRecentTypes.ts';

vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    t: (key: string, params?: Record<string, string>) => (params?.remark ? `${key}:${params.remark}` : key),
    locale: ref('zh-CN'),
  }),
}));

vi.mock('@/components/base/SvgIcon/src/SvgIcon.vue', () => ({
  default: { name: 'SvgIconStub', render: () => h('span', { class: 'svg-icon-stub', 'aria-hidden': 'true' }) },
}));

let cleanup: (() => void) | undefined;

function mountRecent(options: { data: AdminRecentData | null; loading?: boolean; error?: boolean }) {
  const onRetry = vi.fn();
  const onViewUsers = vi.fn();
  const host = document.createElement('div');
  document.body.append(host);
  const app = createApp({
    render: () =>
      h(AdminRecentAdditions, {
        ...options,
        onRetry,
        onViewUsers,
      }),
  });
  app.mount(host);
  cleanup = () => {
    app.unmount();
    host.remove();
  };
  return { host, onRetry, onViewUsers };
}

afterEach(() => {
  cleanup?.();
  cleanup = undefined;
});

describe('AdminRecentAdditions', () => {
  it('初次加载展示两张结构化骨架卡', async () => {
    const { host } = mountRecent({ data: null, loading: true });
    await nextTick();

    expect(host.querySelectorAll('.admin-recent__card')).toHaveLength(2);
    expect(host.querySelectorAll('.admin-recent__skeleton-row')).toHaveLength(12);
    expect(host.querySelector('[aria-busy="true"]')).not.toBeNull();
  });

  it('展示资源标题、创建者和用户昵称，并保留用户管理入口', async () => {
    const data: AdminRecentData = {
      recentResources: [
        {
          id: 'bookmark-1',
          type: 'bookmark',
          title: 'Vue 文档',
          userId: 'user-1',
          userName: '小白',
          userRemark: '重点客户',
          createdAt: '2026-08-07T10:00:00.000Z',
        },
      ],
      recentUsers: [
        {
          id: 'user-2',
          name: '新用户',
          userRemark: '内测用户',
          role: 'user',
          createdAt: '2026-08-07T11:00:00.000Z',
        },
      ],
    };
    const { host, onViewUsers } = mountRecent({ data });
    await nextTick();

    expect(host.textContent).toContain('Vue 文档');
    expect(host.textContent).toContain('小白');
    expect(host.textContent).toContain('adminOverviewRecent.userRemark:重点客户');
    expect(host.textContent).toContain('新用户');
    expect(host.textContent).toContain('adminOverviewRecent.userRemark:内测用户');
    expect(host.querySelectorAll('.admin-recent__remark')).toHaveLength(2);
    (host.querySelector('.admin-recent__users-link') as HTMLButtonElement).click();
    expect(onViewUsers).toHaveBeenCalledTimes(1);
  });

  it('完整渲染 20 条最近记录', async () => {
    const createdAt = '2026-08-07T10:00:00.000Z';
    const data: AdminRecentData = {
      recentResources: Array.from({ length: 20 }, (_, index) => ({
        id: `bookmark-${index}`,
        type: 'bookmark',
        title: `书签 ${index + 1}`,
        userId: 'user-1',
        userName: '小白',
        createdAt,
      })),
      recentUsers: Array.from({ length: 20 }, (_, index) => ({
        id: `user-${index}`,
        name: `用户 ${index + 1}`,
        role: 'user',
        createdAt,
      })),
    };
    const { host } = mountRecent({ data });
    await nextTick();

    const lists = host.querySelectorAll('.admin-recent__list');
    expect(lists).toHaveLength(2);
    expect(lists[0].children).toHaveLength(20);
    expect(lists[1].children).toHaveLength(20);
  });

  it('加载失败时提供重试动作', async () => {
    const { host, onRetry } = mountRecent({ data: null, error: true });
    await nextTick();

    expect(host.textContent).toContain('adminOverviewRecent.loadFailed');
    (host.querySelector('.admin-recent__error button') as HTMLButtonElement).click();
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
