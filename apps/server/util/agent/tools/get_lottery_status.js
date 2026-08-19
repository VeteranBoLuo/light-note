import { getLotteryStatus } from '../../lottery.js';

// 抽奖状态(只读)。
export default {
  name: 'get_lottery_status',
  description:
    '查询积分抽奖状态:当前积分、单抽/十连消耗、今日剩余免费次数、距下次保底还差几抽。回答"我还能免费抽吗""抽一次多少积分""距保底还差几抽"。',
  routing: {
    targetScope: 'single_owner',
    requireAny: [/(?:抽奖|免费抽|单抽|十连|保底|lottery|draw)/iu],
    preferAny: [/(?:抽奖|免费抽|单抽|十连|保底|lottery)/iu],
  },
  parameters: { type: 'object', properties: {} },
  requireRoot: false,
  async execute(args, ctx) {
    return await getLotteryStatus(ctx.userId, { userRole: ctx.userRole });
  },
  transform(raw) {
    const freePity = raw.free.countsPaidPity ? '计入当前兼容保底' : '不计入积分抽奖保底';
    return [
      `经济版本:${raw.economyVersion}`,
      `当前积分:${raw.points}`,
      `积分抽奖:单抽 ${raw.paid.singleCost} 分 · 十连 ${raw.paid.tenCost} 分`,
      `每日惊喜:${raw.free.enabled ? '' : '维护中 · '}剩余 ${raw.free.remaining}/${raw.free.daily} 次，${freePity}`,
      `付费保底:${raw.paid.enabled ? '' : '积分抽奖维护中 · '}每 ${raw.paid.pityEvery} 抽必出稀有，当前 ${raw.paid.pityProgress}/${raw.paid.pityEvery}，还差 ${raw.paid.toPity} 抽`,
    ].join('\n');
  },
  summarize(raw) {
    return `抽奖:今日免费剩 ${raw?.free?.remaining ?? '?'} 次 · 积分 ${raw?.points ?? '?'}`;
  },
};
