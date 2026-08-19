import { getActiveFrameCatalog, getActiveShopItems, getOwnedCosmetics } from '../../points.js';
import { getEconomyRuntime } from '../../pointsEconomyCatalog.js';
import { getGrowth, getGrowthDashboard } from '../../growth.js';

// 积分兑换 + 成就头像框 + 我的装扮(只读)。
export default {
  name: 'get_shop_status',
  description:
    '查询积分兑换与头像框:当前积分、已拥有装扮、积分商品价格与等级、成就头像框进度和领取状态。回答"我有哪些头像框""商店能买啥""哪个成就框可领取"。',
  routing: {
    targetScope: 'single_owner',
    requireAny: [/(?:积分商店|商店|兑换|商品|装扮|头像框|称号)/iu],
    preferAny: [/(?:积分商店|商店|兑换|商品|装扮|头像框|称号)/iu],
  },
  parameters: { type: 'object', properties: {} },
  requireRoot: false,
  async execute(args, ctx) {
    const [g, dashboard, owned] = await Promise.all([
      getGrowth(ctx.userId, { userRole: ctx.userRole }),
      getGrowthDashboard(ctx.userId, { userRole: ctx.userRole }),
      getOwnedCosmetics(ctx.userId),
    ]);
    const achievementByKey = new Map(dashboard.achievements.map((achievement) => [achievement.key, achievement]));
    const runtime = getEconomyRuntime();
    const catalogItems = [
      ...getActiveShopItems().filter((item) => item.type !== 'cosmetic'),
      ...getActiveFrameCatalog(),
    ];
    const items = catalogItems.map((it) => ({
      id: it.id,
      name: it.name,
      type: it.type,
      rarity: it.rarity || null,
      cost: it.cost ?? null,
      minLevel: it.minLevel || 0,
      acquisition: it.acquisition || 'shop',
      achievementKey: it.achievementKey || null,
      achievement: it.achievementKey ? achievementByKey.get(it.achievementKey) || null : null,
      owned: (it.type === 'title' || it.type === 'cosmetic') && owned.includes(it.id),
    }));
    return {
      economyVersion: runtime.economyVersion,
      purchaseEnabled: runtime.purchaseEnabled,
      points: g.points,
      level: g.level,
      ownedCount: owned.length,
      items,
    };
  },
  transform(raw) {
    const own = raw.items.filter((i) => i.owned).map((i) => i.name);
    const buyable = raw.items.filter((i) => !i.owned && i.acquisition === 'shop');
    const achievementFrames = raw.items.filter((i) => !i.owned && i.acquisition === 'achievement');
    const rarityNames = { basic: '基础', rare: '进阶', epic: '炫彩', legendary: '传说' };
    const lines = buyable.map((i) => {
      const afford = raw.points >= i.cost && raw.level >= i.minLevel;
      const rarity = i.rarity ? `【${rarityNames[i.rarity] || i.rarity}】` : '';
      return `${rarity}${i.name} — ${i.cost} 分${i.minLevel ? ` · 需 Lv.${i.minLevel}` : ''} ${afford ? '✅ 可兑换' : '🔒 暂不满足'}`;
    });
    const achievementLines = achievementFrames.map((item) => {
      const achievement = item.achievement;
      if (!achievement) return `${item.name} — 成就专属`;
      const state = achievement.claimable
        ? '✅ 可领取'
        : achievement.claimed
          ? '已领取'
          : `进度 ${Math.min(achievement.cur, achievement.target)}/${achievement.target}`;
      return `${item.name} — 成就专属 · ${state}`;
    });
    const maintenance = raw.purchaseEnabled ? '' : '\n当前积分兑换入口维护中，目录仅供查看。';
    return `经济版本 ${raw.economyVersion}${maintenance}\n当前积分 ${raw.points} · 等级 Lv.${raw.level}\n已拥有装扮:${own.length ? own.join('、') : '无'}\n商店可兑换:\n${lines.join('\n')}\n成就头像框:\n${achievementLines.join('\n')}`;
  },
  summarize(raw) {
    return `商店:积分 ${raw.points} · 已拥有 ${raw.ownedCount} 件装扮`;
  },
};
