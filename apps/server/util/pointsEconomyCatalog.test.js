import { describe, expect, it } from 'vitest';
import {
  freeDrawsFor,
  getEconomyCatalogSnapshot,
  getEconomyRuntime,
  parseRuntimeFlag,
  POINTS_ECONOMY_VERSION,
} from './pointsEconomyCatalog.js';

describe('积分经济 C4 单一目录', () => {
  const snapshot = getEconomyCatalogSnapshot();

  it('固定经济版本并完整覆盖 5 个实用商品和 13 个积分框', () => {
    expect(snapshot.version).toBe(POINTS_ECONOMY_VERSION);
    expect(snapshot.utilityItems.map(({ id, cost }) => [id, cost])).toEqual([
      ['ai_pack_small', 240],
      ['ai_pack', 420],
      ['storage_128', 500],
      ['storage_512', 1600],
      ['storage_2g', 5200],
    ]);
    expect(snapshot.frameItems.map(({ id, cost, minLevel }) => [id, cost, minLevel])).toEqual([
      ['frame_mint', 220, 0],
      ['frame_ink', 320, 0],
      ['frame_moonstone', 480, 0],
      ['frame_gold', 700, 0],
      ['frame_sakura', 1000, 0],
      ['frame_sunset', 1400, 0],
      ['frame_ocean', 2000, 0],
      ['frame_aurora', 2800, 0],
      ['frame_flame', 3800, 0],
      ['frame_neon', 6000, 3],
      ['frame_galaxy', 9000, 4],
      ['frame_dragon', 12000, 5],
      ['frame_celestial', 16000, 6],
    ]);
    expect(snapshot.frameItems.reduce((sum, item) => sum + item.cost, 0)).toBe(55720);
  });

  it('免费池仅发积分与 AI，付费池权重严格为 1000 且保底权重为 170', () => {
    expect(snapshot.freePolicy.pool.reduce((sum, item) => sum + item.weight, 0)).toBe(1000);
    expect(new Set(snapshot.freePolicy.pool.map((item) => item.kind))).toEqual(new Set(['points', 'ai_pack']));
    expect(snapshot.freePolicy.countsPaidPity).toBe(false);
    expect(snapshot.paidPolicy.pool.reduce((sum, item) => sum + item.weight, 0)).toBe(1000);
    expect(snapshot.paidPolicy.pool.filter((item) => item.tier === 'rare').reduce((sum, item) => sum + item.weight, 0)).toBe(
      170,
    );
    expect(snapshot.paidPolicy).toMatchObject({ singleCost: 170, tenCost: 1600, cardOverflowPoints: 120 });
  });

  it('运行时开关未知值失败关闭', () => {
    expect(parseRuntimeFlag('true', false)).toBe(true);
    expect(parseRuntimeFlag('false', true)).toBe(false);
    expect(parseRuntimeFlag('unexpected', true)).toBe(false);
  });

  it('C4 免费次数只按 0/1/2/3 封顶，且写协议不能被环境变量降级', () => {
    expect([1, 2, 3, 5, 6, 9, 10, 15].map((level) => freeDrawsFor(level, POINTS_ECONOMY_VERSION))).toEqual([
      0, 0, 1, 1, 2, 2, 3, 3,
    ]);
    expect(
      getEconomyRuntime({
        POINTS_ECONOMY_C4_ENABLED: 'true',
        POINTS_ECONOMY_REQUIRE_WRITE_VERSION: 'false',
      }).requireWriteVersion,
    ).toBe(true);
  });
});
