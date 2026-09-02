import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp, h, nextTick, ref } from 'vue';
import AdminRecentAdditions from './AdminRecentAdditions.vue';
import type { AdminRecentData, AdminRecentFilter } from './adminRecentTypes.ts';

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

function mountRecent(options: {
  data: AdminRecentData | null;
  loading?: boolean;
  filter?: AdminRecentFilter;
  filteredTotal?: number | null;
  resourceLoading?: boolean;
  userLoading?: boolean;
  resourceHasMore?: boolean;
  userHasMore?: boolean;
  resourceError?: 'initial' | 'append' | '';
  userError?: 'initial' | 'append' | '';
}) {
  const onRetryResource = vi.fn();
  const onRetryUser = vi.fn();
  const onLoadMoreResource = vi.fn();
  const onLoadMoreUser = vi.fn();
  const onViewUsers = vi.fn();
  const onFilterChange = vi.fn();
  const host = document.createElement('div');
  document.body.append(host);
  const app = createApp({
    render: () =>
      h(AdminRecentAdditions, {
        ...options,
        onRetryResource,
        onRetryUser,
        onLoadMoreResource,
        onLoadMoreUser,
        onViewUsers,
        onFilterChange,
      }),
  });
  app.directive('auto-scrollbar', {});
  app.mount(host);
  cleanup = () => {
    app.unmount();
    host.remove();
  };
  return {
    host,
    onRetryResource,
    onRetryUser,
    onLoadMoreResource,
    onLoadMoreUser,
    onViewUsers,
    onFilterChange,
  };
}

afterEach(() => {
  cleanup?.();
  cleanup = undefined;
});

describe('AdminRecentAdditions', () => {
  it('初次加载展示两张结构化骨架卡', async () => {
    const { host } = mountRecent({ data: null, loading: true, resourceLoading: true, userLoading: true });
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

  it('使用 BVirtualList 保留完整高度且只挂载可视窗口', async () => {
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

    const lists = host.querySelectorAll<HTMLElement>('.admin-recent__list');
    expect(lists).toHaveLength(2);
    expect(lists[0].querySelector<HTMLElement>('.b-virtual-list__sizer')?.style.height).toBe('1160px');
    expect(lists[1].querySelector<HTMLElement>('.b-virtual-list__sizer')?.style.height).toBe('1160px');
    expect(host.querySelectorAll('.admin-recent__row').length).toBeLessThan(40);
  });

  it('今日用户筛选只展示用户明细，并说明权威总数与连续浏览', async () => {
    const data: AdminRecentData = {
      recentResources: [],
      recentUsers: [
        {
          id: 'user-today',
          name: '今日用户',
          role: 'user',
          createdAt: '2026-08-12T01:00:00.000Z',
        },
      ],
      limit: 20,
    };
    const { host } = mountRecent({
      data,
      filter: { period: 'today', type: 'user' },
      filteredTotal: 4,
    });
    await nextTick();

    expect(host.querySelectorAll('.admin-recent__card')).toHaveLength(1);
    expect(host.querySelector('.admin-recent__card--resources')).toBeNull();
    expect(host.querySelector('.admin-recent__card--users')).not.toBeNull();
    expect(host.textContent).toContain('adminOverviewRecent.todaySubtitleWithTotal');
    expect(host.textContent).toContain('adminOverviewRecent.filteredTitle.todayUsers');
    expect(host.querySelectorAll('.admin-recent__filter')).toHaveLength(2);
  });

  it('筛选控件通过统一事件切换时间范围', async () => {
    const { host, onFilterChange } = mountRecent({
      data: { recentResources: [], recentUsers: [] },
      filter: { period: 'recent', type: 'all' },
    });
    await nextTick();

    (host.querySelector('.admin-recent__filter--period .select-trigger') as HTMLElement).click();
    await nextTick();
    const visibleDropdown = Array.from(document.body.querySelectorAll<HTMLElement>('.select-dropdown')).find(
      (element) => element.style.display !== 'none',
    );
    (visibleDropdown?.querySelectorAll<HTMLElement>('.select-option')[1] as HTMLElement).click();
    await nextTick();

    expect(onFilterChange).toHaveBeenCalledWith({ period: 'today', type: 'all' });
  });

  it('两条数据流可独立展示首次加载失败并重试', async () => {
    const { host, onRetryResource, onRetryUser } = mountRecent({
      data: null,
      resourceError: 'initial',
      userError: 'initial',
    });
    await nextTick();

    const errors = host.querySelectorAll('.admin-recent__stream-error');
    expect(errors).toHaveLength(2);
    (errors[0].querySelector('button') as HTMLButtonElement).click();
    (errors[1].querySelector('button') as HTMLButtonElement).click();
    expect(onRetryResource).toHaveBeenCalledTimes(1);
    expect(onRetryUser).toHaveBeenCalledTimes(1);
  });

  it('追加失败保留已加载资源并暂停自动重试', async () => {
    const data: AdminRecentData = {
      recentResources: [
        {
          id: 'bookmark-1',
          type: 'bookmark',
          title: '已加载书签',
          userId: 'user-1',
          createdAt: '2026-08-07T10:00:00.000Z',
        },
      ],
      recentUsers: [],
    };
    const { host, onRetryResource } = mountRecent({
      data,
      filter: { period: 'recent', type: 'resource' },
      resourceHasMore: true,
      resourceError: 'append',
    });
    await nextTick();

    expect(host.textContent).toContain('已加载书签');
    expect(host.textContent).toContain('adminOverviewRecent.loadMoreFailed');
    (host.querySelector('.admin-recent__stream-footer button') as HTMLButtonElement).click();
    expect(onRetryResource).toHaveBeenCalledTimes(1);
  });

  it('接近已加载末尾时由虚拟列表自动请求下一页', async () => {
    const data: AdminRecentData = {
      recentResources: [
        {
          id: 'note-1',
          type: 'note',
          title: '第一页笔记',
          userId: 'user-1',
          createdAt: '2026-08-07T10:00:00.000Z',
        },
      ],
      recentUsers: [],
    };
    const { onLoadMoreResource } = mountRecent({
      data,
      filter: { period: 'recent', type: 'resource' },
      resourceHasMore: true,
    });

    await nextTick();
    await nextTick();
    expect(onLoadMoreResource).toHaveBeenCalledTimes(1);
  });
});
