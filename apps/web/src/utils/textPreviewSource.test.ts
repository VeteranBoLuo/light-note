import { describe, expect, it, vi } from 'vitest';
import { decodePreviewText, readTextPreviewSource } from './textPreviewSource';

const utf8 = (source: string) => new TextEncoder().encode(source);

describe('text preview encoding', () => {
  it('preserves UTF-8 Chinese, timestamps, emoji and literal replacement characters', () => {
    const source = '[00:12.50]中文歌词 🎵 �';
    expect(decodePreviewText(utf8(source))).toBe(source);
    expect(decodePreviewText(new Uint8Array([0xef, 0xbb, 0xbf, ...utf8(source)]))).toBe(source);
  });

  it('decodes GBK Chinese instead of replacing original bytes', () => {
    expect(decodePreviewText(new Uint8Array([...utf8('[00:12.50]'), 0xd6, 0xd0, 0xce, 0xc4]))).toBe('[00:12.50]中文');
  });

  it('supports GB18030 four-byte characters', () => {
    expect(decodePreviewText(new Uint8Array([0x90, 0x30, 0x81, 0x30]))).toBe('\u{10000}');
  });

  it.each([
    [0xff, 0xfe, 0x2d, 0x4e, 0x87, 0x65],
    [0xfe, 0xff, 0x4e, 0x2d, 0x65, 0x87],
  ])('respects UTF-16 BOM: %j', (...bytes) => {
    expect(decodePreviewText(new Uint8Array(bytes))).toBe('中文');
  });

  it('decodes characters split across network chunks', async () => {
    const bytes = new Uint8Array([...utf8('[00:01]'), 0xd6, 0xd0, 0xce, 0xc4]);
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        for (const byte of bytes) controller.enqueue(new Uint8Array([byte]));
        controller.close();
      },
    });
    expect(await readTextPreviewSource(new Response(body), 100)).toEqual({ content: '[00:01]中文', truncated: false });
  });

  it('reads raw bytes when streaming is unavailable', async () => {
    const response = { body: null, arrayBuffer: async () => new Uint8Array([0xd6, 0xd0]).buffer } as Response;
    expect(await readTextPreviewSource(response, 10)).toEqual({ content: '中', truncated: false });
  });

  it('keeps empty and exact-limit content untruncated', async () => {
    expect(await readTextPreviewSource(new Response(''), 2)).toEqual({ content: '', truncated: false });
    expect(await readTextPreviewSource(new Response('中文'), 2)).toEqual({ content: '中文', truncated: false });
  });

  it('bounds network reads, cancels oversized streams and keeps valid text', async () => {
    const cancel = vi.fn();
    const body = new ReadableStream<Uint8Array>({
      start(controller) { controller.enqueue(utf8('中'.repeat(100))); },
      cancel,
    });
    expect(await readTextPreviewSource(new Response(body), 2)).toEqual({ content: '中中', truncated: true });
    expect(cancel).toHaveBeenCalledOnce();
    expect(body.locked).toBe(false);
  });

  it('does not split an emoji at the display limit', async () => {
    expect(await readTextPreviewSource(new Response('中🎵文'), 2)).toEqual({ content: '中', truncated: true });
  });

  it('propagates read failures and releases the reader', async () => {
    const body = new ReadableStream<Uint8Array>({ start(controller) { controller.error(new Error('offline')); } });
    await expect(readTextPreviewSource(new Response(body), 10)).rejects.toThrow('offline');
    expect(body.locked).toBe(false);
  });
});
