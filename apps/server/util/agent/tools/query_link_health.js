import { getHealthSummary } from '../../linkHealth.js';
import { createBookmarkHealthArtifact } from '../artifact.js';

// 只读取当前/最近一次体检状态，不会暗中启动扫描。显式体检由 start_link_health_check 执行。
export default {
  name: 'query_link_health',
  description:
    '只读取当前或最近一次书签死链体检的真实状态、检测时间、进度和疑似失效清单；绝对不会启动新体检。仅适用于“上次/最近体检结果”“现在检查到哪里了”“不要重新检查，只看记录”。对无时间限定的“我有哪些失效链接”，必须使用 start_link_health_check 获取当下真实结果。',
  routing: {
    targetScope: 'single_owner',
    requireAny: [
      /(?:上次|最近一次|历史|记录|进度|不要重新|只看).{0,24}(?:体检|检查|死链|失效|链接)|(?:体检|检查).{0,16}(?:结果|状态|进度|记录)/iu,
    ],
    preferAny: [/(?:上次|最近一次|不要重新|只看|结果|进度|记录)/iu],
  },
  parameters: { type: 'object', properties: {} },
  requireRoot: false,
  toSources(raw) {
    return (raw?.suspect || []).map((item) => ({
      type: 'bookmark',
      id: item.id,
      title: item.name,
      url: item.url,
      hasSnapshot: Boolean(item.hasSnapshot),
      target: item.hasSnapshot ? 'bookmark-snapshot' : 'bookmark-edit',
    }));
  },
  async execute(args, ctx) {
    return await getHealthSummary(ctx.userId);
  },
  toArtifacts(raw) {
    return [createBookmarkHealthArtifact(raw)];
  },
  transform(raw) {
    const suspect = raw?.suspect || [];
    const checkedAt = raw?.lastCheckedAt ? `，最近检测时间 ${new Date(raw.lastCheckedAt).toLocaleString('zh-CN')}` : '';
    const head = raw?.running
      ? `一轮真实死链体检正在执行：共 ${raw?.total || 0} 个链接，已检测 ${raw?.checked || 0} 个`
      : `这是最近保存的死链体检记录：共 ${raw?.total || 0} 个链接，已检测 ${raw?.checked || 0} 个${checkedAt}`;
    if (!raw?.running && !raw?.checked) return `${head}。目前还没有可用结果，可通过结果卡开始体检。`;
    if (!suspect.length) {
      return `${head}。记录中没有疑似失效项，另有 ${raw?.unknown || 0} 个链接暂时无法判断；这不是一次刚刚执行的新检查。`;
    }
    const lines = suspect
      .slice(0, 15)
      .map((x, i) => `${i + 1}. 《${x.name || '无标题'}》 ${x.url || ''}${x.hasSnapshot ? ' (有正文存档可回看)' : ''}`);
    return `${head}。记录中疑似失效 ${suspect.length} 个，暂时无法判断 ${raw?.unknown || 0} 个：\n${lines.join('\n')}`;
  },
  summarize(raw) {
    return `死链体检:疑似失效 ${raw?.suspect?.length || 0} 个`;
  },
};
