import { describe, it, expect, vi } from 'vitest';

// common.js 顶部会 import 所有 router(→ handler → db/index.js,import 时会连库)。
// mock db 连接池,避免测试连真实数据库、避免遗留连接导致进程不退出。
vi.mock('../db/index.js', () => ({
  default: { query: vi.fn().mockResolvedValue([[]]), getConnection: vi.fn() },
}));

const { generateUUID, insertData, snakeCaseKeys, mergeExistingProperties, resultData } = await import('./common.js');

describe('generateUUID', () => {
  it('生成 8-4-4-4-12 的 UUID 格式', () => {
    expect(generateUUID()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  });
  it('多次生成互不相等', () => {
    expect(generateUUID()).not.toBe(generateUUID());
  });
});

describe('insertData', () => {
  it('未传 id 时自动注入 UUID,并整体转 snake_case', () => {
    const d = insertData({ userId: 'u1', tagName: 'x' });
    expect(d.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    expect(d.user_id).toBe('u1');
    expect(d.tag_name).toBe('x');
  });
  it('保留调用方传入的非空 id(前端自带 UUID 回填方案的前提)', () => {
    expect(insertData({ id: 'fixed-id', name: 'x' }).id).toBe('fixed-id');
  });
  it('空串 id 视为未传,重新生成', () => {
    const d = insertData({ id: '', name: 'x' });
    expect(d.id).not.toBe('');
    expect(d.id.length).toBe(36);
  });
});

describe('snakeCaseKeys', () => {
  it('驼峰转下划线,递归数组与嵌套对象', () => {
    expect(snakeCaseKeys({ userId: 1, relatedTag: [{ tagId: 2 }] })).toEqual({
      user_id: 1,
      related_tag: [{ tag_id: 2 }],
    });
  });
  it('null / undefined 原样返回', () => {
    expect(snakeCaseKeys(null)).toBe(null);
    expect(snakeCaseKeys(undefined)).toBe(undefined);
  });
});

describe('mergeExistingProperties', () => {
  it('过滤 undefined、空串、空数组值', () => {
    const r = mergeExistingProperties({ a: 1, b: undefined, c: '', d: [] }, [undefined, '', []], []);
    expect(r).toEqual({ a: 1 });
  });
  it('过滤 outKey 指定的键', () => {
    const r = mergeExistingProperties({ a: 1, secret: 2 }, [undefined], ['secret']);
    expect(r).toEqual({ a: 1 });
  });
});

describe('resultData', () => {
  it('data 自动 camelCase,带 status / msg', () => {
    expect(resultData({ user_id: 1 }, 200, 'ok')).toEqual({ data: { userId: 1 }, status: 200, msg: 'ok' });
  });
  it('默认 status=200、msg=空', () => {
    expect(resultData(null)).toEqual({ data: null, status: 200, msg: '' });
  });
});
