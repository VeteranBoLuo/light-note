import { getHealthSummary } from '../../linkHealth.js';

// 死链体检结果(只读)。返回总数/已检测数 + 疑似失效书签清单。
export default {
  name: 'query_link_health',
  description:
    '查询当前用户书签的死链体检结果:链接总数、已检测数,以及"疑似失效"(可能打不开)的书签清单。回答"我有哪些失效/打不开的书签""死链检测结果""哪些收藏链接坏了"。',
  parameters: { type: 'object', properties: {} },
  requireRoot: false,
  async execute(args, ctx) {
    return await getHealthSummary(ctx.userId);
  },
  transform(raw) {
    const suspect = raw?.suspect || [];
    const head = `死链体检:共 ${raw?.total || 0} 个链接,已检测 ${raw?.checked || 0} 个${raw?.running ? '(检测进行中)' : ''}`;
    if (!suspect.length) return `${head}。未发现疑似失效的书签 👍`;
    const lines = suspect
      .slice(0, 15)
      .map((x, i) => `${i + 1}. 《${x.name || '无标题'}》 ${x.url || ''}${x.hasSnapshot ? ' (有正文存档可回看)' : ''}`);
    return `${head}。疑似失效 ${suspect.length} 个:\n${lines.join('\n')}`;
  },
  summarize(raw) {
    return `死链体检:疑似失效 ${raw?.suspect?.length || 0} 个`;
  },
};
