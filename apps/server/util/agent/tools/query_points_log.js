import { getPointsLog } from '../../points.js';
import { withQueryResultMetadata } from '../toolResultMetadata.js';

const REASON_LABEL = {
  checkin: '签到',
  streak_milestone: '连签里程碑',
  quest: '每日任务',
  achievement: '成就奖励',
  weekly: '每周挑战',
  buy: '商店消费',
  lottery_cost: '历史抽奖消耗',
  lottery_win: '历史抽奖中奖',
  lottery_paid_cost: '积分抽奖消耗',
  lottery_paid_win: '积分抽奖中奖',
  lottery_paid_compensation: '积分抽奖满仓补偿',
  lottery_paid_asset: '积分抽奖资产奖励',
  lottery_free_win: '每日惊喜中奖',
  lottery_free_asset: '每日惊喜 AI 奖励',
  lottery_free: '免费抽奖',
  lottery_storage: '抽奖得存储',
  lottery_compensation: '历史抽奖满仓补偿',
  admin: '管理员调整',
  campaign: '活动发放',
  correction: '账本纠正',
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
  routing: {
    targetScope: 'single_owner',
    requireAny: [
      /(?:积分).{0,20}(?:明细|流水|记录|变动|收入|支出|赚|花)|(?:明细|流水|收入|支出|赚分|花分).{0,16}(?:积分)/iu,
    ],
    preferAny: [/(?:明细|流水|记录|变动|收入|支出|赚分|花分)/iu],
    excludeAny: [/(?:来源分布|节奏|目标进度|多久能兑换|商店|装扮|头像框)/iu],
  },
  parameters: {
    type: 'object',
    properties: { limit: { type: 'integer', description: '返回条数,默认 15,最大 50' } },
  },
  requireRoot: false,
  async execute(args, ctx) {
    const { rows, total } = await getPointsLog(ctx.userId, { limit: Math.min(Math.max(args.limit || 15, 1), 50) });
    return withQueryResultMetadata({ total: Number(total || 0), items: rows });
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
