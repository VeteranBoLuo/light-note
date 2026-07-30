export const NOTIFICATION_PANEL_OPEN_EVENT = 'light-note:open-notification-panel';

export function openNotificationPanel() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(NOTIFICATION_PANEL_OPEN_EVENT));
}
