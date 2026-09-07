import { onBeforeUnmount, ref, watch, type MaybeRefOrGetter, toValue } from 'vue';
import { ensureDailyBrief, getDailyBrief, refreshDailyBrief, type DailyBriefState } from '@/api/dailyBriefApi';
import { useForegroundRefresh } from './useForegroundRefresh';

const CHECK_INTERVAL_MS = 5 * 60_000;
const POLL_INTERVAL_MS = 2500;
const MAX_POLL_ATTEMPTS = 72;

/** 页面生命周期只调度检查；生成资格、冷却、账号日预算与幂等均由服务端裁决。 */
export function useDailyBrief(options: {
  eligible: MaybeRefOrGetter<boolean>;
  ownerKey: MaybeRefOrGetter<string>;
  passive?: MaybeRefOrGetter<boolean>;
}) {
  const state = ref<DailyBriefState | null>(null);
  const loading = ref(false);
  const updating = ref(false);
  const errorCode = ref('');
  const confirmedCurrent = ref(false);
  let generation = 0;
  let activeOwner = '';
  let timer: ReturnType<typeof setTimeout> | undefined;
  let inFlight: Promise<void> | null = null;
  let pollAttempts = 0;
  let lastCheckAt = 0;
  let disposed = false;

  const visible = () => document.visibilityState === 'visible';
  const eligible = () => Boolean(toValue(options.eligible)) && !disposed;
  const passive = () => Boolean(options.passive !== undefined && toValue(options.passive));
  function clearTimer() {
    if (timer) clearTimeout(timer);
    timer = undefined;
  }
  function responseState(response: any): DailyBriefState {
    if (response?.status !== 200 || !response?.data)
      throw Object.assign(new Error('Daily brief unavailable'), { code: response?.data?.code });
    return response.data;
  }
  function apply(next: DailyBriefState) {
    const previous = state.value;
    // 跨天与刷新失败保留旧正文，但始终标明其旧日期；关闭功能/换账号不保留。
    const preserve = next.enabled && next.featureEnabled && !next.brief && previous?.brief;
    state.value = preserve
      ? {
          ...next,
          brief: previous.brief,
          generatedAt: previous.generatedAt,
          dataAsOf: previous.dataAsOf,
          stale: true,
          staleFactIds: previous.brief.insights.flatMap((insight) => insight.factIds),
        }
      : next;
  }
  function schedule() {
    clearTimer();
    if (!eligible() || !visible()) return;
    if (passive()) {
      // 管理员预览只轮询已持久化产物，不做事实新鲜度检查，更不会进入生成接口。
      timer = setTimeout(() => void refresh(), CHECK_INTERVAL_MS);
      return;
    }
    if (!state.value?.enabled || !state.value.featureEnabled) return;
    const generating = state.value.status === 'generating';
    let delay = generating ? POLL_INTERVAL_MS : CHECK_INTERVAL_MS;
    for (const raw of [state.value.nextDateAt, state.value.nextRefreshAt]) {
      const remaining = Date.parse(raw || '') - Date.now();
      if (remaining > 0) delay = Math.min(delay, remaining + 1000);
    }
    if (Date.parse(state.value.nextDateAt || '') <= Date.now()) delay = Math.min(delay, 60_000);
    timer = setTimeout(() => {
      void refresh();
    }, delay);
  }
  async function execute(manual: boolean, sequence: number) {
    loading.value = !state.value?.brief;
    updating.value = manual;
    errorCode.value = '';
    confirmedCurrent.value = false;
    clearTimer();
    try {
      // 首屏先读现有产物；生成中的短轮询不重复编译事实。
      let next = responseState(await getDailyBrief());
      if (sequence !== generation) return;
      apply(next);
      if (passive()) {
        pollAttempts = 0;
        return;
      }
      if (!eligible() || !visible() || !next.enabled || !next.featureEnabled) return;
      if (next.status === 'generating') {
        if (++pollAttempts >= MAX_POLL_ATTEMPTS) {
          errorCode.value = 'POLL_TIMEOUT';
          // 退回低频检查；不靠客户端超时擅自开启第二次生成。
          pollAttempts = 0;
          state.value = { ...state.value!, status: 'failed' };
        }
        return;
      }
      pollAttempts = 0;
      if (manual) {
        updating.value = true;
        next = responseState(await refreshDailyBrief());
      } else {
        next = responseState(await getDailyBrief({ check: true }));
        if (sequence !== generation) return;
        apply(next);
        lastCheckAt = Date.now();
        if (next.shouldGenerate && eligible() && visible()) {
          updating.value = true;
          next = responseState(await ensureDailyBrief());
        }
      }
      if (sequence !== generation) return;
      apply(next);
      confirmedCurrent.value = manual && next.status === 'ready' && next.stale === false;
    } catch (error: any) {
      if (sequence !== generation) return;
      errorCode.value = error?.response?.data?.data?.code || error?.code || 'DAILY_BRIEF_UNAVAILABLE';
      // POST 失败后读取持久化的失败/额度状态，下一次被动检查遵循服务端退避。
      if (updating.value) {
        try {
          const next = responseState(await getDailyBrief());
          if (sequence === generation) apply(next);
        } catch {
          /* 保留旧结果与局部错误，不覆盖已知状态。 */
        }
      }
    } finally {
      if (sequence === generation) {
        loading.value = false;
        updating.value = false;
        inFlight = null;
        schedule();
      }
    }
  }
  function refresh(manual = false): Promise<void> {
    if (!eligible() || !visible()) return Promise.resolve();
    if (inFlight) return inFlight;
    inFlight = execute(manual, generation);
    return inFlight;
  }
  function handleVisibility() {
    if (!visible()) clearTimer();
    else {
      void refresh();
    }
  }
  // focus 是未发 visibilitychange 的 WebView 兜底。与显隐和手动请求合并在途读取。
  useForegroundRefresh({
    refresh: () => refresh(),
    staleMs: 1000,
    canRefresh: () => eligible() && Date.now() - lastCheckAt >= 1000,
  });
  document.addEventListener('visibilitychange', handleVisibility);
  watch(
    () => [toValue(options.eligible), toValue(options.ownerKey), passive()] as const,
    ([allowed, owner, isPassive], previous) => {
      if (!allowed || owner !== activeOwner || (previous && previous[2] !== isPassive)) {
        generation += 1;
        clearTimer();
        state.value = null;
        inFlight = null;
        loading.value = false;
        updating.value = false;
        errorCode.value = '';
        confirmedCurrent.value = false;
        pollAttempts = 0;
        activeOwner = owner;
      }
      void refresh();
    },
    { immediate: true },
  );
  onBeforeUnmount(() => {
    disposed = true;
    generation += 1;
    clearTimer();
    document.removeEventListener('visibilitychange', handleVisibility);
  });
  return {
    state,
    loading,
    updating,
    errorCode,
    confirmedCurrent,
    refresh,
    update: () => (passive() ? Promise.resolve() : refresh(true)),
  };
}
