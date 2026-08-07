import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import { createI18n } from 'vue-i18n';

const apiBasePost = vi.fn();
const messageSuccess = vi.fn();
const messageError = vi.fn();
const alert = vi.fn();
const routerReplace = vi.fn();

vi.mock('@/http/request', () => ({ apiBasePost }));
vi.mock('@/components/base/BasicComponents/BMessage/BMessage', () => ({
  default: { success: messageSuccess, error: messageError },
}));
vi.mock('@/components/base/BasicComponents/BModal/Alert', () => ({ default: { alert } }));
vi.mock('vue-router', () => ({
  useRoute: () => ({ query: {} }),
  useRouter: () => ({ replace: routerReplace, push: vi.fn() }),
}));
vi.mock('./EventDetailDrawer.vue', () => ({
  default: { name: 'EventDetailDrawerStub', render: () => h('div') },
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
    apiBasePost.mockImplementation((url: string) => {
      if (url === '/api/security/v2/review/batch-disposition') {
        return Promise.resolve({ status: 200, data: { selectedTotal: 1, handledTotal: 2 } });
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
    expect(alert).toHaveBeenCalledTimes(1);
    await alert.mock.calls[0][0].onOk();
    await flushPromises();

    const batchCall = apiBasePost.mock.calls.find(
      ([url]) => url === '/api/security/v2/review/batch-disposition',
    );
    expect(batchCall?.[1]).toMatchObject({
      eventIds: ['event-1'],
      scope: 'clusters',
      disposition: 'false_positive',
      createTuningSuggestion: true,
    });
    expect(messageSuccess).toHaveBeenCalledWith('已复核 1 个事件簇，共处理 2 条事件');
  });
});
