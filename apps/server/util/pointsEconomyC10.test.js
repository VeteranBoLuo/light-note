import { describe, expect, it } from 'vitest';
import {
  C9_POINTS_ECONOMY_VERSION,
  freeDrawsFor,
  getEconomyCatalogSnapshot,
  getEconomyRuntime,
  POINTS_ECONOMY_VERSION,
} from './pointsEconomyCatalog.js';

describe('C10 免费惊喜预算与历史合同', () => {
  it('只更新免费奖池，保留 C9 商品、付费奖池和等级次数', () => {
    const previous = getEconomyCatalogSnapshot(C9_POINTS_ECONOMY_VERSION);
    const current = getEconomyCatalogSnapshot();
    expect(POINTS_ECONOMY_VERSION).toBe('points-economy-c10');
    expect(current).toEqual({
      ...previous,
      version: 'points-economy-c10',
      freePolicy: {
        poolVersion: 'c10-free-v1',
        countsPaidPity: false,
        pool: [
          { id: 'p3', kind: 'points', amount: 3, weight: 650 },
          { id: 'p5', kind: 'points', amount: 5, weight: 230 },
          { id: 'p20', kind: 'points', amount: 20, weight: 20 },
          { id: 'ai20', kind: 'ai_pack', amount: 20000, weight: 80 },
          { id: 'ai50', kind: 'ai_pack', amount: 50000, weight: 20 },
        ],
      },
    });
    expect(previous.freePolicy.pool.map(({ amount, weight }) => [amount, weight])).toEqual([
      [10, 500],
      [20, 300],
      [40, 100],
      [100000, 80],
      [200000, 20],
    ]);
    for (let level = 1; level <= 15; level += 1) {
      expect(freeDrawsFor(level, current.version)).toBe(freeDrawsFor(level, previous.version));
    }
  });

  it('总权重 1000、AI 总概率 10%，每抽期望为 3.5 积分和 2600 tokens', () => {
    const pool = getEconomyCatalogSnapshot().freePolicy.pool;
    const total = pool.reduce((sum, prize) => sum + prize.weight, 0);
    expect(total).toBe(1000);
    expect(pool.filter((prize) => prize.kind === 'ai_pack').reduce((sum, prize) => sum + prize.weight, 0) / total).toBe(
      0.1,
    );
    const expected = (kind) =>
      pool.filter((prize) => prize.kind === kind).reduce((sum, prize) => sum + prize.amount * prize.weight, 0) / total;
    expect(expected('points')).toBe(3.5);
    expect(expected('ai_pack')).toBe(2600);
  });

  it('C10 显式启用才切换，关闭及未知值保留 C9 与严格写协议', () => {
    expect(getEconomyRuntime({ POINTS_ECONOMY_C9_ENABLED: 'true', POINTS_ECONOMY_C10_ENABLED: 'true' })).toMatchObject({
      economyVersion: 'points-economy-c10',
      c5Active: true,
      requireWriteVersion: true,
    });
    for (const flag of [undefined, 'false', 'unexpected']) {
      expect(getEconomyRuntime({ POINTS_ECONOMY_C9_ENABLED: 'true', POINTS_ECONOMY_C10_ENABLED: flag })).toMatchObject({
        economyVersion: 'points-economy-c9',
        c5Active: true,
        requireWriteVersion: true,
      });
    }
  });
});
