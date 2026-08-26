import { describe, expect, it, vi } from 'vitest';
import { AFDIAN_SUPPORT_REWARD_TABLE_SQL, ensureAfdianSupportRewardSchema } from './afdianSupportRewardSchema.js';

describe('爱发电永久 AI 赠送 Schema', () => {
  it('首次启用时间不可被重启移动，同策略版本配置漂移时失败关闭', async () => {
    const db = {
      query: vi.fn(async (sql, params = []) => {
        if (String(sql).includes('SELECT tokens_per_cny')) {
          return params[0] === 'support-pure-v2'
            ? [[{ tokens_per_cny: 0, auto_credit_max_amount: '0.00' }], []]
            : [[{ tokens_per_cny: 100_000, auto_credit_max_amount: '200.00' }], []];
        }
        return [[], []];
      }),
    };
    await ensureAfdianSupportRewardSchema({ db });
    expect(db.query).toHaveBeenCalledTimes(6);
    expect(AFDIAN_SUPPORT_REWARD_TABLE_SQL.join('\n')).toContain('UNIQUE KEY uk_support_reward_order');
    expect(String(db.query.mock.calls[2][0])).toContain('INSERT IGNORE INTO support_reward_policy_state');
    expect(db.query.mock.calls[4][1]).toEqual(['support-pure-v2', 0, 0]);

    const conflictDb = {
      query: vi.fn(async (sql) => {
        if (String(sql).includes('SELECT tokens_per_cny')) {
          return [[{ tokens_per_cny: 50_000, auto_credit_max_amount: '200.00' }], []];
        }
        return [[], []];
      }),
    };
    await expect(ensureAfdianSupportRewardSchema({ db: conflictDb })).rejects.toMatchObject({
      code: 'AFDIAN_REWARD_POLICY_VERSION_CONFLICT',
    });
  });
});
