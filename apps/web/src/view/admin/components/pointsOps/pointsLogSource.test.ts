import { describe, expect, it } from 'vitest';
import { describePointsLogSource } from './pointsLogSource';

const messages: Record<string, string> = {
  'growth.pointsReason.achievement': '成就奖励',
  'growth.pointsReason.weekly': '每周挑战',
  'growth.pointsReason.buy': '兑换商品',
  'growth.achName.streak_7': '七日不辍',
  'growth.weeklyName.wk_todo': '本周完成待办',
  'growth.shopItems.storage_512.name': '扩容包 512MB',
};
const t = (key: string) => messages[key] || key;
const te = (key: string) => key in messages;

describe('后台积分流水来源文案', () => {
  it('展示成就的真实名称', () => {
    expect(describePointsLogSource({ sourceType: 'achievement', sourceKey: 'streak_7' }, t, te)).toMatchObject({
      title: '成就奖励',
      detail: '七日不辍',
    });
  });

  it('展示每周挑战名与所属周', () => {
    expect(
      describePointsLogSource(
        { sourceType: 'weekly', sourceKey: 'wk_todo', sourceMeta: '202632', sourceRef: '202632:wk_todo' },
        t,
        te,
      ),
    ).toMatchObject({ title: '每周挑战', detail: '本周完成待办 · 2026 年第 32 周' });
  });

  it('展示兑换商品的名称', () => {
    expect(describePointsLogSource({ sourceType: 'buy', sourceKey: 'storage_512' }, t, te)).toMatchObject({
      title: '兑换商品',
      detail: '扩容包 512MB',
    });
  });
});
