import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import { createI18n } from 'vue-i18n';

const apiBaseGet = vi.fn();
const apiBasePost = vi.fn();
const messageError = vi.fn();
const routerPush = vi.fn();

vi.mock('@/http/request', () => ({ apiBaseGet, apiBasePost }));
vi.mock('@/components/base/BasicComponents/BMessage/BMessage', () => ({
  default: { error: messageError, success: vi.fn() },
}));
vi.mock('@/components/base/BasicComponents/BModal/Alert', () => ({ default: { alert: vi.fn() } }));
vi.mock('vue-router', () => ({ useRouter: () => ({ push: routerPush }) }));
vi.mock('@/components/base/BasicComponents/BDrawer.vue', () => ({
  default: {
    name: 'BDrawerStub',
    props: ['open'],
    template: '<section v-if="open"><slot /></section>',
  },
}));
vi.mock('@/components/admin/AdminRiskActionModal.vue', () => ({
  default: {
    name: 'AdminRiskActionModalStub',
    props: ['visible'],
    emits: ['confirm', 'update:visible'],
    setup(props: { visible: boolean }, { emit }: { emit: (event: string, payload: unknown) => void }) {
      return () =>
        props.visible
          ? h(
              'button',
              {
                class: 'risk-confirm',
                onClick: () => emit('confirm', { reason: '已核对请求链路与命中证据', confirmed: true }),
              },
              '提交结论',
            )
          : null;
    },
  },
}));

const { default: EventDetailDrawer } = await import('./EventDetailDrawer.vue');

let cleanup: (() => void) | undefined;

function flushPromises() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function findButton(host: HTMLElement, text: string) {
  return Array.from(host.querySelectorAll<HTMLButtonElement>('button')).find((button) =>
    button.textContent?.includes(text),
  );
}

function mountDrawer(props: Record<string, unknown>, onSaved = vi.fn()) {
  const host = document.createElement('div');
  document.body.append(host);
  const app = createApp({
    render: () =>
      h(EventDetailDrawer, {
        open: true,
        eventId: 'event-1',
        ...props,
        onSaved,
      }),
  });
  app.use(createI18n({ legacy: false, locale: 'zh-CN', messages: { 'zh-CN': { common: { loading: '加载中' } } } }));
  app.mount(host);
  cleanup = () => {
    app.unmount();
    host.remove();
  };
  return { host, onSaved };
}

describe('EventDetailDrawer 安全处置边界', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiBaseGet.mockResolvedValue({
      status: 200,
      data: {
        event: {
          eventId: 'event-1',
          matchedRule: 'SSRF_PRIVATE_HOST',
          disposition: 'unknown',
          sourceIp: '127.0.0.1',
          requestMethod: 'POST',
          requestPath: '/chat/generateBookmarkMeta',
        },
        evidence: [],
        similarEvents: [],
        sourceAnalysis: {},
        accountAnalysis: {},
      },
    });
    apiBasePost.mockResolvedValue({
      status: 200,
      data: {
        handledTotal: 2,
        requestId: 'request-1',
        auditId: 'audit-1',
        review: { eventId: 'event-1', disposition: 'confirmed_attack' },
      },
    });
  });

  afterEach(() => {
    cleanup?.();
    cleanup = undefined;
    document.body.innerHTML = '';
  });

  it('桌面端必须填写原因并显式确认，成功后返回权威审计回执', async () => {
    const saved = vi.fn();
    const { host } = mountDrawer({ raw: false }, saved);
    await flushPromises();

    findButton(host, '确认攻击')!.click();
    await nextTick();
    host.querySelector<HTMLButtonElement>('.risk-confirm')!.click();
    await flushPromises();

    expect(apiBasePost).toHaveBeenCalledWith(
      '/api/security/v2/clusters/event-1/disposition',
      {
        disposition: 'confirmed_attack',
        reason: '已核对请求链路与命中证据',
        confirmed: true,
        createTuningSuggestion: false,
      },
      { silent: true },
    );
    expect(saved).toHaveBeenCalledWith(
      expect.objectContaining({
        handledTotal: 2,
        requestId: 'request-1',
        auditId: 'audit-1',
        disposition: 'confirmed_attack',
      }),
    );
  });

  it('移动端只展示证据，不渲染事件处置与来源限制动作', async () => {
    const { host } = mountDrawer({ readOnly: true });
    await flushPromises();

    expect(host.textContent).toContain('移动端仅供复核取证');
    expect(findButton(host, '确认攻击')).toBeUndefined();
    expect(findButton(host, '误报并创建调优建议')).toBeUndefined();
    expect(findButton(host, '临时禁止来源访问轻笺')).toBeUndefined();
    expect(apiBasePost).not.toHaveBeenCalled();
  });
});
