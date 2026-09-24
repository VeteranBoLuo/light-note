import request, { type RequestOptions } from '@/http/request';
import type { ToolboxArtifact } from './toolbox';
export async function streamTranslation(
  input: { quoteId: string; clientRequestId: string },
  handlers: {
    signal: AbortSignal;
    onStart: (jobId: string) => void;
    onSnapshot: (update: { original?: string; content: string }) => void;
  },
): Promise<ToolboxArtifact> {
  const response = await request({
    url: '/api/toolbox/translation/stream',
    method: 'post',
    data: input,
    adapter: 'fetch',
    responseType: 'stream',
    signal: handlers.signal,
    timeout: 0,
    silent: true,
  } as RequestOptions).catch((failure) => {
    // A rejected HTTP request is different from losing a running SSE connection.
    // Keep ambiguous timeouts/server failures replayable with the same request ID.
    const status = Number(failure?.response?.status ?? failure?.status);
    if ([400, 401, 403, 404, 409, 413, 422, 429].includes(status)) {
      throw Object.assign(new Error('Translation request rejected'), {
        code: status === 404 ? 'TRANSLATION_STREAM_UNAVAILABLE' : failure?.response?.data?.data?.code || failure?.code,
        status,
        definitive: true,
      });
    }
    throw failure;
  });
  const reader = (response.data as ReadableStream<Uint8Array>)?.getReader?.();
  if (!reader) throw Object.assign(new Error('Stream unavailable'), { code: 'TRANSLATION_STREAM_UNKNOWN' });
  const decoder = new TextDecoder();
  let buffer = '',
    completed: ToolboxArtifact | undefined;
  const frame = (value: string) => {
    const lines = value.split('\n');
    const event = lines
      .find((line) => line.startsWith('event:'))
      ?.slice(6)
      .trim();
    const data = lines
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice(5).trimStart())
      .join('\n');
    if (!data) return;
    const parsed = JSON.parse(data);
    if (event === 'start') handlers.onStart(parsed.jobId);
    if (event === 'snapshot') handlers.onSnapshot(parsed);
    if (event === 'complete') {
      if (!parsed.id || typeof parsed.content !== 'string') throw new Error('Invalid translation result');
      completed = parsed;
    }
    if (event === 'error')
      throw Object.assign(new Error(parsed.message), parsed, { definitive: parsed.definitive === true });
  };
  try {
    for (;;) {
      const { done, value } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });
      let boundary;
      while ((boundary = buffer.indexOf('\n\n')) >= 0) {
        frame(buffer.slice(0, boundary));
        buffer = buffer.slice(boundary + 2);
      }
      if (done) break;
    }
    if (buffer.trim()) frame(buffer);
    if (!completed) throw Object.assign(new Error('Stream interrupted'), { code: 'TRANSLATION_STREAM_UNKNOWN' });
    return completed;
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
