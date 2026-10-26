import { EventEmitter } from 'node:events';
import { createServer } from 'node:http';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { openNotificationStream } from './notificationStream.js';
import { NotificationRealtimeEvents } from './notificationRealtimeEvents.js';

afterEach(() => vi.useRealTimers());
function response() {
  const res = new EventEmitter();
  Object.assign(res, {
    setHeader: vi.fn(),
    flushHeaders: vi.fn(),
    write: vi.fn(() => true),
    status: vi.fn(() => res),
    end: vi.fn(),
  });
  return res;
}
it('streams recipient-only hints and heartbeats without database polling, then cleans up', async () => {
  vi.useFakeTimers();
  let notify;
  const unsubscribe = vi.fn();
  const events = {
    subscribe: vi.fn((_id, callback) => {
      notify = callback;
      return unsubscribe;
    }),
    start: vi.fn(async () => true),
  };
  const res = response();
  openNotificationStream({ user: { id: 'alice', role: 'user' } }, res, { events, heartbeatMs: 25, lifetimeMs: 100 });
  await vi.advanceTimersByTimeAsync(0);
  expect(events.subscribe).toHaveBeenCalledWith('alice', expect.any(Function));
  expect(res.write).toHaveBeenCalledWith('event: ready\ndata: {}\n\n');
  notify();
  expect(res.write).toHaveBeenCalledWith('event: changed\ndata: {}\n\n');
  await vi.advanceTimersByTimeAsync(25);
  expect(res.write).toHaveBeenCalledWith(': heartbeat\n\n');
  res.emit('close');
  expect(unsubscribe).toHaveBeenCalledOnce();
  expect(vi.getTimerCount()).toBe(0);
});

it.each([{ user: { id: 'visitor', role: 'visitor' } }, { user: { id: 'actor', role: 'root' }, adminContext: {} }])(
  'rejects guest and impersonation streams',
  (req) => {
    const res = response();
    openNotificationStream(req, res);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.flushHeaders).not.toHaveBeenCalled();
  },
);

it('closes slow clients instead of buffering unbounded events', async () => {
  const res = response();
  res.write.mockReturnValue(false);
  const unsubscribe = vi.fn();
  const events = {
    subscribe: (_id, callback) => {
      queueMicrotask(callback);
      return unsubscribe;
    },
    start: async () => true,
  };
  openNotificationStream({ user: { id: 'slow', role: 'user' } }, res, { events });
  await Promise.resolve();
  expect(res.end).toHaveBeenCalledOnce();
  expect(unsubscribe).toHaveBeenCalledOnce();
});

it('delivers ready and changed frames through a real HTTP stream', async () => {
  const events = new NotificationRealtimeEvents();
  events.start = async () => true;
  const server = createServer((req, res) => {
    req.user = { id: 'http-fixture', role: 'user' };
    openNotificationStream(req, res, { events });
  });
  const abort = new AbortController();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}`, { method: 'POST', signal: abort.signal });
    expect(response.headers.get('content-type')).toContain('text/event-stream');
    expect(response.headers.get('x-accel-buffering')).toBe('no');
    const reader = response.body.getReader();
    expect(new TextDecoder().decode((await reader.read()).value)).toContain('event: ready');
    events.publish(['someone-else']);
    events.publish(['http-fixture']);
    expect(new TextDecoder().decode((await reader.read()).value)).toBe('event: changed\ndata: {}\n\n');
    await reader.cancel();
  } finally {
    abort.abort();
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    await events.close();
  }
});
