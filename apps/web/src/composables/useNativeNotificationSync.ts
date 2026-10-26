import { onBeforeUnmount, onMounted, watch, type Ref } from 'vue';
import { apiBasePost } from '@/http/request';
import { hasAndroidBridge } from '@/utils/androidBridge';
import { createNativeNotificationSync, nativeNotificationMessage } from '@/utils/nativeNotificationSync';
import { createNativePushBindingStore } from '@/utils/nativePushBindingStore';
import { useNotification } from './useNotification';
import {
  updateNativeNotificationStatus,
  updateNativeNotificationOnline,
  updateNativeNotificationDevice,
} from './useNativeNotificationStatus';

export function useNativeNotificationSync(owner: Ref<string | null>, open: () => void) {
  const { refreshUnread } = useNotification();
  const sync = createNativeNotificationSync({
    bridge: nativeNotificationMessage,
    bindingStore: createNativePushBindingStore({
      getItem: (key) => localStorage.getItem(key),
      setItem: (key, value) => localStorage.setItem(key, value),
      removeItem: (key) => localStorage.removeItem(key),
    }),
    fetch: async (input) => {
      const response = await apiBasePost('/api/notification/native/sync', input);
      if (response?.status !== 200 || !response.data) throw new Error('NATIVE_NOTIFICATION_SYNC_UNAVAILABLE');
      return response.data;
    },
    remote: {
      bind: async (deviceToken, previousBinding) => {
        const response = await apiBasePost(
          '/api/notification/huawei/subscribe',
          { deviceToken, ...(previousBinding ? { previousBinding } : {}) },
          { silent: true, timeout: 5000 },
        ).catch((error) => {
          throw connectionError(error);
        });
        if (response?.status !== 200 || !response.data) throw connectionError(response);
        return response.data;
      },
      activate: async (binding) => {
        const response = await apiBasePost('/api/notification/huawei/activate', binding, {
          silent: true,
          timeout: 5000,
        }).catch((error) => {
          throw connectionError(error);
        });
        if (response?.status !== 200) throw connectionError(response);
      },
      unbind: async (binding) => {
        const response = await apiBasePost('/api/notification/huawei/unsubscribe', binding, {
          silent: true,
          timeout: 5000,
        }).catch((error) => {
          throw connectionError(error);
        });
        if (response?.status !== 200) throw connectionError(response);
      },
    },
    open,
    refreshUnread,
    onState: updateNativeNotificationStatus,
    onDeviceState: updateNativeNotificationDevice,
  });
  let timer: ReturnType<typeof setTimeout> | undefined;
  let mounted = false;
  let lastNotificationSync = 0;
  let lastResumeAt = -Infinity;
  const canCheck = () => hasAndroidBridge() && Boolean(owner.value) && document.visibilityState === 'visible';
  const canRun = () => canCheck() && navigator.onLine !== false;
  const schedule = () => {
    clearTimeout(timer);
    if (mounted && canRun()) timer = setTimeout(tick, sync.nextDelay());
  };
  const tick = async () => {
    if (!canCheck()) return;
    const online = navigator.onLine !== false;
    const syncNotifications = online && (!lastNotificationSync || Date.now() - lastNotificationSync >= 15000);
    if (syncNotifications) lastNotificationSync = Date.now();
    try {
      await sync.tick({ syncNotifications, online });
    } catch {
      /* A bridge/API timeout is retried without interrupting the user. */
    } finally {
      schedule();
    }
  };
  const resume = (event: Event) => {
    updateNativeNotificationOnline(navigator.onLine !== false);
    clearTimeout(timer);
    if (!canCheck()) {
      lastResumeAt = -Infinity;
      return;
    }
    if (navigator.onLine === false) {
      lastResumeAt = -Infinity;
      void tick();
      return;
    }
    // WebView 会连续上报显隐、联网和原生恢复；同一次恢复只做一次同步。
    if (event.type !== 'light-note:native-notification-retry' && Date.now() - lastResumeAt < 1000) {
      schedule();
      return;
    }
    lastResumeAt = Date.now();
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
      lastResumeAt = -Infinity;
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
    window.addEventListener('light-note:native-notification-resume', resume);
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
    window.removeEventListener('light-note:native-notification-resume', resume);
    sync.pause();
  });
}

function connectionError(response: { status?: number; msg?: string } | null | undefined) {
  return Object.assign(new Error('HUAWEI_PUSH_UNAVAILABLE'), {
    connectionState:
      response?.msg === 'HUAWEI_PUSH_DEVICE_LIMIT'
        ? 'deviceLimit'
        : response?.msg === 'HUAWEI_PUSH_DISABLED'
          ? 'serviceDisabled'
          : [401, 403].includes(response?.status || 0)
            ? 'accountRequired'
            : undefined,
    invalidToken: response?.status === 410 || response?.msg === 'HUAWEI_PUSH_TOKEN_INVALID',
    staleBinding: ['HUAWEI_PUSH_BINDING_EXPIRED', 'HUAWEI_PUSH_BINDING_INVALID'].includes(response?.msg || ''),
  });
}
