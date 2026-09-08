export const NOTIFICATION_PANEL_OPEN_EVENT = 'light-note:open-notification-panel';

export function openNotificationPanel(notificationId?: string) {
  if (typeof window === 'undefined') return false;
  return !window.dispatchEvent(
    new CustomEvent(NOTIFICATION_PANEL_OPEN_EVENT, { detail: { notificationId }, cancelable: true }),
  );
}
