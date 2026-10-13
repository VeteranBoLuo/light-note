import { describe, expect, it } from 'vitest';
import {
  resolveFileCategory,
  resolveFilePreviewType,
  resolveFilePlaybackMimeType,
  FILE_FORMATS,
} from './fileCategory.js';
import { FILE_CATEGORY_CASES } from './fileCategory.cases.js';
import { resolveFilePreviewFormat } from './index.js';

describe('shared file formats', () => {
  it.each(FILE_CATEGORY_CASES)('%j → %s / %s', (file, category, preview) => {
    expect(resolveFileCategory(file)).toBe(category);
    expect(resolveFilePreviewType(file)).toBe(preview);
  });
  it('实际文件名优先于旧 ext 字段；只有 ext 的旧资源仍可识别', () => {
    expect(resolveFilePreviewType({ fileName: 'safe.txt', ext: 'html', fileType: 'text/html' })).toBe('text');
    expect(resolveFilePreviewType({ ext: '.CSV' })).toBe('csv');
    expect(resolveFileCategory(null)).toBe('other');
    expect(resolveFilePreviewType(null)).toBe('unsupported');
  });
  it('媒体 MIME 跟随已知格式，未知后缀不能靠分类获得播放器', () => {
    expect(resolveFilePlaybackMimeType({ fileName: 'clip.mp4', fileType: 'video/x-msvideo' })).toBe(
      'video/mp4',
    );
    expect(resolveFilePlaybackMimeType({ fileName: 'voice.opus' })).toBe('audio/ogg; codecs=opus');
    expect(resolveFilePlaybackMimeType({ fileName: 'unknown.bin', fileType: 'audio/mpeg' })).toBe('');
  });
  it('所有已知扩展名都有明确预览策略，直接预览不会进入 Worker', () => {
    for (const format of FILE_FORMATS)
      for (const ext of format.extensions || []) {
        const file = { fileName: `file.${ext}`, fileType: 'application/octet-stream' };
        expect(resolveFileCategory(file)).toBe(format.category);
        expect(resolveFilePreviewType(file)).toBe(format.previewType);
        expect(Boolean(resolveFilePreviewFormat(file))).toBe(
          ['archive', 'converted-pdf'].includes(format.previewType),
        );
      }
  });
});
