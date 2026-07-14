import { createNote } from '../../services/noteService.js';

export default {
  name: 'create_note',
  description: '创建一条新笔记。参数 title 为笔记标题，content 为正文内容。仅创建笔记本身，不处理标签关联。',
  parameters: {
    type: 'object',
    properties: {
      title: { type: 'string', description: '笔记标题，必填' },
      content: { type: 'string', description: '笔记内容正文，支持多行文本' },
    },
    required: ['title'],
  },
  requireRoot: false,
  isWrite: true,
  riskLevel: 'low',
  confirmationPolicy: 'default',
  async execute(args, ctx) {
    const { title, content = '' } = args;
    if (!title?.trim()) {
      return { error: 'TITLE_REQUIRED', message: '笔记标题不能为空' };
    }

    const result = await createNote({
      userId: ctx.userId,
      userRole: ctx.userRole,
      note: {
        title: title.trim(),
        content: String(content).trim(),
        type: 'markdown',
      },
      request: ctx.request,
      suppressUserRewards: ctx.suppressUserRewards,
      maxContentLength: 60000,
    });
    return { id: result.id, title: result.title, type: result.type };
  },
  transform(raw) {
    if (raw.error) return `创建失败：${raw.message}`;
    return `✅ 笔记「${raw.title}」已创建成功（ID: ${raw.id}）`;
  },
  summarize(raw) {
    if (raw.error) return `创建笔记失败：${raw.message}`;
    return `创建笔记「${raw.title}」成功`;
  },
};
