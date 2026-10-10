import { readonly, shallowRef } from 'vue';
import type { NativeNotificationState } from '@/utils/nativeNotificationSync';

// Presentation only. Tokens and binding credentials stay inside the synchronization runtime.
const connection = shallowRef<{ state: NativeNotificationState; owner: string }>({ state: 'idle', owner: '' });
const online = shallowRef(true);
export const nativeNotificationStatus = readonly(connection);
export const nativeNotificationOnline = readonly(online);
export function updateNativeNotificationStatus(state: NativeNotificationState, owner: string) {
  connection.value = { state, owner };
}
export function updateNativeNotificationOnline(value: boolean) {
  online.value = value;
}
export function retryNativeNotifications() {
  window.dispatchEvent(new Event('light-note:native-notification-retry'));
}
