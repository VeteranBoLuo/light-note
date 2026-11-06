import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getConnection: vi.fn(),
  query: vi.fn(),
  getStatusForUser: vi.fn(),
  creditAiBonusTokens: vi.fn(),
}));

vi.mock('../db/index.js', () => ({ default: { getConnection: mocks.getConnection, query: mocks.query } }));
vi.mock('./aiBonusWallet.js', () => ({ creditAiBonusTokens: mocks.creditAiBonusTokens }));
vi.mock('./aiQuota.js', () => ({ getStatusForUser: mocks.getStatusForUser }));

import { useItem, getInventory } from './items.js';
afterEach(() => vi.unstubAllEnvs());

describe('历史 AI 加油包迁移', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('消耗背包道具后通过统一钱包转入永久额度', async () => {
    const connection = {
      beginTransaction: vi.fn(),
      query: vi
        .fn()
        .mockResolvedValueOnce([[{ qty: 1 }]])
        .mockResolvedValueOnce([{ affectedRows: 1 }]),
      commit: vi.fn(),
      rollback: vi.fn(),
      release: vi.fn(),
    };
    mocks.getConnection.mockResolvedValue(connection);
    mocks.creditAiBonusTokens.mockResolvedValue({ replayed: false, amountTokens: 600_000 });

    await expect(useItem('user-1', 'ai_pack')).resolves.toEqual({
      ok: true,
      itemId: 'ai_pack',
      remaining: 0,
      effect: 'ai_tokens',
      amount: 600_000,
    });
    expect(mocks.creditAiBonusTokens).toHaveBeenCalledWith(
      connection,
      expect.objectContaining({
        userId: 'user-1',
        amountTokens: 600_000,
        sourceType: 'legacy_item',
        sourceRef: 'ai_pack',
        idempotencyKey: expect.stringMatching(/^legacy-item:[0-9a-f-]+:ai$/),
        policyVersion: 'legacy-item-v1',
      }),
    );
    expect(connection.commit).toHaveBeenCalledOnce();
    expect(connection.rollback).not.toHaveBeenCalled();
    expect(connection.release).toHaveBeenCalledOnce();
  });

  it('新模式背包余额与统一额度快照一致，包含在途预留且不发放赠礼', async () => {
    vi.stubEnv('AI_DAILY_QUOTA_MODE', 'off');
    mocks.query.mockResolvedValueOnce([[]]).mockResolvedValueOnce([[{ ai_bonus_tokens: 790000 }]]);
    mocks.getStatusForUser.mockResolvedValue({ bonusTokens: 810000, availableRemaining: 790000 });
    expect(await getInventory('user-1')).toMatchObject({ billingMode: 'permanent_only', assets: { aiBonusTokens: 810000 } });
    expect(mocks.creditAiBonusTokens).not.toHaveBeenCalled();
  });
});
