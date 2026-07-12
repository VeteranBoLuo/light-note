import { SHOP_ITEMS, getOwnedCosmetics } from '../../points.js';
import { getGrowth } from '../../growth.js';

// 积分商店 + 我的装扮(只读)。
export default {
  name: 'get_shop_status',
  description: '查询积分商店:当前积分、已拥有的称号/头像框、各商品所需积分与等级、能否兑换。回答"我有哪些称号/头像框""商店能买啥""我的积分够换X吗"。',
  parameters: { type: 'object', properties: {} },
  requireRoot: false,
  async execute(args, ctx) {
    const g = await getGrowth(ctx.userId, { userRole: ctx.userRole });
    const owned = await getOwnedCosmetics(ctx.userId);
    const items = SHOP_ITEMS.map((it) => ({
      name: it.name,
      type: it.type,
      cost: it.cost,
      minLevel: it.minLevel || 0,
      owned: (it.type === 'title' || it.type === 'cosmetic') && owned.includes(it.id),
    }));
    return { points: g.points, level: g.level, ownedCount: owned.length, items };
  },
  transform(raw) {
    const own = raw.items.filter((i) => i.owned).map((i) => i.name);
    const buyable = raw.items.filter((i) => !i.owned);
    const lines = buyable.map((i) => {
      const afford = raw.points >= i.cost && raw.level >= i.minLevel;
      return `${i.name} — ${i.cost} 分${i.minLevel ? ` · 需 Lv.${i.minLevel}` : ''} ${afford ? '✅ 可兑换' : '🔒 暂不满足'}`;
    });
    return `当前积分 ${raw.points} · 等级 Lv.${raw.level}\n已拥有装扮:${own.length ? own.join('、') : '无'}\n商店可兑换:\n${lines.join('\n')}`;
  },
  summarize(raw) {
    return `商店:积分 ${raw.points} · 已拥有 ${raw.ownedCount} 件装扮`;
  },
};
