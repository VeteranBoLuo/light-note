import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import { createI18n } from 'vue-i18n';
import zhCN from '@/i18n/locales/zh-CN';

const apiMocks = vi.hoisted(() => ({ load: vi.fn(), retry: vi.fn() }));
const routerMocks = vi.hoisted(() => ({ push: vi.fn() }));
const messageMocks = vi.hoisted(() => ({ error: vi.fn(), warning: vi.fn(), success: vi.fn() }));

vi.mock('@/api/commonApi', () => ({ getAdminActionCenter: apiMocks.load, retryAdminAsyncJob: apiMocks.retry }));
vi.mock('@/router', () => ({ default: routerMocks }));
vi.mock('@/components/base/BasicComponents/BMessage/BMessage', () => ({ default: messageMocks }));
vi.mock('@/components/admin/AdminDataPage.vue', () => ({
  default: {
    name: 'AdminDataPageStub',
    template:
      '<main><header><slot name="metrics" /></header><nav><slot name="toolbar" /></nav><div><slot /></div></main>',
  },
}));

const { default: ActionCenter } = await import('./ActionCenter.vue');

function payload() {
  return {
    status: 200,
    data: {
      unavailableSources: ['community_report'],
      work: {
        total: 2,
        critical: 1,
        sources: [
          { source: 'opinion', count: 1, critical: 0 },
          { source: 'security', count: 1, critical: 1 },
        ],
        items: [
          {
            id: 'opinion-1',
            source: 'opinion',
            status: 'pending',
            severity: 'normal',
            title: '功能建议',
            ownerLabel: '用户甲',
            updatedAt: '2026-08-09 12:00:00',
            targetUrl: '/admin/userOpinion?opinionId=opinion-1',
          },
        ],
      },
      jobs: {
        attention: 1,
        running: 0,
        waiting: 1,
        completed24h: 4,
        sources: [
          { source: 'bookmark_icon', total: 30, attention: 30, running: 0, waiting: 0, completed24h: 0 },
          { source: 'email_delivery', total: 2, attention: 1, running: 0, waiting: 0, completed24h: 4 },
        ],
        items: [
          {
            id: 'mail-1',
            source: 'email_delivery',
            status: 'attention',
            rawStatus: 'sending',
            title: '待办提醒',
            ownerLabel: 'ab****@example.com',
            attempts: 1,
            errorCode: 'DELIVERY_RESULT_UNKNOWN',
            updatedAt: '2026-08-09 11:00:00',
            targetUrl: '/notificationCenter?tab=email',
          },
        ],
      },
    },
  };
}

function mountPage() {
  const host = document.createElement('div');
  document.body.append(host);
  const app = createApp({ render: () => h(ActionCenter) });
  app.use(createI18n({ legacy: false, locale: 'zh-CN', messages: { 'zh-CN': zhCN } }));
  app.directive('auto-scrollbar', {});
  app.mount(host);
  return {
    host,
    unmount() {
      app.unmount();
      host.remove();
    },
  };
}

describe('ActionCenter', () => {
  let cleanup: (() => void) | undefined;

  beforeEach(() => {
    vi.clearAllMocks();
    apiMocks.load.mockResolvedValue(payload());
    apiMocks.retry.mockResolvedValue({ status: 200, data: { status: 'queued' } });
  });

  afterEach(() => {
    cleanup?.();
    cleanup = undefined;
    document.body.innerHTML = '';
  });

  it('部分来源不可用时仍展示人工队列，并能进入原业务页面', async () => {
    const mounted = mountPage();
    cleanup = mounted.unmount;
    await vi.waitFor(() => expect(mounted.host.textContent).toContain('功能建议'));

    expect(mounted.host.textContent).toContain('部分来源暂不可用');
    expect(mounted.host.textContent).toContain('消息举报');
    mounted.host.querySelector<HTMLButtonElement>('.action-center__item button')!.click();
    expect(routerMocks.push).toHaveBeenCalledWith('/admin/userOpinion?opinionId=opinion-1');
  });

  it('切换到异步任务后展示脱敏收件人和结果未知状态', async () => {
    const mounted = mountPage();
    cleanup = mounted.unmount;
    await vi.waitFor(() => expect(mounted.host.textContent).toContain('功能建议'));

    const jobTab = [...mounted.host.querySelectorAll<HTMLElement>('[role="tab"]')].find((tab) =>
      tab.textContent?.includes('异步任务健康'),
    );
    jobTab!.click();
    await nextTick();

    expect(mounted.host.textContent).toContain('ab****@example.com');
    expect(mounted.host.textContent).not.toContain('private@example.com');
    expect(mounted.host.textContent).toContain('DELIVERY_RESULT_UNKNOWN');
  });

  it('点击来源卡片后从服务端读取该来源明细并显示选中态', async () => {
    apiMocks.load.mockImplementation(async (params?: { source?: string }) => {
      const response: any = payload();
      if (params?.source === 'bookmark_icon') {
        response.data.jobs.items = [
          {
            id: 'bookmark-job-1',
            source: 'bookmark_icon',
            status: 'attention',
            rawStatus: 'failed',
            title: 'https://bookmark.example.com',
            ownerLabel: '用户乙',
            attempts: 3,
            errorCode: 'ICON_FETCH_FAILED',
            updatedAt: '2026-08-09 10:00:00',
          },
        ];
      }
      return response;
    });
    const mounted = mountPage();
    cleanup = mounted.unmount;
    await vi.waitFor(() => expect(mounted.host.textContent).toContain('功能建议'));

    const jobTab = [...mounted.host.querySelectorAll<HTMLElement>('[role="tab"]')].find((tab) =>
      tab.textContent?.includes('异步任务健康'),
    );
    jobTab!.click();
    await vi.waitFor(() => expect(mounted.host.textContent).toContain('书签图标'));

    const sourceCard = [...mounted.host.querySelectorAll<HTMLElement>('.action-center__source-card')].find((card) =>
      card.textContent?.includes('书签图标'),
    );
    sourceCard!.click();

    await vi.waitFor(() => expect(apiMocks.load).toHaveBeenLastCalledWith({ limit: 60, source: 'bookmark_icon' }));
    await vi.waitFor(() => expect(mounted.host.textContent).toContain('https://bookmark.example.com'));
    expect(sourceCard!.getAttribute('aria-pressed')).toBe('true');
    expect(sourceCard!.textContent).toContain('正在查看');
    expect(mounted.host.textContent).not.toContain('DELIVERY_RESULT_UNKNOWN');
  });
});
