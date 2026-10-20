import { describe, expect, it } from 'vitest';
import {
  buildIncomingShareText,
  buildQuickCaptureShareDraft,
  INCOMING_SHARE_MAX_FILES,
  INCOMING_SHARE_MAX_BYTES,
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
      limits: { files: 100, bytes: 500 * 1024 * 1024 },
      text: '正文',
      subject: '标题',
      textTruncated: true,
      skippedFiles: 1,
      files: [...files.slice(0, 2), { index: -1, name: 'bad' }, { index: 3, name: '' }, ...files.slice(2)],
    });
    expect(manifest?.files.map((file) => file.name)).toEqual(
      Array.from({ length: INCOMING_SHARE_MAX_FILES - 2 }, (_, index) => `${index}.png`),
    );
    expect(manifest?.skippedFiles).toBe(1 + 4 + 2);
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

  it('草稿保留清单中的跳过原因与文件来源', () => {
    const manifest = parseIncomingShareManifest({
      id,
      limits: { files: 20, bytes: 200 * 1024 * 1024 },
      text: 'https://example.com',
      subject: '标题',
      skippedFiles: 1,
      files: [],
    })!;
    const file = new File(['x'], 'a.txt');
    expect(buildQuickCaptureShareDraft(manifest, [file])).toEqual({
      id,
      limits: { files: 20, bytes: 200 * 1024 * 1024 },
      text: '标题\nhttps://example.com',
      files: [file],
      bookmarkName: '标题',
      skippedFiles: 1,
      skippedFileCounts: { count_limit: 0, size_limit: 0, unreadable: 0, unknown: 1 },
      skippedFileDetails: [],
      textTruncated: false,
    });
  });
});

describe('分享数量与大小边界', () => {
  const entry = (index: number, size: number) => ({ index, name: `${index}.jpg`, mimeType: 'image/jpeg', size });
  it('完整接收 100 个、共 500MiB，第 101 个报告超数量', () => {
    const files = Array.from({ length: 101 }, (_, i) => entry(i, 5 * 1024 * 1024));
    const result = parseIncomingShareManifest({ id, files })!;
    expect(result.files).toHaveLength(100);
    expect(result.files.at(-1)?.index).toBe(99);
    expect(result.files.reduce((sum, file) => sum + file.size, 0)).toBe(INCOMING_SHARE_MAX_BYTES);
    expect(result.skippedFileCounts).toMatchObject({ count_limit: 1, size_limit: 0 });
    expect(result.skippedFileDetails).toContainEqual({ name: '100.jpg', reason: 'count_limit' });
  });
  it('超出总量一字节只排除该文件，后续能放下的文件仍保留', () => {
    const result = parseIncomingShareManifest({
      id,
      files: [entry(0, INCOMING_SHARE_MAX_BYTES - 2), entry(1, 3), entry(2, 2)],
    })!;
    expect(result.files.map((file) => file.index)).toEqual([0, 2]);
    expect(result.skippedFileCounts?.size_limit).toBe(1);
  });
  it('保留原生原因及明细，旧版仅有跳过总数时不猜测原因', () => {
    const result = parseIncomingShareManifest({
      id,
      skippedFiles: 4,
      skippedFileCounts: { count_limit: 2, unreadable: 1 },
      skippedFileDetails: [{ name: 'bad.jpg', reason: 'unreadable' }],
      files: [],
    })!;
    expect(result.skippedFileCounts).toEqual({ count_limit: 2, size_limit: 0, unreadable: 1, unknown: 1 });
    expect(result.skippedFiles).toBe(4);
    expect(result.skippedFileDetails).toEqual([{ name: 'bad.jpg', reason: 'unreadable' }]);
  });
  it('重复或无效索引不会产生重复读取', () => {
    const result = parseIncomingShareManifest({ id, files: [entry(0, 1), entry(0, 1), entry(100, 1)] })!;
    expect(result.files).toHaveLength(1);
    expect(result.skippedFileCounts?.unreadable).toBe(2);
  });
});
