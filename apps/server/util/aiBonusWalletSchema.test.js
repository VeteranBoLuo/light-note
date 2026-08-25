import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import {
  AI_BONUS_WALLET_BASELINE_SQL,
  AI_BONUS_WALLET_TABLE_SQL,
  ensureAiBonusWalletSchema,
} from './aiBonusWalletSchema.js';

const migrationUrl = new URL('../migrations/20260825_ai_bonus_wallet_and_afdian_rewards.sql', import.meta.url);
const assertionsUrl = new URL('../migrations/schema-assertions.sql', import.meta.url);

describe('永久 AI 额度钱包 Schema', () => {
  it('启动期创建流水、来源批次与扣减分摊，并只登记一次既有余额期初事实', async () => {
    const connection = {
      beginTransaction: vi.fn(),
      query: vi
        .fn()
        .mockResolvedValueOnce([{ affectedRows: 1 }, []])
        .mockResolvedValueOnce([[{ baseline_completed_at: null }], []])
        .mockResolvedValueOnce([{ affectedRows: 2 }, []])
        .mockResolvedValueOnce([{ affectedRows: 2 }, []])
        .mockResolvedValueOnce([{ affectedRows: 1 }, []]),
      commit: vi.fn(),
      rollback: vi.fn(),
      release: vi.fn(),
    };
    const db = {
      query: vi.fn().mockResolvedValue([[], []]),
      getConnection: vi.fn().mockResolvedValue(connection),
    };
    await ensureAiBonusWalletSchema({ db });

    expect(db.query).toHaveBeenCalledTimes(4);
    expect(AI_BONUS_WALLET_TABLE_SQL.join('\n')).toContain('UNIQUE KEY uk_ai_bonus_ledger_idempotency');
    expect(AI_BONUS_WALLET_TABLE_SQL.join('\n')).toContain('idx_ai_bonus_allocation_user_time');
    expect(AI_BONUS_WALLET_TABLE_SQL.join('\n')).toContain('ai_bonus_wallet_state');
    expect(AI_BONUS_WALLET_BASELINE_SQL.join('\n')).toContain("source_type = 'legacy_baseline'");
    expect(AI_BONUS_WALLET_BASELINE_SQL.join('\n')).toContain('baseline_completed_at IS NULL');
    expect(AI_BONUS_WALLET_BASELINE_SQL.join('\n')).toContain('NOT EXISTS');
    expect(AI_BONUS_WALLET_BASELINE_SQL.join('\n')).not.toContain('UPDATE user_growth');
    expect(connection.commit).toHaveBeenCalledOnce();
    expect(connection.rollback).not.toHaveBeenCalled();
    expect(connection.release).toHaveBeenCalledOnce();
  });

  it('期初登记已经完成时重启不会重新扫描用户余额', async () => {
    const connection = {
      beginTransaction: vi.fn(),
      query: vi
        .fn()
        .mockResolvedValueOnce([{ affectedRows: 0 }, []])
        .mockResolvedValueOnce([[{ baseline_completed_at: new Date('2026-08-25T00:00:00Z') }], []]),
      commit: vi.fn(),
      rollback: vi.fn(),
      release: vi.fn(),
    };
    const db = {
      query: vi.fn().mockResolvedValue([[], []]),
      getConnection: vi.fn().mockResolvedValue(connection),
    };

    await ensureAiBonusWalletSchema({ db });

    expect(connection.query).toHaveBeenCalledTimes(2);
    expect(connection.query.mock.calls.some(([sql]) => String(sql).includes('FROM user_growth'))).toBe(false);
    expect(connection.commit).toHaveBeenCalledOnce();
  });

  it('显式迁移也用全局完成状态锁住一次性期初窗口', async () => {
    const source = await readFile(fileURLToPath(migrationUrl), 'utf8');

    expect(source).toContain('CREATE TABLE IF NOT EXISTS `ai_bonus_wallet_state`');
    expect(source).toContain('FOR UPDATE;');
    expect(source).toContain('SET @ai_bonus_baseline_pending');
    expect(source).toContain('AND NOT EXISTS (');
    expect(source).toContain('SET `baseline_completed_at`=NOW()');
    expect(source).not.toContain('UPDATE user_growth SET ai_bonus_tokens');
  });

  it('迁移把历史 root 虚拟满级固化为真实可审计等级', async () => {
    const [source, assertions] = await Promise.all([
      readFile(fileURLToPath(migrationUrl), 'utf8'),
      readFile(fileURLToPath(assertionsUrl), 'utf8'),
    ]);

    expect(source).toContain("'root-level-materialization-v1'");
    expect(source).toContain("JSON_OBJECT('policyVersion', 'root-real-rank-v1'");
    expect(source).toContain("VALUES ('root-real-rank-v1', NULL)");
    expect(source).toContain('SET @root_rank_materialization_pending');
    expect(source).toContain('WHERE @root_rank_materialization_pending=1');
    expect(source).toContain("AND u.role = 'root'");
    expect(source).toContain('SELECT u.id, 50000, 15, 15');
    expect(source).toContain('`exp` = GREATEST(`exp`, VALUES(`exp`))');
    expect(source).toContain('`last_notified_level` = GREATEST');
    expect(source).toContain("WHERE `policy_version`='root-real-rank-v1'");
    expect(assertions).toContain('root_rank_materialization_not_completed');
    expect(assertions).toContain('invalid_materialized_root_rank');
  });
});
