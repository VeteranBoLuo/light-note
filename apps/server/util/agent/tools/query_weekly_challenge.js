import { getWeeklyChallenges } from '../../weeklyChallenge.js';

const LABEL = { wk_bookmark: '本周收藏书签', wk_note: '本周记录笔记', wk_checkin: '本周签到' };

// 本周挑战进度(只读)。
export default {
  name: 'query_weekly_challenge',
  description: '查询当前用户本周挑战的进度与领取状态。回答"我这周挑战做完没""每周挑战进度""这周还能领多少积分"。',
  parameters: { type: 'object', properties: {} },
  requireRoot: false,
  async execute(args, ctx) {
    return await getWeeklyChallenges(ctx.userId);
  },
  transform(raw) {
    const cs = raw?.challenges || [];
    if (!cs.length) return '本周暂无挑战数据。';
    const lines = cs.map((c) => {
      const name = LABEL[c.key] || c.key;
      const st = c.claimed ? '已领取' : c.claimable ? '可领取 🎁' : c.done ? '已完成' : '进行中';
      return `${name}:${c.cur}/${c.target} · +${c.reward} 分 · ${st}`;
    });
    return `本周挑战(${raw.claimableCount || 0} 个可领):\n${lines.join('\n')}`;
  },
  summarize(raw) {
    return `每周挑战:${raw?.claimableCount || 0} 个可领`;
  },
};
