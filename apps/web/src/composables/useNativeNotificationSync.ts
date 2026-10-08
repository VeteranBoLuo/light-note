import { onBeforeUnmount, onMounted, watch, type Ref } from 'vue';
import { apiBasePost } from '@/http/request';
import { hasAndroidBridge } from '@/utils/androidBridge';
import { createNativeNotificationSync, nativeNotificationMessage } from '@/utils/nativeNotificationSync';

export function useNativeNotificationSync(owner: Ref<string | null>, open: () => void) {
  const sync = createNativeNotificationSync({
    bridge: nativeNotificationMessage,
    fetch: async (input) => {
      const response = await apiBasePost('/api/notification/native/sync', input);
      if (response?.status !== 200 || !response.data) throw new Error('NATIVE_NOTIFICATION_SYNC_UNAVAILABLE');
      return response.data;
    },
    open,
  });
  const tick = () => {
    if (hasAndroidBridge() && document.visibilityState === 'visible' && navigator.onLine !== false)
      void sync.tick().catch(() => {
        /* Retry on the next bounded foreground tick. */
      });
  };
  const stop = watch(
    owner,
    (value) => {
      if (!hasAndroidBridge()) return;
      if (value === null) {
        sync.pause();
        return;
      }
      sync.setOwner(value);
      tick();
    },
    { immediate: true, flush: 'sync' },
  );
  let timer: ReturnType<typeof setInterval> | undefined;
  onMounted(() => {
    timer = setInterval(tick, 15000);
    document.addEventListener('visibilitychange', tick);
    window.addEventListener('online', tick);
    window.addEventListener('light-note:native-notification-open', tick);
    tick();
  });
  onBeforeUnmount(() => {
    clearInterval(timer);
    stop();
    document.removeEventListener('visibilitychange', tick);
    window.removeEventListener('online', tick);
    window.removeEventListener('light-note:native-notification-open', tick);
    sync.setOwner('');
  });
}
