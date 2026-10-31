import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp, h, reactive, ref } from 'vue';
import { createI18n } from 'vue-i18n';
import zhCN from '@/i18n/locales/zh-CN';
import enUS from '@/i18n/locales/en-US';

const mocks = vi.hoisted(() => ({ getManorAttention: vi.fn() }));
const user = reactive({ id: 'u1', adminContext: null as unknown });
vi.mock('@/api/growthApi.ts', () => ({ getManorAttention: mocks.getManorAttention }));
vi.mock('@/store', () => ({ useUserStore: () => user }));
vi.mock('@/composables/useGrowth.ts', () => ({ useGrowth: () => ({ growth: ref({ features: { manor: true } }) }) }));
vi.mock('@/utils/manorAccess', () => ({ showManorEntry: () => !user.adminContext }));

const { refreshManorAttention, useManorAttention } = await import('./useManorAttention');
const value = (overrides = {}) => ({ fresh: false, water: 0, ripe: 0, rewards: 0, perTask: 5, bonus: 5, ...overrides });

function mountComposable() {
  let result!: ReturnType<typeof useManorAttention>;
  const app = createApp({ setup: () => { result = useManorAttention(); return () => h('span'); } });
  app.use(createI18n({ legacy: false, locale: 'zh-CN', messages: { 'zh-CN': zhCN, 'en-US': enUS } }));
  app.mount(document.createElement('div'));
  return { result, unmount: () => app.unmount() };
}

describe('庄园入口提醒', () => {
  let unmount = () => {};
  beforeEach(() => {
    vi.useFakeTimers();
    user.id = 'u1';
    user.adminContext = null;
    mocks.getManorAttention.mockReset();
  });
  afterEach(() => {
    unmount();
    vi.useRealTimers();
  });

  it('按新开放、水滴、收获、等级礼物给出提醒原因', async () => {
    const mounted = mountComposable();
    unmount = mounted.unmount;
    mocks.getManorAttention.mockResolvedValue({ status: 200, data: value({ water: 15, ripe: 2, rewards: 1 }) });
    await refreshManorAttention(true);
    expect(mounted.result.entryLabel.value).toBe('知识庄园 · 15 滴水可领 · 2 块地可收获 · 有等级奖励可领');
    mocks.getManorAttention.mockResolvedValue({ status: 200, data: value({ fresh: true }) });
    await refreshManorAttention(true);
    expect(mounted.result.reasons.value).toEqual(['新开放，去看看']);
    mocks.getManorAttention.mockResolvedValue({ status: 200, data: value() });
    await refreshManorAttention(true);
    expect(mounted.result.reasons.value).toEqual([]);
    expect(mounted.result.entryLabel.value).toBe('知识庄园');
  });

  it('一分钟内切页面不重复请求，离开庄园等强制刷新照常请求', async () => {
    const mounted = mountComposable();
    unmount = mounted.unmount;
    mocks.getManorAttention.mockResolvedValue({ status: 200, data: value({ water: 5 }) });
    await refreshManorAttention(true);
    await refreshManorAttention();
    expect(mocks.getManorAttention).toHaveBeenCalledTimes(1);
    await refreshManorAttention(true);
    expect(mocks.getManorAttention).toHaveBeenCalledTimes(2);
    vi.advanceTimersByTime(61_000);
    await refreshManorAttention();
    expect(mocks.getManorAttention).toHaveBeenCalledTimes(3);
  });

  it('切换账号后旧账号的提醒立即失效，迟到的旧响应不会覆盖新账号', async () => {
    const mounted = mountComposable();
    unmount = mounted.unmount;
    let resolveOld!: (v: unknown) => void;
    mocks.getManorAttention.mockReturnValueOnce(new Promise((resolve) => { resolveOld = resolve; }));
    const pending = refreshManorAttention(true);
    user.id = 'u2';
    mocks.getManorAttention.mockResolvedValueOnce({ status: 200, data: value({ ripe: 1 }) });
    await refreshManorAttention(true);
    resolveOld({ status: 200, data: value({ water: 20 }) });
    await pending;
    expect(mounted.result.attention.value).toMatchObject({ ripe: 1, water: 0 });
  });

  it('网络失败保留旧值，服务端拒绝时清空；管理员代管时每日任务卡拿不到提醒', async () => {
    const mounted = mountComposable();
    unmount = mounted.unmount;
    mocks.getManorAttention.mockResolvedValue({ status: 200, data: value({ water: 5 }) });
    await refreshManorAttention(true);
    mocks.getManorAttention.mockRejectedValueOnce(new Error('offline'));
    await refreshManorAttention(true);
    expect(mounted.result.attention.value?.water).toBe(5);
    user.adminContext = { targetUserId: 'x' };
    expect(mounted.result.visibleAttention.value).toBeNull();
    user.adminContext = null;
    mocks.getManorAttention.mockResolvedValueOnce({ status: 503, data: { code: 'MANOR_UNAVAILABLE' } });
    await refreshManorAttention(true);
    expect(mounted.result.attention.value).toBeNull();
  });
});
