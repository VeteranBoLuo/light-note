import { getStatusForUser } from '../../aiQuota.js';

export default {
  name: 'get_ai_quota',
  description:
    '查询当前用户 AI 额度:今日已用、等级每日上限、今日剩余与永久加油余额。每日额度随成长等级提升并优先使用,耗尽后自动扣永久余额。回答额度或加油包问题时使用。',
  routing: {
    targetScope: 'single_owner',
    requireAny: [/(?:AI|模型).{0,16}(?:额度|配额|token|加油)|(?:额度|配额|token|加油).{0,16}(?:AI|模型)/iu],
    preferAny: [/(?:今日|今天|剩余|已用|上限|加油).{0,16}(?:额度|token)|(?:AI|模型).{0,16}(?:额度|配额)/iu],
  },
  parameters: {
    type: 'object',
    properties: {},
  },
  requireRoot: false,
  async execute(args, ctx) {
    return await getStatusForUser(ctx.billingUserId || ctx.userId, ctx.billingUserRole || ctx.userRole);
  },
  transform(raw) {
    if (raw?.unavailable) return 'AI 额度服务暂时不可用，为避免无保护调用，当前不会继续消耗模型额度。请稍后重试。';
    if (raw?.guest) {
      return '游客模式下 AI 额度按设备与可信网络临时分配(单设备每日约 20 万 token)。注册登录后,额度随成长等级提升,还能兑换永久有效的 AI 加油余额。';
    }
    const fmt = (n) => Number(n || 0).toLocaleString('en-US');
    const pct = raw.dailyQuota ? Math.round((raw.dailyUsed / raw.dailyQuota) * 100) : 0;
    return `今日 AI 额度:
• 已用:${fmt(raw.dailyUsed)} token(${pct}%)
• 每日上限:${fmt(raw.dailyQuota)} token
• 今日剩余:${fmt(raw.dailyRemaining)} token
• 永久加油余额:${fmt(raw.bonusTokens)} token
每日额度 0 点重置并优先使用;用完后自动扣永久加油余额。`;
  },
  summarize(raw) {
    if (raw?.unavailable) return 'AI额度:服务暂不可用（已失败关闭）';
    if (raw?.guest) return 'AI额度:游客按设备与网络临时分配';
    const fmt = (n) => Number(n || 0).toLocaleString('en-US');
    return `AI额度:剩余 ${fmt(raw.remaining)} / 上限 ${fmt(raw.quota)} token`;
  },
};
