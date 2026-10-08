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
    terminate = vi.fn(async () => {
      this.emit('exit', 1);
    });
  },
}));
import { createPersonalSearchPreprocessor } from './personalSearchPreprocessor.js';
const input = { content: 'private text '.repeat(4000), resourceType: 'note', resourceId: 'n' };
beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

it('terminates timed-out processing and rejects subsequent work without leaking private text', async () => {
  const processor = createPersonalSearchPreprocessor();
  const result = processor.chunk(input);
  const rejected = expect(result).rejects.toMatchObject({ code: 'AI_PERSONAL_SEARCH_PREPROCESS_TIMEOUT', status: 503 });
  await vi.advanceTimersByTimeAsync(30_000);
  await rejected;
  expect(state.worker.terminate).toHaveBeenCalledOnce();
  await expect(processor.chunk(input)).rejects.toMatchObject({ code: 'AI_PERSONAL_SEARCH_PREPROCESS_CLOSED' });
  await processor.close();
  expect(vi.getTimerCount()).toBe(0);
});

it.each(['error', 'exit'])('releases pending work when the worker emits %s', async (event) => {
  const processor = createPersonalSearchPreprocessor();
  const result = processor.chunk(input);
  const rejected = expect(result).rejects.toThrow('Private search text processing failed');
  state.worker.emit(event, event === 'error' ? new Error(input.content) : 1);
  await rejected;
  await processor.close();
  expect(vi.getTimerCount()).toBe(0);
});

it('clears pending state if structured cloning fails', async () => {
  const processor = createPersonalSearchPreprocessor();
  const first = processor.chunk(input);
  const firstRejected = expect(first).rejects.toThrow('Private search text processing failed');
  state.worker.emit('message', { error: 'AI_PERSONAL_SEARCH_PREPROCESS_FAILED' });
  await firstRejected;
  state.worker.postMessage.mockImplementationOnce(() => {
    throw new Error('clone failed');
  });
  await expect(processor.chunk(input)).rejects.toMatchObject({ code: 'AI_PERSONAL_SEARCH_PREPROCESS_FAILED' });
  await processor.close();
  expect(vi.getTimerCount()).toBe(0);
});

it('shares the single in-flight limit across file cleaning and note parsing', async () => {
  const processor = createPersonalSearchPreprocessor();
  const result = processor.fileText(input.content);
  expect(state.worker.postMessage).toHaveBeenCalledWith({ content: input.content, operation: 'fileText' });
  await expect(processor.chunk(input)).rejects.toMatchObject({ code: 'AI_PERSONAL_SEARCH_PREPROCESS_CONCURRENT' });
  state.worker.emit('message', { documents: 'cleaned text' });
  expect(await result).toBe('cleaned text');
  await processor.close();
  expect(vi.getTimerCount()).toBe(0);
});
