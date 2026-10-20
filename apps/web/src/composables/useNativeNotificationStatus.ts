import { readonly, shallowRef } from 'vue';
import type { NativeNotificationDeviceState, NativeNotificationState } from '@/utils/nativeNotificationSync';

// Presentation only. Tokens and binding credentials stay inside the synchronization runtime.
const connection = shallowRef<{ state: NativeNotificationState; owner: string }>({ state: 'idle', owner: '' });
const online = shallowRef(true);
const device = shallowRef<NativeNotificationDeviceState & { owner: string }>({
  owner: '',
  systemEnabled: null,
  settingsAvailable: false,
});
export const nativeNotificationStatus = readonly(connection);
export const nativeNotificationOnline = readonly(online);
export const nativeNotificationDevice = readonly(device);
export function updateNativeNotificationDevice(state: NativeNotificationDeviceState | null, owner: string) {
  device.value = {
    owner,
    systemEnabled: state?.systemEnabled ?? null,
    settingsAvailable: state?.settingsAvailable ?? false,
  };
}
export function updateNativeNotificationStatus(state: NativeNotificationState, owner: string) {
  connection.value = { state, owner };
}
export function updateNativeNotificationOnline(value: boolean) {
  online.value = value;
}
export function retryNativeNotifications() {
  window.dispatchEvent(new Event('light-note:native-notification-retry'));
}
