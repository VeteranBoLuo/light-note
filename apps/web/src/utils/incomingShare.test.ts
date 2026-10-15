import { describe, expect, it } from 'vitest';
import {
  buildIncomingShareText,
  buildQuickCaptureShareDraft,
  INCOMING_SHARE_MAX_FILES,
  parseIncomingShareManifest,
  resolveShareBookmarkName,
} from './incomingShare';

const id = 'b'.repeat(32);

describe('incomingShare', () => {
  it('校验原生清单：编号格式不对或不是对象时视为没有分享', () => {
    expect(parseIncomingShareManifest(null)).toBeNull();
    expect(parseIncomingShareManifest({ id: '../../etc' })).toBeNull();
    expect(parseIncomingShareManifest({ id: 'B'.repeat(32) })).toBeNull();
  });

  it('只保留合法文件条目，超出上限的部分计入跳过数', () => {
    const files = Array.from({ length: INCOMING_SHARE_MAX_FILES + 2 }, (_, index) => ({
      index,
      name: `${index}.png`,
      mimeType: 'image/png',
      size: 10,
    }));
    const manifest = parseIncomingShareManifest({
      id,
      text: '正文',
      subject: '标题',
      textTruncated: true,
      skippedFiles: 1,
      files: [...files.slice(0, 2), { index: -1, name: 'bad' }, { index: 3, name: '' }, ...files.slice(2)],
    });
    expect(manifest?.files.map((file) => file.name)).toEqual(
      Array.from({ length: INCOMING_SHARE_MAX_FILES - 2 }, (_, index) => `${index}.png`),
    );
    expect(manifest?.skippedFiles).toBe(1 + 4);
    expect(manifest?.textTruncated).toBe(true);
  });

  it('合并标题与正文时不重复已有标题', () => {
    expect(buildIncomingShareText('示例文章', 'https://example.com/a')).toBe('示例文章\nhttps://example.com/a');
    expect(buildIncomingShareText('示例文章', '示例文章 https://example.com/a')).toBe('示例文章 https://example.com/a');
    expect(buildIncomingShareText('', '  只有正文  ')).toBe('只有正文');
    expect(buildIncomingShareText('只有标题', '')).toBe('只有标题');
  });

  it('分享标题本身是网址或为空时不作为书签名称', () => {
    expect(resolveShareBookmarkName('  示例\n文章 ')).toBe('示例 文章');
    expect(resolveShareBookmarkName('https://example.com/a')).toBe('');
    expect(resolveShareBookmarkName('')).toBe('');
    expect(resolveShareBookmarkName('长'.repeat(300))).toHaveLength(200);
  });

  it('草稿合并原生跳过数与网页读取失败数', () => {
    const manifest = parseIncomingShareManifest({ id, text: 'https://example.com', subject: '标题', skippedFiles: 1, files: [] })!;
    const file = new File(['x'], 'a.txt');
    expect(buildQuickCaptureShareDraft(manifest, [file], 2)).toEqual({
      id,
      text: '标题\nhttps://example.com',
      files: [file],
      bookmarkName: '标题',
      skippedFiles: 3,
      textTruncated: false,
    });
  });
});
