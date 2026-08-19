import { findKnowledgeByTitle, upsertKnowledgeBase } from '../../services/knowledgeBaseService.js';
import { resolveKnowledgeSourceTarget } from '../sourceUtils.js';

export default {
  name: 'write_knowledge_base',
  appliesToDomains: ['content', 'note'],
  description:
    '新增或更新知识库条目。当用户要求"记录""写一篇""存到知识库""新增知识"时使用。如果 title 匹配已有条目则更新，否则新建。仅限 root 用户使用。',
  routing: {
    requireAny: [
      /(?:写入|新增|创建|新建|更新|保存|存入|记录).{0,24}(?:知识库|帮助中心|知识条目)|(?:知识库|帮助中心|知识条目).{0,24}(?:写入|新增|创建|新建|更新|保存|存入|记录)|(?:write|add|create|update|save).{0,24}(?:knowledge\s+base|help\s+center)/iu,
    ],
    preferAny: [/(?:知识库|帮助中心|知识条目|knowledge\s+base|help\s+center)/iu],
  },
  parameters: {
    type: 'object',
    properties: {
      title: { type: 'string', description: '知识标题，必填' },
      content: { type: 'string', description: '知识内容正文，支持 HTML 或 Markdown' },
      category: { type: 'string', description: '分类，可选值：帮助中心 / 内部知识 / FAQ / 系统行为' },
      status: { type: 'string', description: '状态，public 或 internal，默认 internal' },
      type: { type: 'string', description: '内容类型，html 或 markdown' },
    },
    required: ['title'],
  },
  requireRoot: true,
  isWrite: true,
  riskLevel: 'high',
  confirmationPolicy: 'always',
  toSources(raw, args, ctx) {
    if (raw?.error || !raw?.id) return [];
    const source = {
      type: 'knowledge',
      id: raw.id,
      title: raw.title,
      category: String(args.category || '内部知识'),
      status: String(args.status || 'internal'),
    };
    return [{ ...source, target: resolveKnowledgeSourceTarget(source, ctx.userRole) }];
  },
  async preview(args) {
    const title = String(args.title || '').trim();
    if (!title) throw new Error('TITLE_REQUIRED: 标题不能为空');
    if (title.length > 255) throw new Error('TITLE_TOO_LONG: 标题不能超过 255 个字符');
    const existing = await findKnowledgeByTitle(title);
    return {
      title: existing ? '更新知识库条目' : '创建知识库条目',
      target: title,
      impact: existing ? `将覆盖现有条目 ${existing.id} 的正文和分类配置` : '将新增一条知识库内容',
    };
  },
  async execute(args, ctx) {
    const title = String(args.title || '').trim();
    if (!title) return { error: 'TITLE_REQUIRED', message: '标题不能为空' };

    return upsertKnowledgeBase({
      userId: ctx.userId,
      input: {
        title,
        content: String(args.content || ''),
        category: String(args.category || '内部知识'),
        status: String(args.status || 'internal'),
        type: String(args.type || 'markdown'),
      },
      maxContentLength: 100000,
    });
  },
  transform(raw) {
    if (raw.error) return `写入失败：${raw.message}`;
    if (raw.action === 'updated') return `✅ 知识「${raw.title}」已更新`;
    return `✅ 知识「${raw.title}」已创建成功`;
  },
  summarize(raw) {
    if (raw.error) return `写入知识库失败：${raw.message}`;
    return `写入知识库：${raw.action} 「${raw.title}」`;
  },
};
