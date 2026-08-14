import { describe, expect, it, vi } from 'vitest';
import {
  beginPointsEconomyOperation,
  completePointsEconomyOperation,
  operationHash,
} from './pointsEconomyOperations.js';

const runtime = {
  economyVersion: 'points-economy-c4',
  requireWriteVersion: true,
};

describe('积分消费幂等收据', () => {
  it('规范化哈希不受对象键顺序影响', () => {
    expect(operationHash({ b: 2, a: { d: 4, c: 3 } })).toBe(operationHash({ a: { c: 3, d: 4 }, b: 2 }));
  });

  it('相同 requestId 与负载回放原成功结果，不再次执行业务', async () => {
    const original = { ok: true, points: 100, economyVersion: 'points-economy-c4' };
    const hash = operationHash({
      operationType: 'shop_buy',
      economyVersion: 'points-economy-c4',
      expectedCost: 240,
      payload: { itemId: 'ai_pack_small' },
    });
    const conn = {
      query: vi
        .fn()
        .mockResolvedValueOnce([[{ id: 1, operation_type: 'shop_buy', operation_hash: hash, status: 'succeeded', result_json: original }]])
        .mockResolvedValueOnce([{ affectedRows: 1 }]),
    };
    const result = await beginPointsEconomyOperation(conn, {
      userId: 'u1',
      operationType: 'shop_buy',
      payload: { itemId: 'ai_pack_small' },
      clientRequestId: '12345678-abcd-efgh',
      economyVersion: 'points-economy-c4',
      expectedCost: 240,
      actualCost: 240,
      runtime,
    });
    expect(result.replay).toEqual({ ...original, idempotent: true });
    expect(conn.query.mock.calls[1][0]).toContain('replay_count = replay_count + 1');
  });

  it('已成功的旧版本请求在当前目录升级后仍先回放原结果', async () => {
    const original = { ok: true, points: 120, economyVersion: 'points-economy-c3', cost: 250 };
    const hash = operationHash({
      operationType: 'shop_buy',
      economyVersion: 'points-economy-c3',
      expectedCost: 250,
      payload: { itemId: 'storage_128' },
    });
    const conn = {
      query: vi
        .fn()
        .mockResolvedValueOnce([[
          { id: 2, operation_type: 'shop_buy', operation_hash: hash, status: 'succeeded', result_json: original },
        ]])
        .mockResolvedValueOnce([{ affectedRows: 1 }]),
    };
    const result = await beginPointsEconomyOperation(conn, {
      userId: 'u1',
      operationType: 'shop_buy',
      payload: { itemId: 'storage_128' },
      clientRequestId: 'old-version-request-1234',
      economyVersion: 'points-economy-c3',
      expectedCost: 250,
      actualCost: 500,
      runtime,
    });
    expect(result.replay).toEqual({ ...original, idempotent: true });
    expect(conn.query).toHaveBeenCalledTimes(2);
  });

  it('同一 requestId 绑定不同负载时返回可识别冲突', async () => {
    const conn = {
      query: vi
        .fn()
        .mockResolvedValueOnce([[{ id: 1, operation_type: 'shop_buy', operation_hash: 'different', status: 'succeeded' }]]),
    };
    await expect(
      beginPointsEconomyOperation(conn, {
        userId: 'u1',
        operationType: 'shop_buy',
        payload: { itemId: 'ai_pack_small' },
        clientRequestId: '12345678-abcd-efgh',
        economyVersion: 'points-economy-c4',
        expectedCost: 240,
        actualCost: 240,
        runtime,
      }),
    ).rejects.toMatchObject({ code: 'IDEMPOTENCY_KEY_REUSED', status: 409 });
  });

  it('缺少版本协议与预期价格时拒绝执行', async () => {
    const conn = { query: vi.fn() };
    await expect(
      beginPointsEconomyOperation(conn, {
        userId: 'u1',
        operationType: 'shop_buy',
        payload: { itemId: 'ai_pack_small' },
        actualCost: 240,
        runtime,
      }),
    ).rejects.toMatchObject({ code: 'ECONOMY_CLIENT_UPGRADE_REQUIRED', status: 409 });
    expect(conn.query).not.toHaveBeenCalled();
  });

  it('新请求通过校验后才创建 pending 收据', async () => {
    const conn = { query: vi.fn().mockResolvedValueOnce([[]]).mockResolvedValueOnce([{ affectedRows: 1, insertId: 7 }]) };
    const result = await beginPointsEconomyOperation(conn, {
      userId: 'u1',
      operationType: 'shop_buy',
      payload: { itemId: 'ai_pack_small' },
      clientRequestId: '12345678-abcd-efgh',
      economyVersion: 'points-economy-c4',
      expectedCost: 240,
      actualCost: 240,
      runtime,
    });
    expect(result).toMatchObject({ operationId: 7, replay: null });
    expect(conn.query.mock.calls[0][0]).not.toContain('FOR UPDATE');
    expect(conn.query.mock.calls[1][0]).toContain('INSERT IGNORE INTO points_economy_operations');
  });

  it('并发唯一键竞争后用 current read 读取赢家收据', async () => {
    const original = { ok: true, points: 80, economyVersion: 'points-economy-c4' };
    const hash = operationHash({
      operationType: 'lottery_paid',
      economyVersion: 'points-economy-c4',
      expectedCost: 170,
      payload: { mode: 'paid', times: 1 },
    });
    const conn = {
      query: vi
        .fn()
        .mockResolvedValueOnce([[]])
        .mockResolvedValueOnce([{ affectedRows: 0 }])
        .mockResolvedValueOnce([[
          { id: 8, operation_type: 'lottery_paid', operation_hash: hash, status: 'succeeded', result_json: original },
        ]])
        .mockResolvedValueOnce([{ affectedRows: 1 }]),
    };
    const result = await beginPointsEconomyOperation(conn, {
      userId: 'u1',
      operationType: 'lottery_paid',
      payload: { mode: 'paid', times: 1 },
      clientRequestId: 'concurrent-request-1234',
      economyVersion: 'points-economy-c4',
      expectedCost: 170,
      actualCost: 170,
      runtime,
    });
    expect(conn.query.mock.calls[2][0]).toContain('FOR UPDATE');
    expect(result.replay).toEqual({ ...original, idempotent: true });
  });

  it('成功结果写入独立收据表，不修改积分流水', async () => {
    const conn = { query: vi.fn().mockResolvedValue([{ affectedRows: 1 }]) };
    await completePointsEconomyOperation(conn, { operationId: 9 }, { ok: true });
    expect(conn.query.mock.calls[0][0]).toContain('UPDATE points_economy_operations');
    expect(conn.query.mock.calls[0][0]).not.toContain('points_log');
    expect(conn.query.mock.calls[0][1]).toEqual([
      JSON.stringify({ ok: true }),
      null,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      9,
    ]);
  });

  it('结果收据同步保存可聚合的积分与资产输出', async () => {
    const conn = { query: vi.fn().mockResolvedValue([{ affectedRows: 1 }]) };
    await completePointsEconomyOperation(conn, { operationId: 10 }, {
      ok: true,
      itemId: 'storage_512',
      cost: 1600,
      effect: { type: 'storage', amountMb: 512 },
      results: [
        { kind: 'points', amount: 50 },
        { kind: 'ai_pack', amount: 600000 },
        { kind: 'card', amount: 1 },
      ],
      pityHitIndexes: [3],
    });
    expect(conn.query.mock.calls[0][1]).toEqual([
      expect.any(String),
      'storage_512',
      1600,
      50,
      600000,
      512,
      1,
      3,
      1,
      10,
    ]);
  });
});
