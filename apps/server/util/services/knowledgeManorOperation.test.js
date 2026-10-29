import { describe, it, expect } from 'vitest';
import { createManor, executeManorCommand } from '@lightnote/shared/manor';
import { summarizeManorOperation } from './knowledgeManorOperation.js';
const ctx = {
  now: new Date('2026-10-29T02:00:00Z'),
  points: 60,
  calendar: { dayKey: '20261029', weekKey: '202644', utcOffsetMinutes: 480 },
  random: () => 0,
};
describe('庄园资源摘要只认服务端变化', () => {
  it('记录见面礼和购买的真实增减，不保存原请求或整个状态', () => {
    const before = createManor(ctx),
      next = executeManorCommand(before, { action: 'adopt', args: [] }, ctx);
    expect(summarizeManorOperation(before, next.state, 'adopt', next.result)).toEqual({
      effectful: true,
      deltas: [
        { key: 'water', delta: 30 },
        { key: 'seeds:radish', delta: 3 },
      ],
    });
    const bought = executeManorCommand(next.state, { action: 'buySeed', args: ['radish', 2] }, ctx);
    expect(summarizeManorOperation(next.state, bought.state, 'buySeed', bought.result)).toEqual({
      effectful: true,
      deltas: [{ key: 'seeds:radish', delta: 2 }],
    });
  });
  it('无变化和界面动作不算玩法参与，空竿结算仍是实际操作', () => {
    expect(summarizeManorOperation({}, {}, 'harvest', []).effectful).toBe(false);
    expect(summarizeManorOperation({}, {}, 'selectBait', true).effectful).toBe(false);
    expect(summarizeManorOperation({}, {}, 'resolveCast', { fish: null }).effectful).toBe(true);
  });
  it('摘要丢弃未知资源和非整数，数量由库存差值决定', () => {
    expect(
      summarizeManorOperation(
        { seeds: { radish: 4 } },
        { seeds: { radish: 3, secret: 999 }, water: NaN },
        'plant',
        true,
      ).deltas,
    ).toEqual([{ key: 'seeds:radish', delta: -1 }]);
  });
  it('机器内的花粉、残枝和堆肥转移也可追踪', () => {
    expect(
      summarizeManorOperation(
        { beehive: { pollen: 1 }, composter: { residue: 2, stock: 3 } },
        { beehive: { pollen: 3 }, composter: { residue: 1, stock: 0 } },
        'collectCompost',
        3,
      ).deltas,
    ).toEqual([
      { key: 'pollen', delta: 2 },
      { key: 'residue', delta: -1 },
      { key: 'compostStock', delta: -3 },
    ]);
  });
});
