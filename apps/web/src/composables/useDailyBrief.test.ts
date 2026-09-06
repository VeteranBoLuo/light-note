import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp, h, nextTick, ref } from 'vue';
import { useDailyBrief } from './useDailyBrief';
import { getDailyBrief, ensureDailyBrief, refreshDailyBrief, type DailyBriefState } from '@/api/dailyBriefApi';

vi.mock('@/api/dailyBriefApi', () => ({
  getDailyBrief: vi.fn(),
  ensureDailyBrief: vi.fn(),
  refreshDailyBrief: vi.fn(),
}));
const get = vi.mocked(getDailyBrief);
const ensure = vi.mocked(ensureDailyBrief);
const manual = vi.mocked(refreshDailyBrief);
const ok = (data: DailyBriefState) => ({ status: 200, data }) as any;
const initial = (): DailyBriefState => ({
  featureEnabled: true,
  enabled: true,
  autoUpdate: true,
  date: '2026-09-05',
  nextDateAt: '2026-09-05T16:00:00Z',
  status: 'ready',
  generatedAt: '2026-09-05T02:00:00Z',
  lastErrorCode: null,
  stale: false,
  shouldGenerate: false,
  dataAsOf: '2026-09-05T02:00:00Z',
  brief: {
    version: 2,
    date: '2026-09-05',
    generatedBy: 'ai',
    headline: '上一版',
    insights: [{ id: '1', factIds: ['todo_due_today'], text: '当前待办' }],
    recommendation: '当前建议',
  },
});
let dispose: (() => void) | undefined;
function mount() {
  const ownerKey = ref('user-1');
  const eligible = ref(true);
  let model!: ReturnType<typeof useDailyBrief>;
  const app = createApp({
    setup() {
      model = useDailyBrief({ ownerKey, eligible });
      return () => h('div');
    },
  });
  const host = document.createElement('div');
  document.body.append(host);
  app.mount(host);
  dispose = () => {
    app.unmount();
    host.remove();
  };
  return { model, ownerKey, eligible };
}
async function settle() {
  for (let n = 0; n < 15; n++) await Promise.resolve();
  await nextTick();
}
function visibility(value: string) {
  Object.defineProperty(document, 'visibilityState', { configurable: true, value });
  document.dispatchEvent(new Event('visibilitychange'));
}
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-09-05T02:00:00Z'));
  vi.resetAllMocks();
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
  get.mockResolvedValue(ok(initial()));
  ensure.mockResolvedValue(ok(initial()));
  manual.mockResolvedValue(ok(initial()));
});
afterEach(() => {
  dispose?.();
  dispose = undefined;
  vi.useRealTimers();
});

describe('今日简报前台调度', () => {
  it('先展示已有简报，再检查新鲜度；没有变化不调用模型入口', async () => {
    const { model } = mount();
    await settle();
    expect(get.mock.calls).toEqual([[], [{ check: true }]]);
    expect(model.state.value?.brief?.headline).toBe('上一版');
    expect(ensure).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(5 * 60_000);
    expect(get).toHaveBeenCalledTimes(4);
    expect(ensure).not.toHaveBeenCalled();
  });

  it('首次缺失或服务端明确允许更新时才 ensure，完成后停止短轮询', async () => {
    get.mockResolvedValue(ok({ ...initial(), status: 'not_generated', brief: null, shouldGenerate: true }));
    const { model } = mount();
    await settle();
    expect(ensure).toHaveBeenCalledTimes(1);
    expect(model.state.value?.status).toBe('ready');
    await vi.advanceTimersByTimeAsync(2500);
    expect(get).toHaveBeenCalledTimes(2);
  });

  it('后台不检查也不生成，恢复前台补查；生成中的轮询同样暂停', async () => {
    get.mockResolvedValue(ok({ ...initial(), status: 'generating' }));
    mount();
    await settle();
    expect(get).toHaveBeenCalledTimes(1);
    visibility('hidden');
    await vi.advanceTimersByTimeAsync(60 * 60_000);
    expect(get).toHaveBeenCalledTimes(1);
    visibility('visible');
    await settle();
    expect(get).toHaveBeenCalledTimes(2);
    expect(ensure).not.toHaveBeenCalled();
  });

  it('检查请求期间切到后台，不会根据迟到响应开始生成', async () => {
    let resolve!: (value: any) => void;
    get.mockResolvedValueOnce(ok(initial())).mockReturnValueOnce(
      new Promise((done) => {
        resolve = done;
      }) as any,
    );
    mount();
    await settle();
    visibility('hidden');
    resolve(ok({ ...initial(), shouldGenerate: true, stale: true }));
    await settle();
    expect(ensure).not.toHaveBeenCalled();
  });

  it('跨日保持旧内容，按服务端日边界补查而不等待页面重挂载', async () => {
    get.mockResolvedValue(ok({ ...initial(), nextDateAt: '2026-09-05T02:00:10Z' }));
    const { model } = mount();
    await settle();
    get.mockResolvedValue(
      ok({ ...initial(), date: '2026-09-06', brief: null, status: 'not_generated', shouldGenerate: false }),
    );
    await vi.advanceTimersByTimeAsync(11_000);
    expect(model.state.value).toMatchObject({
      date: '2026-09-06',
      stale: true,
      brief: { date: '2026-09-05', headline: '上一版' },
    });
  });

  it('服务端冷却结束后补查；关自动时不 ensure，仍允许手动更新', async () => {
    get.mockResolvedValue(
      ok({
        ...initial(),
        stale: true,
        autoUpdate: false,
        pauseReason: 'manual',
        nextRefreshAt: '2026-09-05T02:01:00Z',
      }),
    );
    const { model } = mount();
    await settle();
    await vi.advanceTimersByTimeAsync(61_000);
    expect(get).toHaveBeenCalledTimes(4);
    expect(ensure).not.toHaveBeenCalled();
    await model.update();
    expect(manual).toHaveBeenCalledTimes(1);
  });

  it('更新与检查合并在途请求，失败读回额度暂停状态并保留上一版', async () => {
    const { model } = mount();
    await settle();
    manual.mockRejectedValueOnce(Object.assign(new Error('quota'), { code: 'AI_QUOTA_EXCEEDED' }));
    get.mockResolvedValue(
      ok({ ...initial(), status: 'failed', pauseReason: 'quota', lastErrorCode: 'AI_QUOTA_EXCEEDED' }),
    );
    await Promise.all([model.update(), model.update(), model.refresh()]);
    expect(manual).toHaveBeenCalledTimes(1);
    expect(model.state.value).toMatchObject({ pauseReason: 'quota', brief: { headline: '上一版' } });
  });

  it('手动检查无变化时明确反馈已最新，后台检查与过期结果不冒充已最新', async () => {
    const { model } = mount();
    await settle();
    expect(model.confirmedCurrent.value).toBe(false);
    await model.update();
    expect(model.confirmedCurrent.value).toBe(true);
    manual.mockResolvedValueOnce(ok({ ...initial(), stale: true }));
    await model.update();
    expect(model.confirmedCurrent.value).toBe(false);
  });

  it('切账号丢弃旧响应，组件卸载后不再请求', async () => {
    let resolve!: (value: any) => void;
    get.mockReturnValueOnce(
      new Promise((done) => {
        resolve = done;
      }) as any,
    );
    const { model, ownerKey } = mount();
    ownerKey.value = 'user-2';
    get.mockResolvedValue(ok({ ...initial(), brief: { ...initial().brief!, headline: '新账号' } }));
    await settle();
    resolve(ok(initial()));
    await settle();
    expect(model.state.value?.brief?.headline).toBe('新账号');
    dispose?.();
    dispose = undefined;
    const calls = get.mock.calls.length;
    await vi.advanceTimersByTimeAsync(60 * 60_000);
    expect(get).toHaveBeenCalledTimes(calls);
  });
});
