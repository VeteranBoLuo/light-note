import { getRecap } from '../../recap.js';

// 本周内容 + 那年今日 + 尘封回顾(只读)。
export default {
  name: 'get_recap',
  description:
    '生成内容回顾：包含最近7天新增的书签/笔记、"那年今日"以及很久没动过的尘封收藏。优先回答"生成我的本周回顾""那年今日我存了啥""有什么久没看的收藏"；仅列出最近内容时可改用书签/笔记查询。',
  routing: {
    targetScope: 'single_owner',
    requireAny: [
      /(?:本周|这周|最近\s*7\s*天).{0,16}(?:内容)?(?:回顾|复盘)|(?:那年今日|历史上的今天|尘封(?:内容|收藏)?|很久没看|久未查看|weekly\s+(?:recap|review))/iu,
    ],
    preferAny: [/(?:回顾|复盘|那年今日|历史上的今天|尘封|很久没看|久未查看|recap|review)/iu],
    excludeAny: [/(?:挑战|任务|积分|领奖|创建|新建|保存为|写入|导出)/iu],
  },
  parameters: { type: 'object', properties: {} },
  requireRoot: false,
  async execute(args, ctx) {
    return await getRecap(ctx.userId);
  },
  transform(raw) {
    const weekly = raw?.weekly || [];
    const onDay = raw?.onThisDay || [];
    const buried = raw?.buried || [];
    if (!weekly.length && !onDay.length && !buried.length) {
      return '暂无可回顾的内容（最近 7 天、那年今日与尘封收藏都为空）。';
    }
    const fmt = (x) =>
      `《${x.title || '无标题'}》${x.url ? ` ${x.url}` : ''}${x.create_time ? ` (${new Date(x.create_time).toLocaleDateString('zh-CN')})` : ''}`;
    const out = [];
    if (weekly.length) out.push('最近 7 天新增内容:\n' + weekly.map((x, i) => `${i + 1}. ${fmt(x)}`).join('\n'));
    if (onDay.length) out.push('那年今日(历史上的今天):\n' + onDay.map((x, i) => `${i + 1}. ${fmt(x)}`).join('\n'));
    if (buried.length) out.push('尘封回顾(很久没看的):\n' + buried.map((x, i) => `${i + 1}. ${fmt(x)}`).join('\n'));
    return out.join('\n\n');
  },
  summarize(raw) {
    return `回顾:最近7天 ${raw?.weekly?.length || 0} 条 · 那年今日 ${raw?.onThisDay?.length || 0} 条 · 尘封 ${raw?.buried?.length || 0} 条`;
  },
};
