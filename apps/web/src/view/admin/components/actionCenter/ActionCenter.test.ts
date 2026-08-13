import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import { createI18n } from 'vue-i18n';
import zhCN from '@/i18n/locales/zh-CN';

const apiMocks = vi.hoisted(() => ({
  load: vi.fn(),
  retry: vi.fn(),
  dismiss: vi.fn(),
  todoDiagnostic: vi.fn(),
  filePreviewDiagnostic: vi.fn(),
}));
const routerMocks = vi.hoisted(() => ({
  push: vi.fn(),
  currentRoute: { value: { path: '/admin/actionCenter', query: {} as Record<string, string> } },
}));
const messageMocks = vi.hoisted(() => ({ error: vi.fn(), warning: vi.fn(), success: vi.fn() }));

vi.mock('@/api/commonApi', () => ({
  getAdminActionCenter: apiMocks.load,
  getAdminFilePreviewDiagnostic: apiMocks.filePreviewDiagnostic,
  getAdminTodoReminderDiagnostic: apiMocks.todoDiagnostic,
  retryAdminAsyncJob: apiMocks.retry,
  dismissAdminAsyncJob: apiMocks.dismiss,
}));
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
      sla: {
        policyVersion: '2026-08-12.1',
        overdue: 1,
        dueSoon: 1,
        oldestAgeMinutes: 180,
        returnedCount: 3,
        unavailableCount: 0,
        sampled: true,
      },
      work: {
        total: 2,
        critical: 1,
        sources: [
          { source: 'opinion', count: 1, critical: 0, overdue: 0 },
          { source: 'security', count: 1, critical: 1, overdue: 1 },
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
            ownerTeam: '用户服务',
            slaState: 'due_soon',
            dueAt: '2026-08-12T05:00:00.000Z',
          },
        ],
      },
      jobs: {
        attention: 1,
        running: 0,
        waiting: 1,
        completed24h: 4,
        sources: [
          {
            source: 'bookmark_icon',
            total: 30,
            attention: 30,
            running: 0,
            waiting: 0,
            completed24h: 0,
            overdue: 1,
          },
          {
            source: 'email_delivery',
            total: 2,
            attention: 1,
            running: 0,
            waiting: 0,
            completed24h: 4,
            overdue: 1,
          },
          {
            source: 'todo_reminder',
            total: 5,
            attention: 0,
            running: 0,
            waiting: 5,
            completed24h: 0,
            overdue: 0,
          },
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
            ownerTeam: '通知服务',
            slaState: 'overdue',
            dueAt: '2026-08-09T12:00:00.000Z',
            overdueMinutes: 180,
          },
          {
            id: 'todo-job-1',
            source: 'todo_reminder',
            status: 'waiting',
            rawStatus: 'pending',
            title: '点外卖',
            ownerLabel: '菠萝',
            attempts: 0,
            groupCount: 5,
            scheduledAt: '2026-08-12T03:10:00Z',
            scheduledAtUtc: '2026-08-12T03:10:00Z',
            updatedAt: '2026-08-12T02:43:25Z',
            ownerTeam: '待办与通知服务',
            slaState: 'within_sla',
            dueAt: '2026-08-12T03:20:00Z',
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
    routerMocks.currentRoute.value = { path: '/admin/actionCenter', query: {} };
    apiMocks.load.mockResolvedValue(payload());
    apiMocks.retry.mockResolvedValue({ status: 200, data: { status: 'queued' } });
    apiMocks.dismiss.mockResolvedValue({ status: 200, data: { status: 'cancelled' } });
    apiMocks.todoDiagnostic.mockResolvedValue({
      status: 200,
      data: {
        todo: { id: 'todo-1', title: '点外卖', ownerLabel: '菠萝' },
        job: {
          id: 'todo-job-1',
          todoId: 'todo-1',
          status: 'pending',
          health: 'waiting',
          channel: 'in_app',
          attempts: 0,
          scheduledAtUtc: '2026-08-12T03:10:00Z',
          timezone: 'Asia/Shanghai',
        },
        rule: {
          id: 'rule-1',
          mode: 'single_schedule',
          schedule: {
            mode: 'repeat',
            repeat: { kind: 'weekly', weekdays: [1, 2, 3, 4, 5], localTime: '11:10' },
          },
        },
        relatedJobs: [
          {
            id: 'todo-job-1',
            todoId: 'todo-1',
            status: 'pending',
            health: 'waiting',
            channel: 'in_app',
            attempts: 0,
            scheduledAtUtc: '2026-08-12T03:10:00Z',
          },
        ],
      },
    });
    apiMocks.filePreviewDiagnostic.mockResolvedValue({
      status: 200,
      data: {
        file: { id: '88', name: '5880线缆选型.xls', size: 2048, ownerLabel: '123' },
        job: {
          id: '7',
          status: 'failed',
          health: 'attention',
          attentionReason: 'processing_failed',
          attempts: 3,
          availableAt: '2026-08-10 16:24:37',
          errorCode: 'OFFICE_CONVERSION_FAILED',
          updatedAt: '2026-08-10 16:24:48',
        },
        artifact: {
          id: '19',
          status: 'failed',
          strategy: 'converted_pdf',
          strategyVersion: 1,
          formatId: 'xls',
          sourceSize: 2048,
          artifactSize: 0,
          entryCount: 0,
          totalUncompressedSize: 0,
          containsEncrypted: false,
          suspiciousExpansion: false,
        },
      },
    });
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
    expect(routerMocks.push).toHaveBeenCalledWith({
      path: '/admin/userOpinion',
      query: {
        opinionId: 'opinion-1',
        returnTo: '/admin/actionCenter?section=work',
      },
    });
    expect(mounted.host.textContent).toContain('即将到期');
    expect(mounted.host.textContent).toContain('负责团队：用户服务');
  });

  it('移动端进入反馈时使用手机路由并携带当前待处理筛选', async () => {
    routerMocks.currentRoute.value = {
      path: '/actionCenter',
      query: { section: 'work', source: 'opinion', slaState: 'due_soon', keyword: '功能' },
    };
    const mounted = mountPage();
    cleanup = mounted.unmount;
    await vi.waitFor(() => expect(mounted.host.textContent).toContain('功能建议'));

    mounted.host.querySelector<HTMLButtonElement>('.action-center__item button')!.click();
    expect(routerMocks.push).toHaveBeenCalledWith({
      path: '/userOpinion',
      query: {
        opinionId: 'opinion-1',
        returnTo: '/actionCenter?section=work&source=opinion&slaState=due_soon&keyword=%E5%8A%9F%E8%83%BD',
      },
    });
    expect(apiMocks.load).toHaveBeenCalledWith(
      expect.objectContaining({ section: 'work', source: 'opinion', slaState: 'due_soon', keyword: '功能' }),
    );
  });

  it.each([
    {
      path: '/admin/actionCenter',
      targetPath: '/securityCenter/review',
      extraQuery: {},
      returnTo: '/admin/actionCenter?section=work&source=security&slaState=overdue',
    },
    {
      path: '/actionCenter',
      targetPath: '/securityCenterMobile',
      extraQuery: { tab: 'review' },
      returnTo: '/actionCenter?section=work&source=security&slaState=overdue',
    },
  ])('从 $path 精确定位安全事件并携带返回队列上下文', async ({ path, targetPath, extraQuery, returnTo }) => {
    routerMocks.currentRoute.value = {
      path,
      query: { section: 'work', source: 'security', slaState: 'overdue' },
    };
    const response: any = payload();
    response.data.work.items = [
      {
        id: 'security-event-1',
        source: 'security',
        status: 'pending',
        severity: 'critical',
        title: 'SSRF_PRIVATE_HOST',
        ownerLabel: '/chat/generateBookmarkMeta',
        updatedAt: '2026-08-12 12:00:00',
        targetUrl: '/securityCenter/review?eventId=security-event-1',
        ownerTeam: '安全治理',
        slaState: 'overdue',
      },
    ];
    apiMocks.load.mockResolvedValue(response);
    const mounted = mountPage();
    cleanup = mounted.unmount;
    await vi.waitFor(() => expect(mounted.host.textContent).toContain('SSRF_PRIVATE_HOST'));

    mounted.host.querySelector<HTMLButtonElement>('.action-center__item button')!.click();
    expect(routerMocks.push).toHaveBeenCalledWith({
      path: targetPath,
      query: {
        ...extraQuery,
        eventId: 'security-event-1',
        returnTo,
      },
    });
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

  it('切换分区时两个 Tab 保留各自的全局数量，不被当前分区空结果覆盖', async () => {
    apiMocks.load.mockImplementation(async (params?: { section?: string }) => {
      const response: any = payload();
      if (params?.section === 'work') {
        response.data.jobs = { attention: 0, running: 0, waiting: 0, completed24h: 0, sources: [], items: [] };
      }
      if (params?.section === 'jobs') {
        response.data.work = { total: 0, critical: 0, sources: [], items: [] };
      }
      return response;
    });
    const mounted = mountPage();
    cleanup = mounted.unmount;
    await vi.waitFor(() => expect(mounted.host.textContent).toContain('功能建议'));

    const tabs = [...mounted.host.querySelectorAll<HTMLElement>('[role="tab"]')];
    const workTab = tabs.find((tab) => tab.textContent?.includes('人工待处理'))!;
    const jobTab = tabs.find((tab) => tab.textContent?.includes('异步任务健康'))!;
    expect(workTab.textContent).toContain('2');
    expect(jobTab.textContent).toContain('1');
    expect(apiMocks.load).toHaveBeenLastCalledWith(expect.objectContaining({ section: 'all', source: 'all' }));

    jobTab.click();
    await vi.waitFor(() => expect(mounted.host.textContent).toContain('DELIVERY_RESULT_UNKNOWN'));
    expect(workTab.textContent).toContain('2');
    expect(jobTab.textContent).toContain('1');
  });

  it('待办提醒固定显示北京时间，并在当前 Job 上打开上下文诊断', async () => {
    const mounted = mountPage();
    cleanup = mounted.unmount;
    await vi.waitFor(() => expect(mounted.host.textContent).toContain('功能建议'));

    const jobTab = [...mounted.host.querySelectorAll<HTMLElement>('[role="tab"]')].find((tab) =>
      tab.textContent?.includes('异步任务健康'),
    );
    jobTab!.click();
    await vi.waitFor(() => expect(mounted.host.textContent).toContain('点外卖'));

    expect(mounted.host.textContent).toContain('11:10');
    expect(mounted.host.textContent).toContain('北京时间');
    const card = [...mounted.host.querySelectorAll<HTMLElement>('.action-center__item')].find((item) =>
      item.textContent?.includes('点外卖'),
    );
    card!.querySelector<HTMLButtonElement>('button')!.click();

    await vi.waitFor(() => expect(apiMocks.todoDiagnostic).toHaveBeenCalledWith({ id: 'todo-job-1' }));
    await vi.waitFor(() => expect(document.body.textContent).toContain('待办提醒诊断'));
    expect(document.body.textContent).toContain('每周 周一、周二、周三、周四、周五 11:10 提醒');
    expect(document.body.textContent).not.toContain('上海时间');
    expect(routerMocks.push).not.toHaveBeenCalledWith('/admin/todoPlanDiagnostics');
  });

  it('文件预览任务打开真实任务诊断，不再跳到无关的 API 日志搜索', async () => {
    const response: any = payload();
    response.data.jobs.items = [
      {
        id: '7',
        source: 'file_preview',
        status: 'attention',
        rawStatus: 'failed',
        title: '5880线缆选型.xls',
        ownerLabel: '123',
        attempts: 3,
        errorCode: 'OFFICE_CONVERSION_FAILED',
        updatedAt: '2026-08-10 16:24:48',
        ownerTeam: '文件预览服务',
        slaState: 'overdue',
      },
    ];
    apiMocks.load.mockResolvedValue(response);
    const mounted = mountPage();
    cleanup = mounted.unmount;
    await vi.waitFor(() => expect(mounted.host.textContent).toContain('功能建议'));

    const jobTab = [...mounted.host.querySelectorAll<HTMLElement>('[role="tab"]')].find((tab) =>
      tab.textContent?.includes('异步任务健康'),
    );
    jobTab!.click();
    await vi.waitFor(() => expect(mounted.host.textContent).toContain('5880线缆选型.xls'));

    const card = [...mounted.host.querySelectorAll<HTMLElement>('.action-center__item')].find((item) =>
      item.textContent?.includes('5880线缆选型.xls'),
    );
    card!.querySelector<HTMLButtonElement>('button')!.click();

    await vi.waitFor(() => expect(apiMocks.filePreviewDiagnostic).toHaveBeenCalledWith({ id: '7' }));
    await vi.waitFor(() => expect(document.body.textContent).toContain('文件预览任务诊断'));
    expect(document.body.textContent).toContain('OFFICE_CONVERSION_FAILED');
    expect(document.body.textContent).toContain('Office 转 PDF 预览');
    expect(routerMocks.push).not.toHaveBeenCalledWith(expect.stringContaining('/admin/apiLog'));
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
            ownerTeam: '书签服务',
            slaState: 'overdue',
            overdueMinutes: 120,
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

    await vi.waitFor(() =>
      expect(apiMocks.load).toHaveBeenLastCalledWith({
        limit: 60,
        section: 'jobs',
        source: 'bookmark_icon',
        status: 'all',
        slaState: 'all',
        keyword: '',
      }),
    );
    await vi.waitFor(() => expect(mounted.host.textContent).toContain('https://bookmark.example.com'));
    expect(sourceCard!.getAttribute('aria-pressed')).toBe('true');
    expect(sourceCard!.textContent).toContain('正在查看');
    expect(mounted.host.textContent).not.toContain('DELIVERY_RESULT_UNKNOWN');
  });

  it('可以全选当前可重试任务并用一次原因批量安全重试', async () => {
    const response: any = payload();
    response.data.jobs.items = [
      {
        id: 'bookmark-job-1',
        source: 'bookmark_icon',
        status: 'attention',
        rawStatus: 'failed',
        title: 'https://one.example.com',
        canRetry: true,
        attempts: 3,
        updatedAt: '2026-08-09 10:00:00',
        slaState: 'overdue',
      },
      {
        id: 'bookmark-job-2',
        source: 'bookmark_icon',
        status: 'attention',
        rawStatus: 'failed',
        title: 'https://two.example.com',
        canRetry: true,
        attempts: 2,
        updatedAt: '2026-08-09 10:01:00',
        slaState: 'overdue',
      },
    ];
    apiMocks.load.mockResolvedValue(response);
    const mounted = mountPage();
    cleanup = mounted.unmount;
    await vi.waitFor(() => expect(mounted.host.textContent).toContain('功能建议'));

    const jobTab = [...mounted.host.querySelectorAll<HTMLElement>('[role="tab"]')].find((tab) =>
      tab.textContent?.includes('异步任务健康'),
    );
    jobTab!.click();
    await vi.waitFor(() => expect(mounted.host.textContent).toContain('https://one.example.com'));

    mounted.host.querySelector<HTMLElement>('.action-center__batch [role="checkbox"]')!.click();
    await vi.waitFor(() => expect(mounted.host.textContent).toContain('已选 2 项'));
    const retrySelected = [...mounted.host.querySelectorAll<HTMLButtonElement>('.action-center__batch button')].find(
      (button) => button.textContent?.includes('批量安全重试'),
    );
    retrySelected!.click();
    await vi.waitFor(() => expect(document.body.textContent).toContain('将所选 2 项任务'));

    const reason = document.body.querySelector<HTMLTextAreaElement>('.action-center__retry-reason textarea')!;
    reason.value = '批量重试已确认失败的图标任务';
    reason.dispatchEvent(new Event('input', { bubbles: true }));
    const confirm = [...document.body.querySelectorAll<HTMLButtonElement>('button')].find((button) =>
      button.textContent?.includes('确认安全重试'),
    );
    confirm!.click();

    await vi.waitFor(() => expect(apiMocks.retry).toHaveBeenCalledTimes(2));
    expect(apiMocks.retry).toHaveBeenCalledWith(
      expect.objectContaining({ source: 'bookmark_icon', reason: '批量重试已确认失败的图标任务' }),
    );
    await vi.waitFor(() => expect(messageMocks.success).toHaveBeenCalledWith('已将 2 项任务安全放回原队列'));
  });
});
