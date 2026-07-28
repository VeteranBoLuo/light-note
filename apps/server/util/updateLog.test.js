import { describe, expect, it } from 'vitest';
import {
  extractUpdateLogImageKeys,
  formatDateOnly,
  normalizeLegacyUpdateLogs,
  normalizeUpdateLogInput,
  updateLogImagePublicUrl,
  validateUpdateLogImage,
} from './updateLog.js';

describe('更新日志数据规范化', () => {
  it('兼容旧 config_json 的 label/time/list 结构并按最新在前返回', () => {
    const rows = normalizeLegacyUpdateLogs([
      { label: '<strong>旧版本</strong>', time: '2026-07-01', list: ['修复 A'] },
      { label: '新版本', time: '2026-07-28', list: ['新增 B'] },
    ]);

    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      title: '新版本',
      publishDate: '2026-07-28',
      summary: '',
      highlights: ['新增 B'],
      label: '新版本',
      list: ['新增 B'],
    });
    expect(rows[1].title).toBe('旧版本');
  });

  it('发布状态必须包含正文或重点更新', () => {
    expect(
      normalizeUpdateLogInput({
        title: '版本更新',
        publishDate: '2026-07-28',
        status: 'published',
        highlights: [],
        contentMarkdown: '',
      }),
    ).toEqual({ error: 'EMPTY_PUBLISHED_CONTENT' });
  });

  it('拒绝不存在的日历日期与带尾随垃圾字符的日期', () => {
    expect(formatDateOnly('2026-02-29')).toBe('');
    expect(formatDateOnly('2024-02-29')).toBe('2024-02-29');
    expect(formatDateOnly('2026-07-28T00:00:00.000Z')).toBe('2026-07-28');
    expect(formatDateOnly('2026-07-28-invalid')).toBe('');
  });
});

describe('更新日志 OBS 图片', () => {
  it('只提取当前日志的稳定图片地址并去重', () => {
    const markdown = [
      '![A](/api/updateLog/image/log-1/a.webp)',
      '![A2](/api/updateLog/image/log-1/a.webp)',
      '![B](/api/updateLog/image/log-2/b.webp)',
    ].join('\n');

    expect(extractUpdateLogImageKeys(markdown, 'log-1')).toEqual(['update-logs/log-1/a.webp']);
    expect(updateLogImagePublicUrl('log-1', 'update-logs/log-1/a.webp')).toBe('/api/updateLog/image/log-1/a.webp');
  });

  it('拒绝 SVG、空文件和超过 5MB 的图片', () => {
    expect(validateUpdateLogImage({ mimetype: 'image/svg+xml', size: 100 })).toEqual({
      error: 'IMAGE_TYPE_UNSUPPORTED',
    });
    expect(validateUpdateLogImage({ mimetype: 'image/png', size: 0 })).toEqual({
      error: 'IMAGE_SIZE_INVALID',
    });
    expect(validateUpdateLogImage({ mimetype: 'image/png', size: 6 * 1024 * 1024 })).toEqual({
      error: 'IMAGE_SIZE_INVALID',
    });
  });
});
