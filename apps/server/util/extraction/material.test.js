import { describe, it, expect, vi } from 'vitest';
import { readMaterial } from './material.js';
const reference = { type: 'note', id: 'n', version: 'v1' };
const resolveVersions = vi.fn(async ({ resourceRefs }) => resourceRefs);
const db = (row) => ({ query: vi.fn(async () => [[row]]) });
describe('完整提取材料准备', () => {
  it('富文本保留横表结构与原文，不产生视觉描述', async () => {
    const database = db({
      title: '横表',
      type: 'html',
      content:
        '<table><thead><tr><th>参数</th><th>产品甲</th><th>产品乙</th></tr></thead><tbody><tr><td>重量</td><td>3 g</td><td>4 g</td></tr></tbody></table>',
    });
    const source = await readMaterial({ userId: 'u', ref: reference, id: 's', database }, { resolveVersions });
    expect(source.segments[0].text).toContain('| 产品甲 | 产品乙 |');
    expect(source.segments[0].kind).toBe('original');
    expect(source.segments[0].format).toBe('markdown');
    expect(source.complete).toBe(true);
  });
  it('准备前后校验版本，拒绝读取中途发生变化的内容', async () => {
    const resolve = vi
      .fn()
      .mockResolvedValueOnce([reference])
      .mockResolvedValueOnce([{ ...reference, version: 'v2' }]);
    await expect(
      readMaterial(
        { userId: 'u', ref: reference, id: 's', database: db({ title: 'A', type: 'markdown', content: '正文' }) },
        { resolveVersions: resolve },
      ),
    ).rejects.toMatchObject({ code: 'EXTRACTION_SOURCE_CHANGED' });
  });
  it('无正文与手绘笔记逐项给原因', async () => {
    await expect(
      readMaterial(
        { userId: 'u', ref: reference, id: 's', database: db({ title: '画', type: 'drawing' }) },
        { resolveVersions },
      ),
    ).rejects.toMatchObject({ code: 'EXTRACTION_DRAWING_UNSUPPORTED' });
    await expect(
      readMaterial(
        {
          userId: 'u',
          ref: { ...reference, type: 'bookmark' },
          id: 's',
          database: db({ name: '网页', content: null }),
        },
        { resolveVersions },
      ),
    ).rejects.toMatchObject({ code: 'EXTRACTION_NO_ARCHIVED_BODY' });
  });
  it('文件使用现有解析器完整分段，OCR 与部分覆盖保持明确身份', async () => {
    const database = db({ file_name: '扫描.pdf', file_type: 'application/pdf', file_size: 3, obs_key: 'owned-key' }),
      download = vi.fn(async () => Buffer.from('pdf'));
    const parse = vi.fn(async (_buffer, _descriptor, options) => {
      expect(options.includeSegments).toBe(true);
      return {
        segments: [{ id: 's1', text: '识别文字', kind: 'ocr', locator: { type: 'page', value: '第 1 页' } }],
        coverage: { complete: false, truncated: false, total: { pages: 2 }, processed: { pages: 1 } },
      };
    });
    const result = await readMaterial(
      { userId: 'u', ref: { ...reference, type: 'file' }, id: 's', database },
      { resolveVersions, metadata: async () => ({ contentLength: 3 }), download, parse },
    );
    expect(result.complete).toBe(false);
    expect(result.segments[0].kind).toBe('ocr');
    expect(result.segments[0].format).toBeUndefined();
    expect(JSON.stringify(result)).not.toContain('owned-key');
    expect(download).toHaveBeenCalledWith('owned-key', { maxBytes: 20 * 1024 * 1024 });
  });
});
