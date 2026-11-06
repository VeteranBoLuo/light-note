import { describe, expect, it } from 'vitest';
import { nextTodayCollapsed, readTodayCollapsed, rememberTodayCollapsed } from './workbenchTodayLayout';

describe('今日待处理卡片收起规则', () => {
  it('有待处理时立即展开，不论当前是否收起', () => {
    expect(nextTodayCollapsed(true, true, false)).toBe(false);
    expect(nextTodayCollapsed(true, true, true)).toBe(false);
  });

  it('处理完最后一条的静默刷新保留卡片，完整加载时才收起', () => {
    expect(nextTodayCollapsed(false, false, false)).toBe(false);
    expect(nextTodayCollapsed(false, false, true)).toBe(true);
    expect(nextTodayCollapsed(true, false, false)).toBe(true);
  });

  it('按账号记住上次判断，未记录的账号默认展开', () => {
    expect(readTodayCollapsed('user-a|user||')).toBe(false);
    rememberTodayCollapsed('user-a|user||', true);
    expect(readTodayCollapsed('user-a|user||')).toBe(true);
    expect(readTodayCollapsed('user-b|user||')).toBe(false);
  });
});
