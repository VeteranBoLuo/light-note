import { createNote } from '../../services/noteService.js';

function firstValue(args, keys) {
  for (const key of keys) {
    const value = args?.[key];
    if (value != null && String(value).trim()) return String(value);
  }
  return '';
}

export function normalizeCreateNoteArgs(args = {}) {
  return {
    title: firstValue(args, ['title', 'noteTitle', 'note_title', 'name']).trim(),
    content: firstValue(args, ['content', 'noteContent', 'note_content', 'body', 'markdown']).trim(),
  };
}

function validateCreateNoteArgs(args) {
  const normalized = normalizeCreateNoteArgs(args);
  if (!normalized.title) throw new Error('TITLE_REQUIRED: 笔记标题不能为空');
  if (normalized.title.length > 255) throw new Error('TITLE_TOO_LONG: 笔记标题不能超过 255 个字符');
  if (normalized.content.length > 60000) throw new Error('CONTENT_TOO_LONG: 笔记正文不能超过 60000 个字符');
  return normalized;
}

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
  normalizeArgs: normalizeCreateNoteArgs,
  preview(args) {
    const { title, content } = validateCreateNoteArgs(args);
    return {
      title: '创建笔记',
      target: title,
      impact: content
        ? `确认后将创建一篇约 ${content.length} 字的 Markdown 笔记`
        : '确认后将创建一篇空白 Markdown 笔记',
    };
  },
  async execute(args, ctx) {
    let normalized;
    try {
      normalized = validateCreateNoteArgs(args);
    } catch (error) {
      const match = /^([A-Z][A-Z0-9_]+):\s*(.+)$/.exec(String(error?.message || ''));
      return {
        error: match?.[1] || 'TOOL_ARGUMENTS_INVALID',
        message: match?.[2] || '创建笔记参数无效',
      };
    }
    const { title, content } = normalized;

    const result = await createNote({
      userId: ctx.userId,
      userRole: ctx.userRole,
      note: {
        title,
        content,
        type: 'markdown',
      },
      request: ctx.request,
      suppressUserRewards: ctx.suppressUserRewards,
      maxContentLength: 60000,
      idempotencyKey: ctx.idempotencyKey,
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
