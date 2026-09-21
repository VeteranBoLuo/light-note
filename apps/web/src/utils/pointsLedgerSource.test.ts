import { describe, expect, it } from 'vitest';
import { describeLedgerSource } from './pointsLedgerSource';
const labels: Record<string, string> = {
  'growth.pointsReason.weekly': '每周挑战',
  'growth.pointsSourceType.weekly': '每周挑战',
  'growth.weeklyName.wk_collect': '收集 5 项知识',
  'growth.achName.streak_7': '连续签到七天',
  'growth.pointsReason.campaign': '活动发放',
};
const render = (row: Parameters<typeof describeLedgerSource>[0], locale = 'zh-CN') =>
  describeLedgerSource(
    row,
    (key, values) => (key === 'settingsRefine.ledger.questStage' ? `完成 ${values?.n} 项每日任务` : labels[key]),
    (key) => key in labels,
    locale,
  );
describe('积分来源说明', () => {
  it('使用完整周任务和成就字典', () => {
    expect(render({ reason: 'weekly', sourceKey: 'wk_collect' })).toBe('收集 5 项知识');
    expect(render({ reason: 'achievement', sourceKey: 'streak_7' })).toBe('连续签到七天');
  });
  it('显示活动快照并按语言回退', () => {
    expect(render({ reason: 'campaign', sourceName: { zh: '中秋', en: 'Mid-Autumn' } }, 'en-US')).toBe('Mid-Autumn');
    expect(render({ reason: 'campaign', sourceName: { zh: '中秋' } })).toBe('中秋');
  });
  it('不重复类别，不暴露未知来源标识', () => {
    expect(render({ reason: 'weekly', sourceKey: 'unknown-internal-id' })).toBe('');
    expect(render({ reason: 'campaign' })).toBe('');
  });
  it('使用发奖时的阶段门槛', () => {
    expect(render({ reason: 'quest', meta: { required: 2 } })).toBe('完成 2 项每日任务');
  });
});
