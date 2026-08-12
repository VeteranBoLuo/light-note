import { describe, expect, it } from 'vitest';
import { NOTE_IMAGE_MAX_BYTES, noteImageExtensionForMimeType, validateNoteImageUpload } from './noteImageUpload.js';

const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
);

describe('笔记图片上传校验', () => {
  it('只为受支持 MIME 生成安全扩展名', () => {
    expect(noteImageExtensionForMimeType('image/jpeg')).toBe('.jpg');
    expect(noteImageExtensionForMimeType('image/webp')).toBe('.webp');
    expect(noteImageExtensionForMimeType('image/svg+xml')).toBe('');
  });

  it('接受扩展名、MIME 和真实内容一致的图片', async () => {
    await expect(
      validateNoteImageUpload(
        {
          path: '/tmp/note.png',
          filename: 'note-safe.png',
          mimetype: 'image/png',
          size: TINY_PNG.length,
        },
        { readFile: async () => TINY_PNG },
      ),
    ).resolves.toMatchObject({ width: 1, height: 1, type: 'png' });
  });

  it('拒绝伪造 MIME、内容不完整和超过 20MB 的文件', async () => {
    await expect(
      validateNoteImageUpload(
        {
          path: '/tmp/note.jpg',
          filename: 'note-spoof.jpg',
          mimetype: 'image/jpeg',
          size: TINY_PNG.length,
        },
        { readFile: async () => TINY_PNG },
      ),
    ).rejects.toMatchObject({ code: 'NOTE_IMAGE_CONTENT_INVALID', status: 400 });
    await expect(
      validateNoteImageUpload(
        {
          path: '/tmp/note.png',
          filename: 'note-short.png',
          mimetype: 'image/png',
          size: TINY_PNG.length + 1,
        },
        { readFile: async () => TINY_PNG },
      ),
    ).rejects.toMatchObject({ code: 'NOTE_IMAGE_INCOMPLETE', status: 400 });
    await expect(
      validateNoteImageUpload({
        path: '/tmp/note.png',
        filename: 'note-large.png',
        mimetype: 'image/png',
        size: NOTE_IMAGE_MAX_BYTES + 1,
      }),
    ).rejects.toMatchObject({ code: 'NOTE_IMAGE_TOO_LARGE', status: 413 });
  });
});
