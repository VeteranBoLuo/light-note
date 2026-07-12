import { getGrowth, getGrowthDashboard } from '../../growth.js';

// 我的成长与积分(只读)。等级/经验/积分/连签/今日签到与任务/成就进度。
export default {
  name: 'get_growth',
  description:
    '查询当前用户的成长与积分:等级、经验、积分余额、连签天数、今日是否已签到、今日任务完成度、成就进度(已解锁/待领取/总数)。' +
    '回答"我几级""多少积分""连签几天""今天签到/任务了吗""成就进度""我的等级权益"等。',
  parameters: { type: 'object', properties: {} },
  requireRoot: false,
  async execute(args, ctx) {
    const g = await getGrowth(ctx.userId, { userRole: ctx.userRole });
    let dash = null;
    try {
      dash = await getGrowthDashboard(ctx.userId, { userRole: ctx.userRole });
    } catch {
      /* 看板失败不影响核心成长数据 */
    }
    return {
      growth: g,
      achievements: dash ? { unlocked: dash.unlockedCount, claimable: dash.claimableCount, total: dash.totalAchievements } : null,
      quests: dash?.quests || null,
      questBonus: dash?.questBonus || null,
    };
  },
  transform(raw) {
    const g = raw?.growth || {};
    const lines = [
      `等级:Lv.${g.level}「${g.name}」${g.isMax ? '(满级)' : ` · 距下一级还需 ${g.expToNext} 经验`}`,
      `经验:${g.exp}${g.isMax ? '' : ` · 今日已得 ${g.dailyExp}/${g.dailyCap}`}`,
      `积分余额:${g.points}`,
      `连签:${g.streak} 天 · 今天${g.checkedInToday ? '已签到 ✓' : '还没签到'}${g.protectCards ? ` · 补签卡 ${g.protectCards} 张` : ''}`,
      `等级权益:云空间 ${g.spaceMb} MB · AI 每日 ${g.aiTokenDaily} token · 回收站保留 ${g.trashDays} 天`,
    ];
    if (g.equippedTitleName) lines.push(`佩戴称号:${g.equippedTitleName}`);
    if (raw.quests) {
      const map = { checkin: '签到', create: '记录一条内容', exp30: '今日经验达30' };
      const q = raw.quests.map((x) => `${map[x.key] || x.key}${x.done ? '✓' : '✗'}`).join(' · ');
      const bonus = raw.questBonus?.claimable ? '(可领奖励)' : raw.questBonus?.claimed ? '(奖励已领)' : '';
      lines.push(`今日任务:${q} ${bonus}`);
    }
    if (raw.achievements) {
      lines.push(`成就:已解锁 ${raw.achievements.unlocked}/${raw.achievements.total}${raw.achievements.claimable ? ` · ${raw.achievements.claimable} 个待领取` : ''}`);
    }
    return lines.join('\n');
  },
  summarize(raw) {
    const g = raw?.growth || {};
    return `成长:Lv.${g.level} · 积分 ${g.points} · 连签 ${g.streak} 天`;
  },
};
