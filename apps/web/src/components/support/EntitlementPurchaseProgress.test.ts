import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp, nextTick, reactive } from 'vue';
import { createI18n } from 'vue-i18n';
import zhCN from '@/i18n/locales/zh-CN';
const mocks = vi.hoisted(() => ({ create: vi.fn(), query: vi.fn(), credited: vi.fn() }));
let user = reactive({ id: 'owner', alias: 'Owner', userName: 'owner' });
vi.mock('@/store', () => ({ useUserStore: () => user }));
vi.mock('@/api/supportApi', () => ({ createCheckoutIntent: mocks.create, queryCheckoutIntent: mocks.query }));
vi.mock('@/composables/useAiQuotaStatus', () => ({ formatAiQuotaTokens: (n: number) => String(n) }));
vi.mock('@/components/base/BasicComponents/BModal/BModal.vue', () => ({
  default: {
    props: ['visible'],
    emits: ['update:visible'],
    template:
      '<section v-if="visible"><button class="close" @click="$emit(\'update:visible\', false)">close</button><slot /></section>',
  },
}));
vi.mock('@/components/base/BasicComponents/BButton.vue', () => ({
  default: { template: '<button><slot /></button>' },
}));
vi.mock('@/components/base/BasicComponents/BLoading.vue', () => ({ default: { template: '<span>loading</span>' } }));
import Progress from './EntitlementPurchaseProgress.vue';
let app: ReturnType<typeof createApp>;
let root: HTMLDivElement;
const flush = async () => {
  for (let i = 0; i < 8; i++) await nextTick();
};
function mount() {
  root = document.createElement('div');
  document.body.append(root);
  app = createApp(Progress, { onCredited: mocks.credited });
  app.use(createI18n({ legacy: false, locale: 'zh-CN', messages: { 'zh-CN': zhCN } }));
  return app.mount(root) as unknown as { start: (sku: string, version: string) => Promise<void> };
}
beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  sessionStorage.clear();
  user = reactive({ id: 'owner', alias: 'Owner', userName: 'owner' });
  Object.defineProperty(document, 'hidden', { configurable: true, value: false });
  const params = new URLSearchParams({
    product_type: '1',
    plan_id: 'a'.repeat(32),
    sku: JSON.stringify([{ sku_id: 'b'.repeat(32), count: 1 }]),
    custom_order_id: 'c'.repeat(43),
  });
  mocks.create.mockResolvedValue({ intentId: 'safe-id', url: `https://ifdian.net/order/create?${params}` });
});
afterEach(() => {
  app?.unmount();
  root?.remove();
  vi.useRealTimers();
});
describe('safe checkout recovery', () => {
  it('不会继续打开旧版自选金额页面', async () => {
    mocks.create.mockResolvedValueOnce({ intentId: 'unsafe', url: 'https://afdian.com/a/test' });
    const vm = mount();
    await vm.start('sku', 'v1');
    await flush();
    expect(root.querySelector('[role="alert"]')).toBeTruthy();
    expect(root.textContent).not.toContain('前往爱发电付款');
    expect(mocks.query).not.toHaveBeenCalled();
  });

  it('discards a late credited response after switching accounts and clears recovery state', async () => {
    let resolve!: (v: unknown) => void;
    mocks.query.mockImplementation(
      () =>
        new Promise((r) => {
          resolve = r;
        }),
    );
    const vm = mount();
    await vm.start('sku', 'v1');
    await flush();
    user.id = 'other';
    await flush();
    resolve({ intentId: 'safe-id', status: 'credited', amount: 18, benefit: { aiTokens: 20, storageMb: 0 } });
    await flush();
    expect(mocks.credited).not.toHaveBeenCalled();
    expect(root.textContent).not.toContain('到账');
    expect(sessionStorage.getItem('lightnote:checkout-status:v1')).toBeNull();
  });
  it('stops polling on close and on page hiding, then queries the original intent on reopening', async () => {
    mocks.query.mockResolvedValue({
      intentId: 'safe-id',
      status: 'pending',
      amount: 18,
      benefit: { aiTokens: 20, storageMb: 0 },
    });
    const vm = mount();
    await vm.start('sku', 'v1');
    await flush();
    expect(mocks.query).toHaveBeenCalledTimes(1);
    root.querySelector<HTMLButtonElement>('.close')!.click();
    await flush();
    await vi.advanceTimersByTimeAsync(30000);
    expect(mocks.query).toHaveBeenCalledTimes(1);
    root.querySelector<HTMLButtonElement>('button')!.click();
    await flush();
    expect(mocks.query).toHaveBeenLastCalledWith('safe-id');
    Object.defineProperty(document, 'hidden', { configurable: true, value: true });
    document.dispatchEvent(new Event('visibilitychange'));
    await vi.advanceTimersByTimeAsync(30000);
    expect(mocks.query).toHaveBeenCalledTimes(2);
    expect(mocks.create).toHaveBeenCalledTimes(1);
  });
});
