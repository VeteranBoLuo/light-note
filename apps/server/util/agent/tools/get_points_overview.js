import { getPointsOverview } from '../../points.js';

// 【root】全站积分经济总览(只读)。
export default {
  name: 'get_points_overview',
  description: '【管理员】全站积分经济总览:累计发放、消耗、当前存量、按来源分布、抽奖返还率、积分最多的用户 Top。回答"全站积分发了多少""积分消耗情况""谁积分最多""抽奖返还率"。',
  parameters: { type: 'object', properties: {} },
  requireRoot: true,
  async execute() {
    return await getPointsOverview();
  },
  transform(raw) {
    const by = (raw.byReason || []).slice(0, 6).map((r) => `${r.reason} ${r.delta > 0 ? '+' : ''}${r.delta}(${r.cnt}次)`).join(' · ');
    const top = (raw.top || []).slice(0, 5).map((u, i) => `${i + 1}. ${String(u.userId).slice(0, 8)}… ${u.points} 分`).join('\n');
    return [
      `全站积分:累计发放 ${raw.issued} · 累计消耗 ${raw.spent} · 当前存量 ${raw.outstanding} · 持有人 ${raw.holders}`,
      `抽奖:消耗 ${raw.lottery.cost} 分 / 返还 ${raw.lottery.winPoints} 分,返还率 ${raw.lottery.payoutRatio}% · 累计 ${raw.lottery.draws} 抽`,
      `来源分布:${by}`,
      `积分 Top:\n${top}`,
    ].join('\n');
  },
  summarize(raw) {
    return `积分总览:存量 ${raw?.outstanding || 0} · 持有人 ${raw?.holders || 0}`;
  },
};
