import { getLotteryStatus } from '../../lottery.js';

// 抽奖状态(只读)。
export default {
  name: 'get_lottery_status',
  description: '查询积分抽奖状态:当前积分、单抽/十连消耗、今日剩余免费次数、距下次保底还差几抽。回答"我还能免费抽吗""抽一次多少积分""距保底还差几抽"。',
  parameters: { type: 'object', properties: {} },
  requireRoot: false,
  async execute(args, ctx) {
    return await getLotteryStatus(ctx.userId, { userRole: ctx.userRole });
  },
  transform(raw) {
    return [
      `当前积分:${raw.points}`,
      `单抽 ${raw.singleCost} 分 · 十连 ${raw.tenCost} 分`,
      `今日免费抽奖:剩余 ${raw.freeRemaining}/${raw.freeDaily} 次`,
      `保底:每 ${raw.pityEvery} 抽必出稀有,距下次保底还差 ${raw.toPity} 抽(累计已抽 ${raw.count} 次)`,
    ].join('\n');
  },
  summarize(raw) {
    return `抽奖:今日免费剩 ${raw?.freeRemaining ?? '?'} 次 · 积分 ${raw?.points ?? '?'}`;
  },
};
