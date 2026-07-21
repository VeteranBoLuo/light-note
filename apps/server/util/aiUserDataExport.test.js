import { describe, expect, it, vi } from 'vitest';
import { exportAiUserData } from './aiUserDataExport.js';

function databaseWith(handler) {
  return { query: vi.fn(handler) };
}

describe('exportAiUserData', () => {
  it('按数据主体导出 AI 数据并解析 JSON 字段', async () => {
    const database = databaseWith(async (sql, params) => {
      expect(params).toEqual(['user-1']);
      if (String(sql).includes('FROM ai_conversations')) {
        return [[{ id: 'c-1', scope_json: '{"type":"note"}' }]];
      }
      if (String(sql).includes('FROM ai_memories')) {
        return [[{ id: 'm-1', scope_json: { type: 'global' } }]];
      }
      return [[]];
    });

    const result = await exportAiUserData('user-1', database);

    expect(result.scope).toBe('subject_user');
    expect(result.conversations[0].scope_json).toEqual({ type: 'note' });
    expect(result.memories[0].scope_json).toEqual({ type: 'global' });
    expect(result.counts.conversations).toBe(1);
    expect(result.unavailable).toEqual([]);
    expect(database.query).toHaveBeenCalledTimes(11);
  });

  it('迁移尚未执行时只标记对应数据集不可用，不阻断账号数据导出', async () => {
    const database = databaseWith(async (sql) => {
      if (String(sql).includes('ai_product_events')) {
        const error = new Error('missing');
        error.code = 'ER_NO_SUCH_TABLE';
        throw error;
      }
      return [[]];
    });

    const result = await exportAiUserData('user-1', database);

    expect(result.unavailable).toEqual(['productEvents']);
    expect(result.productEvents).toEqual([]);
  });

  it('数据库异常不会被误判为缺表', async () => {
    const database = databaseWith(async () => {
      const error = new Error('offline');
      error.code = 'ECONNREFUSED';
      throw error;
    });

    await expect(exportAiUserData('user-1', database)).rejects.toMatchObject({ code: 'ECONNREFUSED' });
  });
});
