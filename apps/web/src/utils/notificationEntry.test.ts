import { describe, expect, it, vi } from 'vitest';
import { NOTIFICATION_PANEL_OPEN_EVENT, openNotificationPanel } from './notificationEntry';

describe('notificationEntry', () => {
  it('派发打开通知铃铛面板事件', () => {
    const listener = vi.fn();
    window.addEventListener(NOTIFICATION_PANEL_OPEN_EVENT, listener);

    openNotificationPanel();

    expect(listener).toHaveBeenCalledTimes(1);
    window.removeEventListener(NOTIFICATION_PANEL_OPEN_EVENT, listener);
  });
});
