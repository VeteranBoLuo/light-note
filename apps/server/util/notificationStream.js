import { notificationRealtimeEvents } from './notificationRealtimeEvents.js';

const connections = new Map();
let totalConnections = 0;

// Auth/account/security/admin-context middleware runs again on every bounded reconnect.
export function openNotificationStream(
  req,
  res,
  { events = notificationRealtimeEvents, heartbeatMs = 25_000, lifetimeMs = 300_000 } = {},
) {
  const userId = req.user?.id;
  if (!userId || req.user?.role === 'visitor' || req.adminContext) return res.status(403).end();
  if (totalConnections >= 500 || (connections.get(userId) || 0) >= 5) return res.status(429).end();
  totalConnections++;
  connections.set(userId, (connections.get(userId) || 0) + 1);
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();
  let closed = false;
  let heartbeat;
  let expiry;
  let unsubscribe = () => {};
  let bridgeReady = false;
  const close = () => {
    if (closed) return;
    closed = true;
    clearInterval(heartbeat);
    clearTimeout(expiry);
    unsubscribe();
    totalConnections--;
    const remaining = (connections.get(userId) || 1) - 1;
    if (remaining) connections.set(userId, remaining);
    else connections.delete(userId);
    res.end();
  };
  const write = (value) => {
    if (closed) return;
    try {
      if (!res.write(value)) close();
    } catch {
      close();
    }
  };
  unsubscribe = events.subscribe(userId, () => write('event: changed\ndata: {}\n\n'));
  res.once('close', close);
  res.once('error', close);
  heartbeat = setInterval(() => {
    write(': heartbeat\n\n');
    // A failed initial Redis subscription must recover without waiting for a new tab.
    void events
      .start()
      .then((ready) => {
        if (ready && !bridgeReady) write('event: ready\ndata: {}\n\n');
        bridgeReady = Boolean(ready);
      })
      .catch(() => {});
  }, heartbeatMs);
  expiry = setTimeout(close, lifetimeMs);
  heartbeat.unref?.();
  expiry.unref?.();
  // The ready snapshot after Redis subscription closes the connect/subscribe race.
  void events
    .start()
    .then((ready) => {
      bridgeReady = Boolean(ready);
      write('event: ready\ndata: {}\n\n');
    })
    .catch(close);
  return close;
}
