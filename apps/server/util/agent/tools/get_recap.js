import { getRecap } from '../../recap.js';

// 那年今日 + 尘封回顾(只读)。
export default {
  name: 'get_recap',
  description:
    '查询"那年今日"与"尘封回顾":历史上的今天收藏/记录过的内容,以及很久没动过的旧收藏。回答"那年今日我存了啥""帮我回顾一下""有什么久没看的收藏"。',
  parameters: { type: 'object', properties: {} },
  requireRoot: false,
  async execute(args, ctx) {
    return await getRecap(ctx.userId);
  },
  transform(raw) {
    const onDay = raw?.onThisDay || [];
    const buried = raw?.buried || [];
    if (!onDay.length && !buried.length) return '暂无可回顾的内容(那年今日 / 尘封收藏都为空)。';
    const fmt = (x) =>
      `《${x.title || '无标题'}》${x.url ? ` ${x.url}` : ''}${x.create_time ? ` (${new Date(x.create_time).toLocaleDateString('zh-CN')})` : ''}`;
    const out = [];
    if (onDay.length) out.push('那年今日(历史上的今天):\n' + onDay.map((x, i) => `${i + 1}. ${fmt(x)}`).join('\n'));
    if (buried.length) out.push('尘封回顾(很久没看的):\n' + buried.map((x, i) => `${i + 1}. ${fmt(x)}`).join('\n'));
    return out.join('\n\n');
  },
  summarize(raw) {
    return `回顾:那年今日 ${raw?.onThisDay?.length || 0} 条 · 尘封 ${raw?.buried?.length || 0} 条`;
  },
};
