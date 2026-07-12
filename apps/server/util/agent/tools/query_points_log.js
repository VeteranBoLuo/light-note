import { getPointsLog } from '../../points.js';

const REASON_LABEL = {
  checkin: '签到',
  streak_milestone: '连签里程碑',
  quest: '每日任务',
  achievement: '成就奖励',
  weekly: '每周挑战',
  buy: '商店消费',
  lottery_cost: '抽奖消耗',
  lottery_win: '抽奖中奖',
  lottery_free: '免费抽奖',
  lottery_storage: '抽奖得存储',
  admin: '管理员调整',
};
function label(reason) {
  if (!reason) return '其他';
  if (reason.startsWith('storage:')) return '存储奖励';
  return REASON_LABEL[reason] || reason;
}

// 我的积分流水(只读)。getPointsLog 已排除内部标记(ach_unlock)。
export default {
  name: 'query_points_log',
  description:
    '查询当前用户的积分明细流水(赚分/花分记录),按时间倒序。回答"我积分怎么赚的/花在哪""上次抽奖/购买了啥""最近积分变动"等。',
  parameters: {
    type: 'object',
    properties: { limit: { type: 'integer', description: '返回条数,默认 15,最大 50' } },
  },
  requireRoot: false,
  async execute(args, ctx) {
    const { rows, total } = await getPointsLog(ctx.userId, { limit: Math.min(Math.max(args.limit || 15, 1), 50) });
    return { total, items: rows };
  },
  transform(raw) {
    const items = raw?.items || [];
    if (!items.length) return '暂无积分流水。';
    const lines = items.map((r) => {
      const delta = r.delta > 0 ? `+${r.delta}` : `${r.delta}`;
      const t = r.create_time ? new Date(r.create_time).toLocaleString('zh-CN') : '';
      return `${delta} 积分 · ${label(r.reason)} · ${t}`;
    });
    return `共 ${raw.total} 条积分流水,最近 ${items.length} 条:\n${lines.join('\n')}`;
  },
  summarize(raw) {
    return `积分流水:共 ${raw?.total || 0} 条`;
  },
};
