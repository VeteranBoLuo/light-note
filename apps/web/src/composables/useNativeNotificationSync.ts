import { onBeforeUnmount, onMounted, watch, type Ref } from 'vue';
import { apiBasePost } from '@/http/request';
import { hasAndroidBridge } from '@/utils/androidBridge';
import { createNativeNotificationSync, nativeNotificationMessage } from '@/utils/nativeNotificationSync';
import { useNotification } from './useNotification';

export function useNativeNotificationSync(owner: Ref<string | null>, open: () => void) {
  const { refreshUnread } = useNotification();
  const sync = createNativeNotificationSync({
    bridge: nativeNotificationMessage,
    fetch: async (input) => {
      const response = await apiBasePost('/api/notification/native/sync', input);
      if (response?.status !== 200 || !response.data) throw new Error('NATIVE_NOTIFICATION_SYNC_UNAVAILABLE');
      return response.data;
    },
    remote: {
      bind: async (deviceToken) => {
        const response = await apiBasePost(
          '/api/notification/huawei/subscribe',
          { deviceToken },
          { silent: true, timeout: 5000 },
        );
        if (response?.status !== 200 || !response.data)
          throw Object.assign(new Error('HUAWEI_PUSH_UNAVAILABLE'), { invalidToken: response?.status === 410 });
        return response.data;
      },
      activate: async (binding) => {
        const response = await apiBasePost('/api/notification/huawei/activate', binding, {
          silent: true,
          timeout: 5000,
        });
        if (response?.status !== 200) throw new Error('HUAWEI_PUSH_BINDING_EXPIRED');
      },
      unbind: async (binding) => {
        await apiBasePost('/api/notification/huawei/unsubscribe', binding, { silent: true, timeout: 5000 });
      },
    },
    open,
    refreshUnread,
  });
  const tick = () => {
    if (hasAndroidBridge() && document.visibilityState === 'visible' && navigator.onLine !== false)
      void sync.tick().catch(() => {
        /* Retry on the next bounded foreground tick. */
      });
  };
  const resume = () => {
    if (!hasAndroidBridge() || !owner.value || document.visibilityState !== 'visible' || navigator.onLine === false)
      return;
    void refreshUnread();
    tick();
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
    document.addEventListener('visibilitychange', resume);
    window.addEventListener('online', resume);
    window.addEventListener('light-note:native-notification-open', resume);
    tick();
  });
  onBeforeUnmount(() => {
    clearInterval(timer);
    stop();
    document.removeEventListener('visibilitychange', resume);
    window.removeEventListener('online', resume);
    window.removeEventListener('light-note:native-notification-open', resume);
    sync.pause();
  });
}
