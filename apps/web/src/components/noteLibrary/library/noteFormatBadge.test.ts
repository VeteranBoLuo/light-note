import { describe, expect, it } from 'vitest';
import { normalizeNoteType } from '@/utils/noteResourceRefs.ts';

/**
 * 格式胶囊显示什么，取决于 normalizeNoteType 的归一结果。
 * 这里锁住那两个「有意的决定」，而不是重新实现一遍判断：
 *  - 历史值 md 必须算 markdown（老笔记存的是 md）；
 *  - 空值兜底成富文本，与后端 `String(type || 'html')` 同口径。
 * 线上 339 篇 type 全部有值，空值分支只是兜底，但口径必须和后端一致，
 * 否则同一篇笔记在列表显示 MD、打开后按 HTML 渲染。
 */
const badgeText = (type?: string | null) => (normalizeNoteType(type) === 'markdown' ? 'MD' : 'HTML');

describe('笔记格式胶囊的取值口径', () => {
  it('markdown 与历史值 md 都显示 MD', () => {
    expect(badgeText('markdown')).toBe('MD');
    expect(badgeText('md')).toBe('MD');
  });

  it('html 显示 HTML', () => {
    expect(badgeText('html')).toBe('HTML');
  });

  it('空值、缺失、异常值一律按富文本，与后端兜底一致', () => {
    expect(badgeText('')).toBe('HTML');
    expect(badgeText(null)).toBe('HTML');
    expect(badgeText(undefined)).toBe('HTML');
    expect(badgeText('rich-text')).toBe('HTML');
  });

  it('大小写敏感：只认小写 markdown，避免和后端口径分叉', () => {
    // 后端 normalizeNoteType 同样不做 toLowerCase，两边必须一致，
    // 否则 'Markdown' 这种脏数据会在列表和详情页显示成不同格式
    expect(badgeText('Markdown')).toBe('HTML');
    expect(normalizeNoteType('Markdown')).not.toBe('markdown');
  });
});
