import { describe, expect, it, vi } from 'vitest';
import { applyPointsCorrection, getPointsReconciliation } from './pointsReconciliationService.js';

describe('C5 余额对账与人工纠正', () => {
  it('按有界账号页批量聚合，不执行逐用户 N+1', async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce([
        [
          { userId: 'user-a', alias: '甲', balance: 120, baselineDelta: 100 },
          { userId: 'user-b', alias: '乙', balance: 150, baselineDelta: 100 },
        ],
      ])
      .mockResolvedValueOnce([
        [
          { userId: 'user-a', ledgerSum: 10 },
          { userId: 'user-b', ledgerSum: 50 },
        ],
      ])
      .mockResolvedValueOnce([[{ userId: 'user-a', latestOperationAt: '2026-08-14' }]]);
    const result = await getPointsReconciliation({ limit: 50, onlyMismatch: true }, { db: { query } });
    expect(result).toMatchObject({ scanned: 2, consistent: 1, mismatched: 1, nextCursor: null });
    expect(result.rows).toEqual([
      expect.objectContaining({ userId: 'user-a', balance: 120, expected: 110, difference: 10 }),
    ]);
    expect(query).toHaveBeenCalledTimes(3);
    expect(String(query.mock.calls[0][0])).toContain('LIMIT 251');
    expect(String(query.mock.calls[1][0])).toContain('user_id IN (?,?)');
  });

  it('纠正只补齐缺失流水，不再次修改当前余额', async () => {
    let operationHash = '';
    const connection = {
      beginTransaction: vi.fn().mockResolvedValue(undefined),
      commit: vi.fn().mockResolvedValue(undefined),
      rollback: vi.fn().mockResolvedValue(undefined),
      release: vi.fn(),
      query: vi.fn(async (sql, params = []) => {
        const statement = String(sql);
        if (statement.includes('INSERT IGNORE INTO points_grant_operations')) {
          operationHash = String(params[2]);
          return [{ affectedRows: 1 }];
        }
        if (statement.includes('FROM points_grant_operations')) {
          return [[{ id: 9, operationHash, status: 'pending', resultJson: null }]];
        }
        if (statement.includes('SELECT points FROM user_growth')) return [[{ points: 120 }]];
        if (statement.includes('baseline_delta')) return [[{ baselineDelta: 100, ledgerSum: 10 }]];
        return [{ affectedRows: 1 }];
      }),
    };
    const db = { getConnection: vi.fn().mockResolvedValue(connection) };
    await expect(
      applyPointsCorrection(
        'user-a',
        { expectedDifference: 10, note: '修补历史缺失流水', requestId: 'recon-request-0001' },
        { db },
      ),
    ).resolves.toMatchObject({ ok: true, delta: 10, balance: 120, expectedAfter: 120 });
    expect(connection.commit).toHaveBeenCalledOnce();
    expect(connection.rollback).not.toHaveBeenCalled();
    expect(connection.query.mock.calls.some(([sql]) => String(sql).includes('UPDATE user_growth'))).toBe(false);
    expect(connection.query.mock.calls.some(([sql]) => String(sql).includes("'correction'"))).toBe(true);
  });

  it('差额在确认后变化时回滚，禁止按过期证据纠正', async () => {
    let operationHash = '';
    const connection = {
      beginTransaction: vi.fn().mockResolvedValue(undefined),
      commit: vi.fn().mockResolvedValue(undefined),
      rollback: vi.fn().mockResolvedValue(undefined),
      release: vi.fn(),
      query: vi.fn(async (sql, params = []) => {
        const statement = String(sql);
        if (statement.includes('INSERT IGNORE INTO points_grant_operations')) {
          operationHash = String(params[2]);
          return [{ affectedRows: 1 }];
        }
        if (statement.includes('FROM points_grant_operations')) return [[{ id: 9, operationHash, status: 'pending' }]];
        if (statement.includes('SELECT points FROM user_growth')) return [[{ points: 121 }]];
        if (statement.includes('baseline_delta')) return [[{ baselineDelta: 100, ledgerSum: 10 }]];
        return [{ affectedRows: 1 }];
      }),
    };
    await expect(
      applyPointsCorrection(
        'user-a',
        { expectedDifference: 10, requestId: 'recon-request-0002' },
        { db: { getConnection: vi.fn().mockResolvedValue(connection) } },
      ),
    ).rejects.toMatchObject({ code: 'CORRECTION_STALE', status: 409 });
    expect(connection.rollback).toHaveBeenCalledOnce();
    expect(connection.commit).not.toHaveBeenCalled();
  });
});
