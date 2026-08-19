import { getUserPointsSummary } from '../../pointsEarningAnalytics.js';

// 当前用户积分摘要（只读）。目标、节奏和来源都由 C5 服务端口径生成，Agent 不自行估算。
export default {
  name: 'get_points_summary',
  description:
    '查询当前用户的积分中心摘要：余额、今日/本周节奏、近 28 天来源分布、积分目标进度与稳定收入估算。' +
    '回答“积分目标还差多少”“最近积分怎么来的”“按现在节奏多久能兑换”等。只读，不会领取、消费或修改目标。',
  routing: {
    targetScope: 'single_owner',
    requireAny: [
      /(?:积分).{0,24}(?:来源|分布|节奏|目标|进度|估算|多久|策略)|(?:来源|分布|节奏|目标进度|稳定收入).{0,20}(?:积分|兑换)/iu,
    ],
    preferAny: [/(?:来源|分布|节奏|目标|进度|估算|多久能兑换)/iu],
    excludeAny: [/(?:明细|流水|逐条|商店|装扮|头像框)/iu],
  },
  parameters: { type: 'object', properties: {} },
  requireRoot: false,
  async execute(args, ctx) {
    return getUserPointsSummary(ctx.userId, { userRole: ctx.userRole });
  },
  transform(raw) {
    if (raw?.visitor) return '登录后可查看个人积分摘要和目标进度。';
    const lines = [
      `积分余额:${Number(raw?.balance || 0).toLocaleString('zh-CN')}`,
      `今日:稳定 +${Number(raw?.today?.stableEarned || 0)} · 随机 +${Number(raw?.today?.randomEarned || 0)} · 消费 -${Number(raw?.today?.spent || 0)}`,
      `本周:稳定 +${Number(raw?.week?.stableEarned || 0)} · 随机 +${Number(raw?.week?.randomEarned || 0)} · 消费 -${Number(raw?.week?.spent || 0)}`,
      `近 28 天:稳定 +${Number(raw?.last28Days?.stableEarned || 0)} · 一次性 +${Number(raw?.last28Days?.oneTimeEarned || 0)} · 随机 +${Number(raw?.last28Days?.randomEarned || 0)} · 消费 -${Number(raw?.last28Days?.spent || 0)}`,
    ];
    const goal = raw?.goal;
    if (goal?.enabled && goal?.unavailable) lines.push('积分目标:目标商品当前已下架，建议到积分中心重新选择。');
    else if (goal?.enabled && goal?.item) {
      const estimate = goal.estimate;
      lines.push(
        `积分目标:${goal.item.name}（${goal.price} 分）· 还差 ${goal.shortfall} 分 · 进度 ${goal.progress}%${
          estimate ? ` · 按近 28 天稳定收入估算约 ${estimate.minDays}～${estimate.maxDays} 天` : ''
        }`,
      );
    } else lines.push('积分目标:尚未设置。');
    lines.push(
      `策略版本:${raw?.policyVersion || 'legacy/unversioned'} · 消费经济版本:${raw?.economyVersion || 'unknown'}`,
    );
    return lines.join('\n');
  },
  summarize(raw) {
    return `积分摘要:余额 ${Number(raw?.balance || 0).toLocaleString('zh-CN')} 分`;
  },
};
