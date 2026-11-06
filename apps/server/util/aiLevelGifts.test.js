import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AI_LEVEL_GIFT_VERSIONS, levelGiftEntitlement, levelGiftSchedule } from './growth.js';
import { ensureLevelGifts, grantOutstandingLevelGifts } from './aiLevelGifts.js';
import { creditAiBonusTokens } from './aiBonusWallet.js';

vi.mock('./aiBonusWallet.js', () => ({ creditAiBonusTokens: vi.fn() }));

function fixture({
  role = 'user',
  flag = '0',
  exp = 0,
  restrictions = [],
  paused = null,
  created = new Date('2026-11-01T00:00:00Z'),
  registration = null,
} = {}) {
  const receipts = new Map();
  const account = { id: 'account', role, del_flag: flag, create_time: created };
  const conn = {
    beginTransaction: vi.fn(),
    commit: vi.fn(),
    rollback: vi.fn(),
    release: vi.fn(),
    query: vi.fn(async (sql) => {
      if (sql.includes('FROM user WHERE')) return [[account]];
      if (sql.includes('FROM ai_level_gift_controls')) return [[{ paused_from: paused }]];
      if (sql.includes('FROM ai_level_gift_registrations')) return [registration ? [registration] : []];
      if (sql.includes('FROM security_account_restrictions')) return [restrictions];
      if (sql.includes('SELECT exp FROM user_growth')) return [[{ exp }]];
      if (sql.includes('FROM ai_bonus_ledger')) return [[...receipts.values()]];
      return [{ affectedRows: 1 }];
    }),
  };
  creditAiBonusTokens.mockImplementation(async (_connection, input) => {
    if (receipts.has(input.idempotencyKey)) throw new Error('duplicate');
    receipts.set(input.idempotencyKey, {
      idempotency_key: input.idempotencyKey,
      entry_type: 'credit',
      source_type: 'level_gift',
      amount_tokens: input.amountTokens,
      policy_version: input.policyVersion,
    });
    return { ledgerId: input.idempotencyKey };
  });
  return { conn, account, receipts };
}

beforeEach(() => {
  vi.stubEnv('AI_LEVEL_GIFT_MODE', 'on');
  vi.clearAllMocks();
});
afterEach(() => vi.unstubAllEnvs());

describe('one-time level gifts', () => {
  it('keeps the approved schedule, later growth acceleration and total independent of wallet balance', () => {
    expect(AI_LEVEL_GIFT_VERSIONS[0].tokens.map((value) => value / 10000)).toEqual([
      12, 8, 9, 10, 12, 14, 16, 18, 22, 26, 32, 40, 50, 65, 85,
    ]);
    expect(levelGiftEntitlement(15).cumulativeTokens).toBe(4_190_000);
    expect(levelGiftEntitlement(5)).toMatchObject({ tokens: 120000, cumulativeTokens: 510000 });
    expect(levelGiftEntitlement(6).tokens).toBe(140000);
  });
  it('locks the whole schedule to registration time, including levels reached after a later version', () => {
    const first = AI_LEVEL_GIFT_VERSIONS[0];
    const second = { ...first, version: 'next', effectiveFrom: '2027-01-01T00:00:00Z' };
    expect(levelGiftSchedule('2026-11-01', [first, second])).toBe(first);
    expect(levelGiftSchedule('2027-01-01', [first, second])).toBe(second);
  });
  it('registration grants 120000 exactly once and ignores current spent/purchased balance', async () => {
    const { conn } = fixture();
    expect(await ensureLevelGifts(conn, 'account')).toMatchObject({ status: 'granted', creditedTokens: 120000 });
    expect(await ensureLevelGifts(conn, 'account')).toMatchObject({ status: 'up_to_date', creditedTokens: 0 });
    expect(creditAiBonusTokens).toHaveBeenCalledTimes(1);
  });
  it('crossing to level five fills all missing levels and subsequent retries add nothing', async () => {
    const { conn, receipts } = fixture({ exp: 2700 });
    for (const level of [1, 2, 3])
      receipts.set(`ai-level-gift:L${level}`, {
        idempotency_key: `ai-level-gift:L${level}`,
        entry_type: 'credit',
        source_type: 'level_gift',
        amount_tokens: AI_LEVEL_GIFT_VERSIONS[0].tokens[level - 1],
        policy_version: AI_LEVEL_GIFT_VERSIONS[0].version,
      });
    expect(await ensureLevelGifts(conn, 'account')).toMatchObject({
      creditedTokens: 220000,
      gifts: [
        { level: 4, amountTokens: 100000 },
        { level: 5, amountTokens: 120000 },
      ],
    });
    expect((await ensureLevelGifts(conn, 'account')).creditedTokens).toBe(0);
  });
  it.each([
    ['root', '0'],
    ['test', '0'],
    ['visitor', '0'],
    ['deleted', '1'],
    ['user', '1'],
  ])('does not gift ineligible role %s / flag %s', async (role, flag) => {
    expect((await ensureLevelGifts(fixture({ role, flag }).conn, 'account')).status).toBe('ineligible');
    expect(creditAiBonusTokens).not.toHaveBeenCalled();
  });
  it('pause holds only accounts registered after the pause, while batch holds cover earlier accounts', async () => {
    const pause = new Date('2026-10-31T00:00:00Z');
    expect((await ensureLevelGifts(fixture({ paused: pause }).conn, 'account')).reason).toBe('new_accounts_paused');
    expect((await ensureLevelGifts(fixture({ paused: new Date('2026-11-02') }).conn, 'account')).creditedTokens).toBe(
      120000,
    );
    const held = fixture({ restrictions: [{ restriction_type: 'gift_hold' }] });
    expect((await ensureLevelGifts(held.conn, 'account')).reason).toBe('gift_hold');
    expect(held.receipts.size).toBe(0);
  });
  it('disabled mode does not query or write anything', async () => {
    vi.stubEnv('AI_LEVEL_GIFT_MODE', 'off');
    const { conn } = fixture();
    expect((await ensureLevelGifts(conn, 'account')).status).toBe('disabled');
    expect(conn.query).not.toHaveBeenCalled();
    const database = { getConnection: vi.fn() };
    expect((await grantOutstandingLevelGifts('account', { database })).status).toBe('disabled');
    expect(database.getConnection).not.toHaveBeenCalled();
  });
  it('holds pending risk checks across every shared gifting entry', async () => {
    const pending = fixture({ registration: { checked_at: null } });
    expect(await ensureLevelGifts(pending.conn, 'account')).toMatchObject({
      status: 'held',
      reason: 'risk_check_pending',
    });
    expect(creditAiBonusTokens).not.toHaveBeenCalled();
    expect(
      (await ensureLevelGifts(fixture({ registration: { checked_at: new Date() } }).conn, 'account')).creditedTokens,
    ).toBe(120000);
  });
  it.each([
    { amount_tokens: 1, policy_version: 'ai-level-gifts-v1' },
    { amount_tokens: 240000, policy_version: 'ai-level-gifts-v1' },
    { amount_tokens: 120000, policy_version: 'unexpected-version' },
  ])('rejects mismatched gift receipts without crediting or changing them: %o', async (receipt) => {
    const { conn, receipts } = fixture();
    receipts.set('ai-level-gift:L1', {
      idempotency_key: 'ai-level-gift:L1',
      entry_type: 'credit',
      source_type: 'level_gift',
      ...receipt,
    });
    await expect(ensureLevelGifts(conn, 'account')).rejects.toMatchObject({ code: 'AI_LEVEL_GIFT_RECEIPT_INVALID' });
    expect(creditAiBonusTokens).not.toHaveBeenCalled();
    expect(receipts.size).toBe(1);
  });
  it('registration side transaction commits valid gifts but rolls back ineligible account placeholders', async () => {
    const valid = fixture();
    await grantOutstandingLevelGifts('account', { database: { getConnection: async () => valid.conn } });
    expect(valid.conn.commit).toHaveBeenCalledOnce();
    const inactive = fixture({ role: 'deleted', flag: '1' });
    await grantOutstandingLevelGifts('account', { database: { getConnection: async () => inactive.conn } });
    expect(inactive.conn.commit).not.toHaveBeenCalled();
    expect(inactive.conn.rollback).toHaveBeenCalledOnce();
  });
});
