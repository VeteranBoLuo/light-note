import { onScopeDispose, watch } from 'vue';
import { holdForegroundActivity } from '@/http/requestActivity';

/** A view's real loading lifetime, including close/error/source replacement. */
export function useForegroundLoading(loading: () => boolean) {
  let release: (() => void) | undefined;
  const stop = watch(
    loading,
    (active) => {
      if (active && !release) release = holdForegroundActivity();
      else if (!active) {
        release?.();
        release = undefined;
      }
    },
    { immediate: true, flush: 'sync' },
  );
  onScopeDispose(() => {
    stop();
    release?.();
    release = undefined;
  });
}
