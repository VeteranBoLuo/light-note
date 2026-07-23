import { describe, expect, it } from 'vitest';
import { decodeOffsetCursor, encodeOffsetCursor, normalizePageLimit } from './pageCursor.js';

describe('pageCursor', () => {
  it('编码后的游标只能在同一列表范围内恢复', () => {
    const cursor = encodeOffsetCursor('todos', 20);
    expect(decodeOffsetCursor(cursor, 'todos')).toBe(20);
    expect(() => decodeOffsetCursor(cursor, 'inbox')).toThrow('查询游标无效');
  });

  it('拒绝篡改、超长和超大 offset 的游标', () => {
    expect(() => decodeOffsetCursor('not-base64', 'todos')).toThrow('查询游标无效');
    expect(() => decodeOffsetCursor('x'.repeat(257), 'todos')).toThrow('查询游标无效');
    expect(() => decodeOffsetCursor(encodeOffsetCursor('todos', 10_001), 'todos')).toThrow('查询游标无效');
  });

  it('限制 Service 层列表条数，异常值回退安全默认值', () => {
    expect(normalizePageLimit(999, { defaultLimit: 20, maxLimit: 50 })).toBe(50);
    expect(normalizePageLimit(0, { defaultLimit: 20, maxLimit: 50 })).toBe(1);
    expect(normalizePageLimit('bad', { defaultLimit: 20, maxLimit: 50 })).toBe(20);
  });
});
