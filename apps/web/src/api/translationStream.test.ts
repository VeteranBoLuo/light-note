import { it, expect, vi } from 'vitest';
const request = vi.hoisted(() => vi.fn());
vi.mock('@/http/request', () => ({ default: request }));
import { streamTranslation } from './translationStream';
function response(parts: string[]) {
  const encoder = new TextEncoder();
  request.mockResolvedValue({
    data: new ReadableStream({
      start(controller) {
        // Split UTF-8 even inside Chinese characters and SSE frame delimiters.
        for (const part of parts) for (const byte of encoder.encode(part)) controller.enqueue(new Uint8Array([byte]));
        controller.close();
      },
    }),
  });
}
it('decodes split streamed text and returns the final persisted artifact', async () => {
  response([
    'event: start\ndata: {"jobId":"job"}\n\n',
    'event: snapshot\ndata: {"original":"Hello","content":"你好"}\n\n',
    'event: complete\ndata: {"id":"artifact","content":"你好"}\n\n',
  ]);
  const onStart = vi.fn(),
    onSnapshot = vi.fn();
  const result = await streamTranslation(
    { quoteId: 'q', clientRequestId: 'r' },
    { signal: new AbortController().signal, onStart, onSnapshot },
  );
  expect(onStart).toHaveBeenCalledWith('job');
  expect(onSnapshot).toHaveBeenCalledWith({ original: 'Hello', content: '你好' });
  expect(result.id).toBe('artifact');
});
it('distinguishes a definitive failure from a lost completion response', async () => {
  const input = { quoteId: 'q', clientRequestId: 'r' },
    handlers = { signal: new AbortController().signal, onStart: vi.fn(), onSnapshot: vi.fn() };
  response(['event: error\ndata: {"code":"AI_TRANSLATION_OUTPUT_INVALID","status":502,"definitive":true}\n\n']);
  await expect(streamTranslation(input, handlers)).rejects.toMatchObject({ definitive: true });
  response(['event: start\ndata: {"jobId":"job"}\n\n']);
  await expect(streamTranslation(input, handlers)).rejects.toMatchObject({ code: 'TRANSLATION_STREAM_UNKNOWN' });
});

it('HTTP route rejection unlocks editing, but timeouts and server errors remain uncertain', async () => {
  const input = { quoteId: 'q', clientRequestId: 'r' };
  const handlers = { signal: new AbortController().signal, onStart: vi.fn(), onSnapshot: vi.fn() };
  request.mockRejectedValueOnce({ response: { status: 404 }, code: 'ERR_BAD_REQUEST' });
  await expect(streamTranslation(input, handlers)).rejects.toMatchObject({
    code: 'TRANSLATION_STREAM_UNAVAILABLE',
    definitive: true,
  });
  for (const status of [408, 500, 502, 503]) {
    request.mockRejectedValueOnce({ status });
    await expect(streamTranslation(input, handlers)).rejects.not.toHaveProperty('definitive');
  }
});
