import { getHealthSummary, startFullCheck } from '../../linkHealth.js';
import { createBookmarkHealthArtifact } from '../artifact.js';

export default {
  name: 'start_link_health_check',
  description:
    '立即启动当前账号全部书签的真实死链体检，并返回可持续刷新的进度任务卡。用户说“我有哪些失效链接”“帮我检查死链”“开始/重新体检”等希望得到当下真实结果的问法时优先调用本工具。只有用户明确说“上次/最近结果”“现在进度”“不要重新检查”时才使用 query_link_health。重复调用会复用正在执行的同一轮任务。',
  // 这是会启动后台任务的操作型能力，但不会修改用户内容，也不需要写操作确认卡。
  // semanticEffect 只影响 TurnSpec 路由；真正的执行/确认策略仍由 isWrite 决定。
  semanticEffect: 'write',
  semanticOperations: ['create'],
  routing: {
    targetScope: 'single_owner',
    requireAny: [
      /(?:立即|现在|开始|重新|帮我|当前).{0,20}(?:检查|体检|扫描).{0,16}(?:死链|失效|书签|链接)|(?:哪些|有什么|查找).{0,12}(?:失效|无效|打不开).{0,8}(?:书签|链接)|(?:死链|失效链接).{0,16}(?:检查|体检|扫描)/iu,
    ],
    preferAny: [/(?:立即|现在|开始|重新|检查|体检|扫描).{0,20}(?:死链|失效|书签|链接)/iu],
    excludeAny: [/(?:上次|最近一次|历史|记录|进度|不要重新|只看)/iu],
  },
  parameters: { type: 'object', properties: {} },
  requireRoot: false,
  timeoutMs: 20_000,
  async execute(args, ctx) {
    if (!ctx.userId || ctx.userRole === 'visitor') {
      return { error: 'BOOKMARK_HEALTH_LOGIN_REQUIRED', message: '登录后才能执行书签死链体检。' };
    }
    const started = await startFullCheck(ctx.userId);
    return started?.running ? started : await getHealthSummary(ctx.userId);
  },
  toArtifacts(raw) {
    return [createBookmarkHealthArtifact(raw)];
  },
  transform(raw) {
    if (raw?.error) return raw.message || '死链体检未启动。';
    if (raw?.already) {
      return `书签死链体检已经在执行，本次没有重复启动。当前进度 ${raw.checked || 0}/${raw.total || 0}，请以任务卡的实时数字为准。`;
    }
    return `已真实启动书签死链体检，共 ${raw?.total || 0} 个链接。任务会在后台继续，进度和结果以任务卡为准。`;
  },
  summarize(raw) {
    return raw?.already ? '复用正在执行的书签死链体检' : '已启动书签死链体检';
  },
};
