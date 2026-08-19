import { createNote } from '../../services/noteService.js';
import { resolveOwnedNoteCreateTarget } from '../../services/noteTreeService.js';

function firstValue(args, keys) {
  for (const key of keys) {
    const value = args?.[key];
    if (value != null && String(value).trim()) return String(value);
  }
  return '';
}

export function normalizeCreateNoteArgs(args = {}) {
  const parentId = firstValue(args, ['parentId', 'parent_id']).trim();
  return {
    title: firstValue(args, ['title', 'noteTitle', 'note_title', 'name']).trim(),
    content: firstValue(args, ['content', 'noteContent', 'note_content', 'body', 'markdown']).trim(),
    ...(parentId ? { parentId } : {}),
  };
}

function validateCreateNoteArgs(args) {
  const normalized = normalizeCreateNoteArgs(args);
  if (!normalized.title) throw new Error('TITLE_REQUIRED: 笔记标题不能为空');
  if (normalized.title.length > 255) throw new Error('TITLE_TOO_LONG: 笔记标题不能超过 255 个字符');
  if (normalized.content.length > 60000) throw new Error('CONTENT_TOO_LONG: 笔记正文不能超过 60000 个字符');
  if (normalized.parentId && normalized.parentId.length > 255) {
    throw new Error('NOTE_PARENT_ID_INVALID: 目标目录参数无效');
  }
  return normalized;
}

export default {
  name: 'create_note',
  sourceType: 'note',
  description:
    '创建一条新笔记。参数 title 为笔记标题，content 为正文内容；parentId 是可选的目标父页面 ID，省略时创建在“我的知识库”根目录。仅创建笔记本身，不处理标签关联。',
  routing: {
    targetScope: 'single_owner',
    requireAny: [
      /(?:创建|新建|生成|写|整理|保存|产出).{0,24}(?:Markdown\s*)?(?:笔记|新笔记)|(?:笔记|新笔记).{0,24}(?:创建|新建|生成|写|整理|保存|产出)|(?:create|generate|write|save).{0,24}(?:markdown\s+)?note/iu,
    ],
    preferAny: [/(?:笔记|新笔记|markdown\s+note)/iu],
    excludeAny: [/(?:知识库|帮助中心|知识条目|knowledge\s+base|help\s+center)/iu],
  },
  parameters: {
    type: 'object',
    properties: {
      title: { type: 'string', description: '笔记标题，必填' },
      content: { type: 'string', description: '笔记内容正文，支持多行文本' },
      parentId: { type: 'string', maxLength: 255, description: '目标父页面 ID；省略表示“我的知识库”根目录' },
    },
    required: ['title'],
  },
  requireRoot: false,
  isWrite: true,
  riskLevel: 'low',
  confirmationPolicy: 'default',
  argumentAliases: ['noteTitle', 'note_title', 'name', 'noteContent', 'note_content', 'body', 'markdown', 'parent_id'],
  normalizeArgs: normalizeCreateNoteArgs,
  async preview(args, ctx = {}) {
    const { title, content, parentId } = validateCreateNoteArgs(args);
    const target = await resolveOwnedNoteCreateTarget({ userId: ctx.userId, parentId: parentId || null });
    const targetDirectory = target.items.map((item) => item.title || '未命名页面').join(' / ');
    return {
      title: '创建笔记',
      target: title,
      impact: content
        ? `确认后将创建一篇约 ${content.length} 字的 Markdown 笔记`
        : '确认后将创建一篇空白 Markdown 笔记',
      details: [{ key: 'targetDirectory', value: targetDirectory }],
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
    const { title, content, parentId } = normalized;

    const result = await createNote({
      userId: ctx.userId,
      userRole: ctx.userRole,
      note: {
        title,
        content,
        type: 'markdown',
        parentId: parentId || null,
      },
      request: ctx.request,
      suppressUserRewards: ctx.suppressUserRewards,
      maxContentLength: 60000,
      idempotencyKey: ctx.idempotencyKey,
    });
    return { id: result.id, title: result.title, type: result.type, parentId: result.parentId ?? null };
  },
  transform(raw) {
    if (raw.error) return `创建失败：${raw.message}`;
    return `✅ 笔记「${raw.title}」已创建成功`;
  },
  summarize(raw) {
    if (raw.error) return `创建笔记失败：${raw.message}`;
    return `创建笔记「${raw.title}」成功`;
  },
};
