import { onBeforeUnmount, onMounted, ref, shallowRef } from 'vue';

export function useInfraSnapshot<T>(loader: () => Promise<{ data: T }>, intervalMs = 0) {
  const data = shallowRef<T | null>(null);
  const initialLoading = ref(true);
  const refreshing = ref(false);
  const error = ref('');
  const lastLoadedAt = ref(0);
  let timer: number | null = null;
  let pending: Promise<void> | null = null;
  let mounted = false;

  function clearTimer() {
    if (timer !== null) window.clearTimeout(timer);
    timer = null;
  }

  function schedule() {
    clearTimer();
    if (!mounted || intervalMs <= 0 || document.visibilityState !== 'visible') return;
    timer = window.setTimeout(() => void refresh(), intervalMs);
  }

  async function refresh() {
    if (pending) return pending;
    clearTimer();
    refreshing.value = true;
    pending = (async () => {
      try {
        const response = await loader();
        data.value = response.data;
        error.value = '';
        lastLoadedAt.value = Date.now();
      } catch (cause) {
        error.value =
          cause && typeof cause === 'object' && 'message' in cause
            ? String(cause.message || '')
            : 'Snapshot unavailable';
      } finally {
        initialLoading.value = false;
        refreshing.value = false;
        pending = null;
        schedule();
      }
    })();
    return pending;
  }

  function onVisibilityChange() {
    if (document.visibilityState !== 'visible') {
      clearTimer();
      return;
    }
    if (intervalMs > 0 && (!lastLoadedAt.value || Date.now() - lastLoadedAt.value >= intervalMs)) void refresh();
    else schedule();
  }

  onMounted(() => {
    mounted = true;
    document.addEventListener('visibilitychange', onVisibilityChange);
    void refresh();
  });
  onBeforeUnmount(() => {
    mounted = false;
    clearTimer();
    document.removeEventListener('visibilitychange', onVisibilityChange);
  });

  return { data, initialLoading, refreshing, error, lastLoadedAt, refresh };
}
