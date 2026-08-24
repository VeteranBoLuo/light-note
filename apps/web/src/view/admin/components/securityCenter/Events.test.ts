import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import { createI18n } from 'vue-i18n';

const apiBasePost = vi.fn();
const messageSuccess = vi.fn();
const messageError = vi.fn();
const routerReplace = vi.fn();
const routerPush = vi.fn();
const routeState = { query: {} as Record<string, string> };

vi.mock('@/http/request', () => ({ apiBasePost }));
vi.mock('@/components/base/BasicComponents/BMessage/BMessage', () => ({
  default: { success: messageSuccess, error: messageError },
}));
vi.mock('@/components/admin/AdminRiskActionModal.vue', () => ({
  default: {
    name: 'AdminRiskActionModalStub',
    props: ['visible', 'defaultReason'],
    emits: ['confirm', 'update:visible'],
    setup(
      props: { visible: boolean; defaultReason: string },
      { emit }: { emit: (event: string, payload: unknown) => void },
    ) {
      return () =>
        props.visible
          ? h(
              'button',
              {
                class: 'risk-confirm',
                'data-default-reason': props.defaultReason,
                onClick: () => emit('confirm', { reason: '已核对事件簇业务上下文', confirmed: true }),
              },
              '提交复核',
            )
          : null;
    },
  },
}));
vi.mock('vue-router', () => ({
  useRoute: () => routeState,
  useRouter: () => ({ replace: routerReplace, push: routerPush }),
}));
vi.mock('./EventDetailDrawer.vue', () => ({
  default: {
    name: 'EventDetailDrawerStub',
    props: ['open', 'eventId'],
    render() {
      return h('div', {
        class: 'event-detail-stub',
        'data-open': String(this.open),
        'data-event-id': this.eventId,
      });
    },
  },
}));

const { default: Events } = await import('./Events.vue');

const reviewItems = [
  {
    representativeEventId: 'event-1',
    lastSeenAt: '2026-08-07 13:47:00',
    confidence: 92,
    maxScore: 55,
    ruleCode: 'ENV_FILE_PROBE',
    requestMethod: 'GET',
    requestPath: '/.env',
    actorLabel: '匿名来源',
    sourceIp: '35.233.10.128',
    hitCount: 2,
    blocked: true,
  },
];

let cleanup: (() => void) | undefined;

function flushPromises() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function findButton(host: HTMLElement, text: string) {
  return Array.from(host.querySelectorAll<HTMLButtonElement>('button')).find(
    (button) => button.textContent?.trim() === text,
  );
}

function mountEvents() {
  const host = document.createElement('div');
  document.body.append(host);
  const app = createApp({ render: () => h(Events) });
  app.use(createI18n({ legacy: false, locale: 'zh-CN', messages: {} }));
  app.mount(host);
  cleanup = () => {
    app.unmount();
    host.remove();
  };
  return host;
}

describe('安全中心事件复核筛选与批量操作', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    routeState.query = {};
    apiBasePost.mockImplementation((url: string) => {
      if (url === '/api/security/v2/review/batch-disposition') {
        return Promise.resolve({
          status: 200,
          data: {
            selectedTotal: 1,
            handledTotal: 2,
            disposition: 'false_positive',
            requestId: 'request-1',
            auditId: 'audit-1',
          },
        });
      }
      return Promise.resolve({
        status: 200,
        data: { items: reviewItems, counts: [{ disposition: 'unknown', total: 1 }] },
      });
    });
  });

  afterEach(() => {
    cleanup?.();
    cleanup = undefined;
  });

  it('编辑筛选条件时不自动请求，点击筛选后提交并反馈结果', async () => {
    const host = mountEvents();
    await flushPromises();
    expect(apiBasePost).toHaveBeenCalledTimes(1);
    expect(host.textContent).toContain('同一规则、接口、主体在 5 分钟内的重复请求合并为一行');
    expect(host.textContent).toContain('35.233.10.128');
    expect(host.textContent).not.toContain('35.233.***.128');

    const input = host.querySelector<HTMLInputElement>('.security-review-search input')!;
    input.value = '.env';
    input.dispatchEvent(new Event('input'));
    await nextTick();
    expect(apiBasePost).toHaveBeenCalledTimes(1);

    findButton(host, '筛选')!.click();
    await flushPromises();
    expect(apiBasePost).toHaveBeenCalledTimes(2);
    expect(apiBasePost.mock.calls[1][1]).toMatchObject({
      filters: { key: '.env', viewMode: 'clusters', confidence: '' },
    });
    expect(messageSuccess).toHaveBeenCalledWith('筛选已应用，共 1 个事件簇');
  });

  it('勾选事件簇后通过事务接口批量标记误报', async () => {
    const host = mountEvents();
    await flushPromises();

    host.querySelector<HTMLElement>('.table-row .b-checkbox')!.click();
    await nextTick();
    expect(host.textContent).toContain('已选择 1 个事件簇');

    findButton(host, '标记误报')!.click();
    await nextTick();
    expect(host.querySelector<HTMLButtonElement>('.risk-confirm')?.dataset.defaultReason).toBe('确认属于误报');
    host.querySelector<HTMLButtonElement>('.risk-confirm')!.click();
    await flushPromises();

    const batchCall = apiBasePost.mock.calls.find(([url]) => url === '/api/security/v2/review/batch-disposition');
    expect(batchCall?.[1]).toMatchObject({
      eventIds: ['event-1'],
      scope: 'clusters',
      disposition: 'false_positive',
      reason: '已核对事件簇业务上下文',
      confirmed: true,
      createTuningSuggestion: true,
    });
    expect(messageSuccess).toHaveBeenCalledWith('已复核 1 个事件簇，共处理 2 条事件');
    expect(host.textContent).toContain('处置回执');
    expect(host.textContent).toContain('审计 audit-1');
  });

  it('四种批量复核结论都预设各自的六字以上原因', async () => {
    const cases = [
      ['良性异常', '确认为良性异常'],
      ['授权测试', '确认为授权测试'],
      ['标记误报', '确认属于误报'],
      ['确认攻击', '确认为真实攻击'],
    ] as const;

    for (const [action, reason] of cases) {
      const host = mountEvents();
      await flushPromises();
      host.querySelector<HTMLElement>('.table-row .b-checkbox')!.click();
      await nextTick();

      findButton(host, action)!.click();
      await nextTick();

      expect(host.querySelector<HTMLButtonElement>('.risk-confirm')?.dataset.defaultReason).toBe(reason);
      cleanup?.();
      cleanup = undefined;
    }
  });

  it('深链打开精确事件，并能返回保留筛选的待处理队列', async () => {
    routeState.query = {
      eventId: 'event-linked-1',
      returnTo: '/admin/actionCenter?section=work&source=security&slaState=overdue',
    };
    const host = mountEvents();
    await flushPromises();

    const drawer = host.querySelector<HTMLElement>('.event-detail-stub')!;
    expect(drawer.dataset.open).toBe('true');
    expect(drawer.dataset.eventId).toBe('event-linked-1');
    findButton(host, '返回待处理中心')!.click();
    expect(routerPush).toHaveBeenCalledWith('/admin/actionCenter?section=work&source=security&slaState=overdue');
  });
});
