import { describe, expect, it } from 'vitest';
import {
  C4_POINTS_ECONOMY_VERSION,
  C5_POINTS_ECONOMY_VERSION,
  C6_POINTS_ECONOMY_VERSION,
  C7_POINTS_ECONOMY_VERSION,
  C9_POINTS_ECONOMY_VERSION,
  freeDrawsFor,
  getEconomyCatalogSnapshot,
  getEconomyRuntime,
  parseRuntimeFlag,
  POINTS_ECONOMY_VERSION,
} from './pointsEconomyCatalog.js';

describe('积分经济 C9 单一目录', () => {
  const snapshot = getEconomyCatalogSnapshot(C9_POINTS_ECONOMY_VERSION);

  it('固定经济版本并完整覆盖 7 个实用商品和 13 个积分框', () => {
    expect(snapshot.version).toBe(C9_POINTS_ECONOMY_VERSION);
    expect(snapshot.utilityItems.map(({ id, cost, purchaseLimit }) => [id, cost, purchaseLimit])).toEqual([
      ['ai_pack_starter', 60, 1],
      ['ai_pack_small', 240, null],
      ['ai_pack', 420, null],
      ['storage_128', 500, 1],
      ['storage_512', 1600, 1],
      ['storage_2g', 5200, 1],
      ['makeup_card', 600, null],
    ]);
    expect(snapshot.frameItems.map(({ id, cost, minLevel }) => [id, cost, minLevel])).toEqual([
      ['frame_mint', 80, 0],
      ['frame_ink', 160, 0],
      ['frame_moonstone', 240, 0],
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
    expect(snapshot.frameItems.reduce((sum, item) => sum + item.cost, 0)).toBe(55180);
  });

  it('C9 只增加四款永久背景，保留 C8 快照且开关失败关闭', () => {
    const previous = getEconomyCatalogSnapshot('points-economy-c8');
    expect(snapshot.utilityItems).toEqual(previous.utilityItems);
    expect(snapshot.frameItems).toEqual(previous.frameItems);
    expect(snapshot.freePolicy).toEqual(previous.freePolicy);
    expect(snapshot.paidPolicy).toEqual(previous.paidPolicy);
    expect(previous.backgroundItems).toBeUndefined();
    expect(snapshot.backgroundItems).toEqual([
      { id: 'background_mountains', cost: 600 },
      { id: 'background_sky', cost: 800 },
      { id: 'background_coast', cost: 1000 },
      { id: 'background_stars', cost: 1500 },
    ]);
    expect(
      getEconomyRuntime({ POINTS_ECONOMY_C8_ENABLED: 'true', POINTS_ECONOMY_C9_ENABLED: 'true' }).economyVersion,
    ).toBe('points-economy-c9');
    for (const value of [undefined, 'false', 'invalid']) {
      expect(
        getEconomyRuntime({ POINTS_ECONOMY_C8_ENABLED: 'true', POINTS_ECONOMY_C9_ENABLED: value }).economyVersion,
      ).toBe('points-economy-c8');
    }
  });

  it('C7 增加补签卡但不改变 C6 商品、奖池与限兑快照', () => {
    const snapshot = getEconomyCatalogSnapshot(C7_POINTS_ECONOMY_VERSION);
    const previous = getEconomyCatalogSnapshot(C6_POINTS_ECONOMY_VERSION);
    expect(snapshot.utilityItems.at(-1)).toMatchObject({ id: 'makeup_card', cost: 300 });
    expect(snapshot.utilityItems.slice(0, -1)).toEqual(previous.utilityItems);
    expect(snapshot.frameItems).toEqual(previous.frameItems);
    expect(snapshot.freePolicy).toEqual(previous.freePolicy);
    expect(snapshot.paidPolicy).toEqual(previous.paidPolicy);
    expect(getEconomyRuntime({ POINTS_ECONOMY_C6_ENABLED: 'true', POINTS_ECONOMY_C7_ENABLED: 'true' })).toMatchObject({
      economyVersion: C7_POINTS_ECONOMY_VERSION,
      c5Active: true,
      requireWriteVersion: true,
    });
    expect(
      getEconomyRuntime({ POINTS_ECONOMY_C6_ENABLED: 'true', POINTS_ECONOMY_C7_ENABLED: 'invalid' }).economyVersion,
    ).toBe(C6_POINTS_ECONOMY_VERSION);
  });

  it('C8 只调高补签卡价格，开启优先、关闭或未知值回退 C7', () => {
    const previous = getEconomyCatalogSnapshot(C7_POINTS_ECONOMY_VERSION);
    expect(snapshot.utilityItems.slice(0, -1)).toEqual(previous.utilityItems.slice(0, -1));
    expect(snapshot.frameItems).toEqual(previous.frameItems);
    expect(snapshot.freePolicy).toEqual(previous.freePolicy);
    expect(snapshot.paidPolicy).toEqual(previous.paidPolicy);
    expect(getEconomyRuntime({ POINTS_ECONOMY_C7_ENABLED: 'true', POINTS_ECONOMY_C8_ENABLED: 'true' })).toMatchObject({
      economyVersion: 'points-economy-c8',
      c5Active: true,
      requireWriteVersion: true,
    });
    for (const flag of ['false', 'invalid']) {
      expect(
        getEconomyRuntime({ POINTS_ECONOMY_C7_ENABLED: 'true', POINTS_ECONOMY_C8_ENABLED: flag }).economyVersion,
      ).toBe(C7_POINTS_ECONOMY_VERSION);
    }
  });

  it('C6 保留 C5 价格快照与限购能力', () => {
    expect(getEconomyCatalogSnapshot(C5_POINTS_ECONOMY_VERSION).frameItems[0].cost).toBe(220);
    expect(getEconomyRuntime({ POINTS_ECONOMY_C6_ENABLED: 'true' })).toMatchObject({
      economyVersion: C6_POINTS_ECONOMY_VERSION,
      c5Active: true,
      requireWriteVersion: true,
    });
  });

  it('保留已发布 C4 快照，限兑规则只进入 C5', () => {
    expect(getEconomyCatalogSnapshot(C4_POINTS_ECONOMY_VERSION).utilityItems.map((item) => item.purchaseLimit)).toEqual(
      [null, null, null, null, null],
    );
  });

  it('免费池仅发积分与 AI，付费池权重严格为 1000 且保底权重为 170', () => {
    expect(snapshot.freePolicy.pool.reduce((sum, item) => sum + item.weight, 0)).toBe(1000);
    expect(new Set(snapshot.freePolicy.pool.map((item) => item.kind))).toEqual(new Set(['points', 'ai_pack']));
    expect(snapshot.freePolicy.countsPaidPity).toBe(false);
    expect(snapshot.paidPolicy.pool.reduce((sum, item) => sum + item.weight, 0)).toBe(1000);
    expect(
      snapshot.paidPolicy.pool.filter((item) => item.tier === 'rare').reduce((sum, item) => sum + item.weight, 0),
    ).toBe(170);
    expect(snapshot.paidPolicy).toMatchObject({ singleCost: 170, tenCost: 1600, cardOverflowPoints: 120 });
  });

  it('运行时开关未知值失败关闭', () => {
    expect(parseRuntimeFlag('true', false)).toBe(true);
    expect(parseRuntimeFlag('false', true)).toBe(false);
    expect(parseRuntimeFlag('unexpected', true)).toBe(false);
  });

  it('C4/C5 免费次数都按 0/1/2/3 封顶，且写协议不能被环境变量降级', () => {
    expect([1, 2, 3, 5, 6, 9, 10, 15].map((level) => freeDrawsFor(level, POINTS_ECONOMY_VERSION))).toEqual([
      0, 0, 1, 1, 2, 2, 3, 3,
    ]);
    expect(
      getEconomyRuntime({
        POINTS_ECONOMY_C4_ENABLED: 'true',
        POINTS_ECONOMY_C5_ENABLED: 'true',
        POINTS_ECONOMY_REQUIRE_WRITE_VERSION: 'false',
      }).requireWriteVersion,
    ).toBe(true);
    expect(
      getEconomyRuntime({ POINTS_ECONOMY_C4_ENABLED: 'true', POINTS_ECONOMY_C5_ENABLED: 'false' }).economyVersion,
    ).toBe(C4_POINTS_ECONOMY_VERSION);
  });
});
