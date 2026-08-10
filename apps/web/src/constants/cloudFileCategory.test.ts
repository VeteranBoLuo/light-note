import { describe, expect, it, vi } from 'vitest';
import {
  getCloudFileCategory,
  getCloudMediaMimeType,
  getCloudMediaPlaybackSupport,
  getCloudPreviewType,
  isHtmlFile,
  isLegacyOfficeFile,
} from './cloudFileCategory';

describe('cloudFileCategory preview compatibility', () => {
  it.each([
    ['legacy.doc', 'application/msword'],
    ['legacy.xls', 'application/vnd.ms-excel'],
    ['legacy.ppt', 'application/vnd.ms-powerpoint'],
  ])('旧版 Office 文件 %s 进入服务端 PDF 转换预览', (fileName, fileType) => {
    const file = { fileName, fileType };
    expect(isLegacyOfficeFile(file)).toBe(true);
    expect(getCloudPreviewType(file)).toBe('converted-pdf');
  });

  it.each([
    ['document.rtf', 'application/rtf'],
    ['document.odt', 'application/vnd.oasis.opendocument.text'],
    ['sheet.ods', 'application/vnd.oasis.opendocument.spreadsheet'],
    ['slides.odp', 'application/vnd.oasis.opendocument.presentation'],
  ])('ODF/RTF 文件 %s 进入服务端 PDF 转换预览', (fileName, fileType) => {
    expect(getCloudPreviewType({ fileName, fileType })).toBe('converted-pdf');
  });

  it.each(['zip', 'rar', '7z', 'tar', 'tgz', 'tbz2', 'txz', 'gz', 'bz2', 'xz'])('压缩文件 .%s 进入目录预览', (ext) => {
    expect(getCloudPreviewType({ fileName: `archive.${ext}`, fileType: 'application/octet-stream' })).toBe('archive');
  });

  it('未知压缩格式仍保持不可预览，不因 compress 分类误进入派生任务', () => {
    expect(getCloudPreviewType({ fileName: 'archive.cab', category: 'compress' })).toBe('unsupported');
  });

  it.each([
    ['modern.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'word'],
    ['modern.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'excel'],
    ['modern.pptx', 'application/vnd.openxmlformats-officedocument.presentationml.presentation', 'ppt'],
  ])('新版 Office 文件 %s 继续使用本地渲染器', (fileName, fileType, previewType) => {
    const file = { fileName, fileType, category: previewType };
    expect(isLegacyOfficeFile(file)).toBe(false);
    expect(getCloudPreviewType(file)).toBe(previewType);
  });

  it('文件扩展名优先于错误的旧版 MIME，避免把 docx 误判成 doc', () => {
    const file = { fileName: 'report.docx', fileType: 'application/msword', category: 'word' };
    expect(isLegacyOfficeFile(file)).toBe(false);
    expect(getCloudPreviewType(file)).toBe('word');
  });

  it.each([
    ['interactive.html', 'application/octet-stream'],
    ['interactive.htm', 'text/plain'],
    ['无扩展名', 'text/html'],
  ])('HTML 文件 %s 进入独立交互预览', (fileName, fileType) => {
    const file = { fileName, fileType, category: 'text' };
    expect(isHtmlFile(file)).toBe(true);
    expect(getCloudPreviewType(file)).toBe('html');
  });

  it('非 HTML 扩展名优先，避免仅因错误 MIME 执行普通文本', () => {
    const file = { fileName: 'readme.txt', fileType: 'text/html', category: 'text' };
    expect(isHtmlFile(file)).toBe(false);
    expect(getCloudPreviewType(file)).toBe('text');
  });

  it.each(['py', 'java', 'go', 'rs', 'cpp', 'sql', 'sh', 'vue', 'toml', 'ini', 'tsv', 'jsonl', 'srt', 'vtt', 'ics', 'diff'])(
    '源码或配置文件 .%s 可以进入文本预览',
    (ext) => {
      const file = { fileName: `source.${ext}`, fileType: 'application/octet-stream' };
      expect(getCloudFileCategory(file)).toBe('text');
      expect(getCloudPreviewType(file)).toBe('text');
    },
  );

  it.each([
    ['clip.mp4', 'video/mp4', 'video/mp4'],
    ['clip.webm', 'application/octet-stream', 'video/webm'],
    ['voice.m4a', 'application/octet-stream', 'audio/mp4'],
    ['voice.opus', 'application/octet-stream', 'audio/ogg; codecs=opus'],
  ])('为媒体文件 %s 解析浏览器能力检测所需 MIME', (fileName, fileType, expectedMime) => {
    expect(getCloudMediaMimeType({ fileName, fileType })).toBe(expectedMime);
  });

  it('使用 canPlayType 区分浏览器可播放与仅可下载的格式', () => {
    const supported = vi.fn((mimeType: string) => (mimeType === 'video/mp4' ? 'probably' : ''));
    expect(getCloudMediaPlaybackSupport({ fileName: 'clip.mp4' }, supported)).toBe('supported');
    expect(getCloudMediaPlaybackSupport({ fileName: 'legacy.avi' }, supported)).toBe('unsupported');
    expect(getCloudMediaPlaybackSupport({ fileName: 'unknown.video' }, supported)).toBe('unknown');
  });
});
