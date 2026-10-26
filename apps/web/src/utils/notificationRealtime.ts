import { getAdminContextToken } from '@/utils/authStorage';

/** SSE over fetch keeps session credentials in headers and supports explicit cancellation. */
export async function readNotificationStream(
  signal: AbortSignal,
  onChange: () => void,
  onActivity: () => void = () => {},
) {
  const headers: Record<string, string> = { Accept: 'text/event-stream' };
  const adminContext = getAdminContextToken();
  if (adminContext) throw new Error('NOTIFICATION_PREVIEW_POLL_ONLY');
  try {
    const sid = localStorage.getItem('rememberedSid');
    if (sid) headers['X-Session-Id'] = sid;
  } catch {
    /* Cookie authentication works when storage is unavailable. */
  }
  const response = await fetch('/api/notification/stream', { method: 'POST', headers, credentials: 'include', signal });
  if (!response.ok || !response.body || !response.headers.get('content-type')?.includes('text/event-stream')) {
    throw new Error('NOTIFICATION_STREAM_UNAVAILABLE');
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  try {
    while (!signal.aborted) {
      const { done, value } = await reader.read();
      if (done) break;
      onActivity();
      buffer += decoder.decode(value, { stream: true }).replace(/\r/g, '');
      if (buffer.length > 8192) throw new Error('NOTIFICATION_STREAM_INVALID');
      let boundary;
      while ((boundary = buffer.indexOf('\n\n')) >= 0) {
        const frame = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        if (/^event: (?:ready|changed)$/m.test(frame)) onChange();
      }
    }
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

export function createNotificationRealtime({
  onChange,
  readStream = readNotificationStream,
  canStream = () => !getAdminContextToken(),
}: {
  onChange: () => void;
  readStream?: typeof readNotificationStream;
  canStream?: () => boolean;
}) {
  let stopped = false;
  let controller: AbortController | null = null;
  let retryTimer: ReturnType<typeof setTimeout> | undefined;
  let changeTimer: ReturnType<typeof setTimeout> | undefined;
  let timeoutTimer: ReturnType<typeof setTimeout> | undefined;
  let retryMs = 2000;
  let lastChangeAt = -Infinity;
  const visible = () => document.visibilityState !== 'hidden' && navigator.onLine !== false;
  const invalidate = () => {
    if (stopped || !visible() || changeTimer) return;
    changeTimer = setTimeout(() => {
      changeTimer = undefined;
      if (!stopped && visible()) {
        lastChangeAt = Date.now();
        onChange();
      }
    }, Math.max(300, 1000 - (Date.now() - lastChangeAt)));
  };
  const connect = () => {
    if (stopped || controller || !visible() || !canStream()) return;
    const current = new AbortController();
    controller = current;
    const activity = () => {
      if (controller !== current || current.signal.aborted) return;
      clearTimeout(timeoutTimer);
      timeoutTimer = setTimeout(() => current.abort(), 45_000);
    };
    activity();
    void readStream(
      current.signal,
      () => {
        if (controller !== current || stopped || current.signal.aborted) return;
        retryMs = 2000;
        invalidate();
      },
      activity,
    )
      .catch(() => {})
      .finally(() => {
        if (controller !== current) return;
        controller = null;
        clearTimeout(timeoutTimer);
        if (!stopped && visible()) {
          retryTimer = setTimeout(() => {
            retryTimer = undefined;
            connect();
          }, retryMs + Math.floor(Math.random() * 1000));
          retryMs = Math.min(retryMs * 2, 60_000);
        }
      });
  };
  const pause = () => {
    clearTimeout(retryTimer);
    retryTimer = undefined;
    clearTimeout(changeTimer);
    clearTimeout(timeoutTimer);
    changeTimer = undefined;
    const previous = controller;
    controller = null;
    previous?.abort();
  };
  const resume = () => {
    if (!visible()) {
      pause();
      return;
    }
    invalidate();
    // 重复的 online/visibility 信号不能打断健康连接，也不能绕过失败退避。
    if (controller || retryTimer !== undefined) return;
    retryMs = 2000;
    connect();
  };
  document.addEventListener('visibilitychange', resume);
  window.addEventListener('online', resume);
  window.addEventListener('offline', pause);
  // Heartbeats do no SQL; periodic snapshots cover lost Redis hints and older servers.
  const fallback = setInterval(invalidate, 120_000);
  invalidate();
  connect();
  return () => {
    stopped = true;
    pause();
    clearInterval(fallback);
    document.removeEventListener('visibilitychange', resume);
    window.removeEventListener('online', resume);
    window.removeEventListener('offline', pause);
  };
}
