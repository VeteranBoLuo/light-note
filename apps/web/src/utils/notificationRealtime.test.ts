import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createNotificationRealtime, readNotificationStream } from './notificationRealtime';

vi.mock('@/utils/authStorage', () => ({ getAdminContextToken: () => '' }));
let stop: (() => void) | undefined;
beforeEach(() => {
  vi.useFakeTimers();
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
});
afterEach(() => {
  stop?.();
  stop = undefined;
  vi.useRealTimers();
  vi.unstubAllGlobals();
  localStorage.clear();
});

function stream() {
  const signals: AbortSignal[] = [],
    hints: (() => void)[] = [];
  const read = vi.fn((signal: AbortSignal, hint: () => void, _activity?: () => void) => {
    signals.push(signal);
    hints.push(hint);
    return new Promise<void>((resolve) => signal.addEventListener('abort', () => resolve(), { once: true }));
  });
  return { read, signals, hints };
}

describe('foreground notification runtime', () => {
  it('bounds sustained hints and does not reopen a healthy stream on duplicate wake signals', async () => {
    const s = stream(), onChange = vi.fn();
    stop = createNotificationRealtime({ readStream: s.read, onChange });
    for (let i = 0; i < 100; i++) {
      s.hints[0]();
      window.dispatchEvent(new Event('online'));
      document.dispatchEvent(new Event('visibilitychange'));
      await vi.advanceTimersByTimeAsync(30);
    }
    await vi.advanceTimersByTimeAsync(1000);
    expect(s.read).toHaveBeenCalledOnce();
    expect(s.signals[0].aborted).toBe(false);
    expect(onChange.mock.calls.length).toBeLessThanOrEqual(4);
  });

  it('does not let repeated visible signals bypass stream reconnect backoff', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const read = vi.fn(async () => { throw new Error('offline'); });
    stop = createNotificationRealtime({ readStream: read, onChange: vi.fn() });
    for (let i = 0; i < 100; i++) {
      document.dispatchEvent(new Event('visibilitychange'));
      await vi.advanceTimersByTimeAsync(30);
    }
    expect(read).toHaveBeenCalledTimes(2);
    vi.restoreAllMocks();
  });

  it('coalesces bursts and retains only low-frequency fallback snapshots', async () => {
    const s = stream(),
      onChange = vi.fn();
    stop = createNotificationRealtime({ readStream: s.read, onChange });
    s.hints[0]();
    s.hints[0]();
    s.hints[0]();
    await vi.advanceTimersByTimeAsync(300);
    expect(onChange).toHaveBeenCalledOnce();
    expect(s.read).toHaveBeenCalledOnce();
    // The real stream supplies heartbeats; keep this fake stream alive too.
    const heartbeats = setInterval(() => s.read.mock.calls[0][2]?.(), 25_000);
    await vi.advanceTimersByTimeAsync(119_700);
    expect(onChange).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(300);
    expect(onChange).toHaveBeenCalledTimes(2);
    clearInterval(heartbeats);
  });

  it('closes hidden pages, ignores old callbacks, and reconciles on foreground resume', async () => {
    const s = stream(),
      onChange = vi.fn();
    stop = createNotificationRealtime({ readStream: s.read, onChange });
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
    expect(s.signals[0].aborted).toBe(true);
    await vi.advanceTimersByTimeAsync(125_000);
    s.hints[0]();
    expect(onChange).not.toHaveBeenCalled();
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
    document.dispatchEvent(new Event('visibilitychange'));
    expect(s.read).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(300);
    expect(onChange).toHaveBeenCalledOnce();
    stop();
    stop = undefined;
    s.hints[1]();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('backs off failed streams while preserving polling fallback', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const read = vi.fn(async () => {
        throw new Error('offline');
      }),
      onChange = vi.fn();
    stop = createNotificationRealtime({ readStream: read, onChange });
    await vi.advanceTimersByTimeAsync(2000);
    expect(read).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(4000);
    expect(read).toHaveBeenCalledTimes(3);
    expect(onChange).toHaveBeenCalledOnce();
    vi.restoreAllMocks();
  });

  it('uses polling only for preview contexts without attempting a stream', async () => {
    const read = vi.fn(),
      onChange = vi.fn();
    stop = createNotificationRealtime({ readStream: read, onChange, canStream: () => false });
    await vi.advanceTimersByTimeAsync(300);
    expect(onChange).toHaveBeenCalledOnce();
    expect(read).not.toHaveBeenCalled();
  });
});

it('parses split SSE frames and sends credentials only in headers', async () => {
  const onChange = vi.fn();
  localStorage.setItem('rememberedSid', 'fixture-session');
  const encoder = new TextEncoder();
  const body = new ReadableStream({
    start(controller) {
      for (const part of ['event: rea', 'dy\r\ndata: {}\r\n\r\n: heartbeat\n\n', 'event: changed\ndata: {}\n\n'])
        controller.enqueue(encoder.encode(part));
      controller.close();
    },
  });
  const fetchMock = vi.fn(async () => new Response(body, { headers: { 'content-type': 'text/event-stream' } }));
  vi.stubGlobal('fetch', fetchMock);
  await readNotificationStream(new AbortController().signal, onChange);
  expect(onChange).toHaveBeenCalledTimes(2);
  expect(fetchMock).toHaveBeenCalledWith(
    '/api/notification/stream',
    expect.objectContaining({
      method: 'POST',
      credentials: 'include',
      headers: { Accept: 'text/event-stream', 'X-Session-Id': 'fixture-session' },
    }),
  );
});
