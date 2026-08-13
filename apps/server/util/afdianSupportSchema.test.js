import { describe, expect, it, vi } from 'vitest';
import { AFDIAN_SUPPORT_TABLE_SQL, ensureAfdianSupportSchema } from './afdianSupportSchema.js';

describe('爱发电支持模块 Schema', () => {
  it('启动期幂等创建三张职责单一的数据表', async () => {
    const db = { query: vi.fn().mockResolvedValue([[], []]) };
    await ensureAfdianSupportSchema({ db });
    expect(db.query).toHaveBeenCalledTimes(3);
    expect(AFDIAN_SUPPORT_TABLE_SQL.join('\n')).toContain('UNIQUE KEY uk_support_order_provider (provider_order_no)');
    expect(AFDIAN_SUPPORT_TABLE_SQL.join('\n')).toContain('UNIQUE KEY uk_support_checkout_token (token_hash)');
    expect(AFDIAN_SUPPORT_TABLE_SQL.join('\n')).not.toMatch(/client_secret|api_token/i);
  });
});
