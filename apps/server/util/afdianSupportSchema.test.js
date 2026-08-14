import { describe, expect, it, vi } from 'vitest';
import { AFDIAN_SUPPORT_TABLE_SQL, ensureAfdianSupportSchema } from './afdianSupportSchema.js';

describe('爱发电支持模块 Schema', () => {
  it('启动期幂等创建四张职责单一的数据表并兼容补齐旧表字段', async () => {
    const db = {
      query: vi.fn(async (sql) => {
        if (String(sql).includes('information_schema')) return [[{ exists: 1 }], []];
        return [[], []];
      }),
    };
    await ensureAfdianSupportSchema({ db });
    expect(db.query).toHaveBeenCalledTimes(9);
    expect(AFDIAN_SUPPORT_TABLE_SQL.join('\n')).toContain('UNIQUE KEY uk_support_order_provider (provider_order_no)');
    expect(AFDIAN_SUPPORT_TABLE_SQL.join('\n')).toContain('UNIQUE KEY uk_support_checkout_token (token_hash)');
    expect(AFDIAN_SUPPORT_TABLE_SQL.join('\n')).toContain('CREATE TABLE IF NOT EXISTS support_public_preferences');
    expect(AFDIAN_SUPPORT_TABLE_SQL.join('\n')).toContain('ranking_observed_at datetime DEFAULT NULL');
    expect(AFDIAN_SUPPORT_TABLE_SQL.join('\n')).not.toMatch(/client_secret|api_token/i);
  });

  it('旧表缺列或索引时仅补齐缺失结构', async () => {
    const db = { query: vi.fn().mockResolvedValue([[], []]) };
    await ensureAfdianSupportSchema({ db });
    const sql = db.query.mock.calls.map(([statement]) => String(statement)).join('\n');
    expect(sql).toContain('ADD COLUMN provider_name');
    expect(sql).toContain('ADD COLUMN ranking_observed_at');
    expect(sql).toContain('ADD KEY idx_support_order_ranking');
  });
});
