import { describe, expect, it } from 'vitest';
import { formatTodoDueAt, normalizeTodoLocale } from './todoDateFormat.js';

describe('todoDateFormat', () => {
  it('以中文日常格式展示墙上时间，并保留星期', () => {
    expect(formatTodoDueAt('2026-07-30 09:00:00', 'zh-CN')).toBe('2026年7月30日（周四）09:00');
  });

  it('英文偏好使用常见的星期、月份和 12 小时制格式', () => {
    expect(formatTodoDueAt('2026-07-30 09:00:00', 'en-US')).toBe('Thu, Jul 30, 2026, 9:00 AM');
    expect(formatTodoDueAt('2026-07-30 18:05:00', 'en-US')).toBe('Thu, Jul 30, 2026, 6:05 PM');
  });

  it('兼容数据库返回的 Date，并拒绝非法输入', () => {
    expect(formatTodoDueAt(new Date(2026, 6, 30, 9, 0), 'zh-CN')).toBe('2026年7月30日（周四）09:00');
    expect(formatTodoDueAt('not-a-date', 'zh-CN')).toBe('');
    expect(formatTodoDueAt(null, 'zh-CN')).toBe('');
  });

  it('未知语言回退中文，英文前缀归一为 en-US', () => {
    expect(normalizeTodoLocale('en')).toBe('en-US');
    expect(normalizeTodoLocale('fr-FR')).toBe('zh-CN');
  });
});
