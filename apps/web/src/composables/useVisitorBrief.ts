import { ref, watch, onScopeDispose } from 'vue';
import { getVisitorBrief, type VisitorBriefState } from '@/api/dailyBriefApi';
export function useVisitorBrief(input: { enabled: () => boolean; owner: () => string; locale: () => string }) {
  const state = ref<VisitorBriefState | null>(null),
    loading = ref(false),
    failed = ref(false);
  let generation = 0,
    timer: ReturnType<typeof setTimeout> | undefined,
    lastAttemptAt = -Infinity;
  async function refresh() {
    if (!input.enabled() || document.hidden || loading.value) return;
    const request = ++generation;
    lastAttemptAt = Date.now();
    loading.value = true;
    failed.value = false;
    clearTimeout(timer);
    try {
      const response = await getVisitorBrief(input.locale());
      if (request !== generation) return;
      if (response?.status !== 200 || response.data?.kind !== 'visitor_example')
        throw new Error('visitor brief unavailable');
      state.value = response.data;
    } catch {
      if (request === generation) failed.value = true;
    } finally {
      if (request === generation) {
        loading.value = false;
        const boundary = Date.parse(state.value?.nextDateAt || '');
        const delay =
          state.value?.stale || failed.value
            ? 60000
            : Math.max(1000, Number.isFinite(boundary) ? boundary - Date.now() + 1000 : 300000);
        timer = setTimeout(() => void refresh(), Math.min(delay, 2147483647));
      }
    }
  }
  watch(
    () => [input.enabled(), input.owner(), input.locale()],
    () => {
      generation++;
      clearTimeout(timer);
      state.value = null;
      failed.value = false;
      loading.value = false;
      lastAttemptAt = -Infinity;
      void refresh();
    },
    { immediate: true },
  );
  const resume = () => {
    if (!document.hidden && Date.now() - lastAttemptAt >= 60000) void refresh();
  };
  document.addEventListener('visibilitychange', resume);
  window.addEventListener('focus', resume);
  onScopeDispose(() => {
    generation++;
    clearTimeout(timer);
    document.removeEventListener('visibilitychange', resume);
    window.removeEventListener('focus', resume);
  });
  return { state, loading, failed, refresh };
}
