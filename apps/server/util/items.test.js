import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getConnection: vi.fn(),
  creditAiBonusTokens: vi.fn(),
}));

vi.mock('../db/index.js', () => ({ default: { getConnection: mocks.getConnection } }));
vi.mock('./aiBonusWallet.js', () => ({ creditAiBonusTokens: mocks.creditAiBonusTokens }));

import { useItem } from './items.js';

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
});
