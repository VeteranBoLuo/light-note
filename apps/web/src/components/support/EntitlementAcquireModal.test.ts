import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp, nextTick } from 'vue';
import { createI18n } from 'vue-i18n';
import zhCN from '@/i18n/locales/zh-CN';

const mocks = vi.hoisted(() => ({
  push: vi.fn(() => Promise.resolve()),
  closeCurrentMobileOverlayThen: vi.fn(async (close: () => void, next: () => unknown) => {
    close();
    return next();
  }),
}));

vi.mock('vue-router', async (importOriginal) => {
  const original = await importOriginal<typeof import('vue-router')>();
  return { ...original, useRouter: () => ({ push: mocks.push }) };
});

vi.mock('@/components/base/BasicComponents/BModal/BModal.vue', () => ({
  default: { name: 'BModalStub', template: '<div class="modal-stub"><slot /></div>' },
}));

vi.mock('@/components/base/SvgIcon/src/SvgIcon.vue', () => ({
  default: { name: 'SvgIconStub', template: '<i />' },
}));

vi.mock('@/utils/mobileOverlayHistory', () => ({
  closeCurrentMobileOverlayThen: mocks.closeCurrentMobileOverlayThen,
}));

import EntitlementAcquireModal from './EntitlementAcquireModal.vue';

let app: ReturnType<typeof createApp> | null = null;
let host: HTMLElement | null = null;

async function mount(asset: 'ai' | 'storage') {
  host = document.createElement('div');
  document.body.append(host);
  app = createApp(EntitlementAcquireModal, { asset, visible: true });
  app.use(
    createI18n({
      legacy: false,
      locale: 'zh-CN',
      messages: { 'zh-CN': zhCN },
    }),
  );
  app.mount(host);
  await nextTick();
  return host.querySelectorAll<HTMLButtonElement>('.entitlement-acquire__option');
}

afterEach(() => {
  app?.unmount();
  host?.remove();
  app = null;
  host = null;
  mocks.push.mockClear();
  mocks.closeCurrentMobileOverlayThen.mockClear();
});

describe('永久权益统一获取入口', () => {
  it('AI 额度分别深链积分商城 AI 商品和赞助 AI 套餐', async () => {
    const actions = await mount('ai');
    actions[0]?.click();
    actions[1]?.click();
    expect(mocks.push).toHaveBeenNthCalledWith(1, {
      path: '/growth',
      query: { section: 'rewards', reward: 'shop', focus: 'ai' },
    });
    expect(mocks.push).toHaveBeenNthCalledWith(2, { path: '/store', query: { category: 'ai' } });
    expect(mocks.closeCurrentMobileOverlayThen).toHaveBeenCalledTimes(2);
  });

  it('云空间分别深链积分商城空间商品和赞助空间套餐', async () => {
    const actions = await mount('storage');
    actions[0]?.click();
    actions[1]?.click();
    expect(mocks.push).toHaveBeenNthCalledWith(1, {
      path: '/growth',
      query: { section: 'rewards', reward: 'shop', focus: 'storage' },
    });
    expect(mocks.push).toHaveBeenNthCalledWith(2, { path: '/store', query: { category: 'storage' } });
  });
});
