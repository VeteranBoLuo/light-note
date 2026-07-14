import { describe, expect, it } from 'vitest';
import {
  buildCaptureFileMeta,
  buildMarkdownNotePayload,
  detectInboxCaptureType,
  normalizeCaptureUrl,
} from './inboxCapture';

describe('inboxCapture', () => {
  it('只把完整 http(s) 地址识别为书签并为域名补协议', () => {
    expect(normalizeCaptureUrl('example.com/path')?.href).toBe('https://example.com/path');
    expect(normalizeCaptureUrl('https://boluo66.top')?.protocol).toBe('https:');
    expect(normalizeCaptureUrl('javascript:alert(1)')).toBeNull();
    expect(normalizeCaptureUrl('这是一段普通文字')).toBeNull();
  });

  it('文件优先于网址，普通文本识别为 Markdown 笔记', () => {
    const file = new File(['demo'], 'demo.txt', { type: 'text/plain' });
    expect(detectInboxCaptureType('https://example.com', [file])).toBe('file');
    expect(detectInboxCaptureType('https://example.com')).toBe('bookmark');
    expect(detectInboxCaptureType('# 随手记录')).toBe('note');
  });

  it('Markdown 笔记保留原文并从首个非空行生成安全短标题', () => {
    const payload = buildMarkdownNotePayload('\n## **今天的想法**\n- 保留正文', '未命名笔记');
    expect(payload).toEqual({
      title: '今天的想法',
      content: '\n## **今天的想法**\n- 保留正文',
      type: 'markdown',
    });
    expect(buildMarkdownNotePayload('   ', '未命名笔记').title).toBe('未命名笔记');
  });

  it('文件元数据只包含确认上传所需字段', () => {
    const files = [new File(['abc'], '中文.txt', { type: 'text/plain' })];
    expect(buildCaptureFileMeta(files)).toEqual([
      { fileName: '中文.txt', fileType: 'text/plain', fileSize: 3 },
    ]);
  });
});
