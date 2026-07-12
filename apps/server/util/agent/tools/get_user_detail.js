import { getGrowth } from '../../growth.js';
import { getUserPointsDetail } from '../../points.js';

// 【root】查指定用户的成长+积分详情(只读)。user 参数由执行器解析并把 ctx.userId 换成目标用户。
export default {
  name: 'get_user_detail',
  description: '【管理员】查询指定用户的成长与积分详情(等级、经验、积分余额、补签卡、最近积分流水)。必须用 user 参数指定用户(昵称/邮箱/ID)。回答"查一下用户X的积分/等级""某某的成长情况"。',
  parameters: {
    type: 'object',
    properties: { user: { type: 'string', description: '目标用户:昵称 / 邮箱 / 用户ID(必填)' } },
    required: ['user'],
  },
  requireRoot: true,
  async execute(args, ctx) {
    // ctx.userId 已被执行器替换为目标用户;不传 userRole,按目标真实经验算等级
    const g = await getGrowth(ctx.userId, {});
    const d = await getUserPointsDetail(ctx.userId);
    return {
      alias: ctx.userAlias,
      growth: { level: g.level, name: g.name, exp: g.exp, points: g.points, streak: g.streak, protectCards: g.protectCards },
      log: d?.log || [],
    };
  },
  transform(raw) {
    const g = raw.growth || {};
    const log = (raw.log || [])
      .slice(0, 8)
      .map((r) => `${r.delta > 0 ? '+' : ''}${r.delta} · ${r.reason} · ${r.create_time ? new Date(r.create_time).toLocaleDateString('zh-CN') : ''}`)
      .join('\n');
    return `用户「${raw.alias}」:Lv.${g.level}「${g.name}」· 经验 ${g.exp} · 积分 ${g.points} · 连签 ${g.streak} 天 · 补签卡 ${g.protectCards}\n最近积分流水:\n${log || '(无)'}`;
  },
  summarize(raw) {
    return `用户 ${raw?.alias}:Lv.${raw?.growth?.level} · 积分 ${raw?.growth?.points}`;
  },
};
