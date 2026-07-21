import { getStatusForUser } from '../../aiQuota.js';

export default {
  name: 'get_ai_quota',
  description:
    '查询当前用户今日的 AI 额度:已用 token、每日上限、剩余额度(每日上限随成长等级提升,使用「AI 加油包」当天还会额外增加)。回答"我还有多少 AI 额度""今天 AI 用了多少""额度上限/剩余是多少""加油包生效了吗"用它。',
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
      return '游客模式下 AI 额度按设备与可信网络临时分配(单设备每日约 3 万 token)。注册登录后,额度随成长等级提升,还能用「AI 加油包」当天扩充。';
    }
    const fmt = (n) => Number(n || 0).toLocaleString('en-US');
    const pct = raw.quota ? Math.round((raw.used / raw.quota) * 100) : 0;
    return `今日 AI 额度:
• 已用:${fmt(raw.used)} token(${pct}%)
• 每日上限:${fmt(raw.quota)} token
• 剩余:${fmt(raw.remaining)} token
额度每天 0 点重置;使用「我的成长 → 积分商店」的「AI 加油包」可当天额外增加上限。`;
  },
  summarize(raw) {
    if (raw?.unavailable) return 'AI额度:服务暂不可用（已失败关闭）';
    if (raw?.guest) return 'AI额度:游客按设备与网络临时分配';
    const fmt = (n) => Number(n || 0).toLocaleString('en-US');
    return `AI额度:剩余 ${fmt(raw.remaining)} / 上限 ${fmt(raw.quota)} token`;
  },
};
