import { EventEmitter } from 'node:events';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ worker: null }));
vi.mock('node:worker_threads', () => ({
  Worker: class extends EventEmitter {
    constructor() {
      super();
      state.worker = this;
    }
    postMessage = vi.fn();
    ref = vi.fn();
    unref = vi.fn();
    terminate = vi.fn(async () => this.emit('exit', 1));
  },
}));
import { buildIsolatedIndex, createIndexClient } from './personalSearchIndexClient.js';
let service;
beforeEach(() => {
  vi.useFakeTimers();
  service = createIndexClient();
});
afterEach(async () => {
  await service.close();
  vi.useRealTimers();
});

it('holds at most 32 waiting requests without posting their bodies and rejects overload explicitly', async () => {
  const active = service.request({ op: 'test' }).catch((error) => error.code);
  const waiting = Array.from({ length: 32 }, () => service.request({ op: 'test' }).catch((error) => error.code));
  await expect(service.request({ op: 'test' })).rejects.toMatchObject({ code: 'AI_PERSONAL_SEARCH_BUSY', status: 503 });
  expect(state.worker.postMessage).toHaveBeenCalledTimes(1);
  await service.close();
  expect(await active).toBe('AI_PERSONAL_SEARCH_INDEX_CLOSED');
  expect(await Promise.all(waiting)).toEqual(Array(32).fill('AI_PERSONAL_SEARCH_INDEX_CLOSED'));
  expect(vi.getTimerCount()).toBe(0);
});

it('kills timed-out work, releases queued requests and can start a fresh worker', async () => {
  const result = service.request({ op: 'test' }).catch((error) => error.code);
  const queued = service.request({ op: 'test' }).catch((error) => error.code);
  const previous = state.worker;
  await vi.advanceTimersByTimeAsync(30_000);
  expect(await result).toBe('AI_PERSONAL_SEARCH_INDEX_TIMEOUT');
  expect(await queued).toBe('AI_PERSONAL_SEARCH_INDEX_TIMEOUT');
  expect(previous.terminate).toHaveBeenCalled();
  const fresh = service.request({ op: 'test' });
  expect(state.worker).not.toBe(previous);
  const [{ id }] = state.worker.postMessage.mock.calls[0];
  state.worker.emit('message', { id, value: { okay: true } });
  expect(await fresh).toEqual({ okay: true });
  expect(state.worker.unref).toHaveBeenCalled();
  expect(vi.getTimerCount()).toBe(0);
});

it.each(['exit', 'error'])('redacts worker %s failures and releases all pending jobs', async (event) => {
  const result = service.request({ op: 'test' });
  const rejected = expect(result).rejects.toMatchObject({
    code: 'AI_PERSONAL_SEARCH_INDEX_EXITED',
    message: 'Private search index worker unavailable',
  });
  state.worker.emit(event, new Error('private content must not escape'));
  await rejected;
  expect(vi.getTimerCount()).toBe(0);
});

it('cancels an upload waiting for another build when the worker closes', async () => {
  const first = buildIsolatedIndex([], service).catch((error) => error.code);
  const second = buildIsolatedIndex([], service).catch((error) => error.code);
  await vi.advanceTimersByTimeAsync(0);
  const original = state.worker;
  await service.close();
  expect(await first).toBe('AI_PERSONAL_SEARCH_INDEX_CLOSED');
  expect(await second).toBe('AI_PERSONAL_SEARCH_INDEX_EXITED');
  expect(state.worker).toBe(original);
  expect(vi.getTimerCount()).toBe(0);
});
