import { onBeforeUnmount, onMounted, watch, type Ref } from 'vue';
import { apiBasePost } from '@/http/request';
import { hasAndroidBridge } from '@/utils/androidBridge';
import { createNativeNotificationSync, nativeNotificationMessage } from '@/utils/nativeNotificationSync';
import { useNotification } from './useNotification';
import { updateNativeNotificationStatus, updateNativeNotificationOnline } from './useNativeNotificationStatus';

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
    onState: updateNativeNotificationStatus,
  });
  let timer: ReturnType<typeof setTimeout> | undefined;
  let mounted = false;
  let lastNotificationSync = 0;
  const canRun = () =>
    hasAndroidBridge() && Boolean(owner.value) && document.visibilityState === 'visible' && navigator.onLine !== false;
  const schedule = () => {
    clearTimeout(timer);
    if (mounted && canRun()) timer = setTimeout(tick, sync.nextDelay());
  };
  const tick = async () => {
    if (!canRun()) return;
    const syncNotifications = !lastNotificationSync || Date.now() - lastNotificationSync >= 15000;
    if (syncNotifications) lastNotificationSync = Date.now();
    try {
      await sync.tick({ syncNotifications });
    } catch {
      /* A bridge/API timeout is retried without interrupting the user. */
    } finally {
      schedule();
    }
  };
  const resume = () => {
    updateNativeNotificationOnline(navigator.onLine !== false);
    clearTimeout(timer);
    if (!canRun()) return;
    sync.retry();
    lastNotificationSync = 0;
    void refreshUnread().catch(() => {});
    void tick();
  };
  const stop = watch(
    owner,
    (value) => {
      if (!hasAndroidBridge()) return;
      clearTimeout(timer);
      lastNotificationSync = 0;
      if (value === null) sync.pause();
      else sync.setOwner(value);
      void tick();
    },
    { immediate: true, flush: 'sync' },
  );
  onMounted(() => {
    mounted = true;
    updateNativeNotificationOnline(navigator.onLine !== false);
    document.addEventListener('visibilitychange', resume);
    window.addEventListener('online', resume);
    window.addEventListener('offline', resume);
    window.addEventListener('light-note:native-notification-open', resume);
    window.addEventListener('light-note:native-notification-retry', resume);
    void tick();
  });
  onBeforeUnmount(() => {
    mounted = false;
    clearTimeout(timer);
    stop();
    document.removeEventListener('visibilitychange', resume);
    window.removeEventListener('online', resume);
    window.removeEventListener('offline', resume);
    window.removeEventListener('light-note:native-notification-open', resume);
    window.removeEventListener('light-note:native-notification-retry', resume);
    sync.pause();
  });
}
