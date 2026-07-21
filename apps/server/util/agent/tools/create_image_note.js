import {
  createImageNoteFromAttachment,
  prepareCreateImageNoteFromAttachment,
} from '../../services/attachmentActionService.js';

function firstValue(args, keys) {
  for (const key of keys) {
    const value = args?.[key];
    if (value != null && String(value).trim()) return String(value).trim();
  }
  return '';
}

export function normalizeCreateImageNoteArgs(args = {}) {
  return {
    attachmentId: firstValue(args, ['attachmentId', 'attachment_id', 'sourceId', 'source_id', 'documentId']),
    title: firstValue(args, ['title', 'noteTitle', 'note_title', 'name']),
    description: firstValue(args, ['description', 'content', 'caption', 'noteContent', 'note_content']),
  };
}

function validateArgs(args) {
  const normalized = normalizeCreateImageNoteArgs(args);
  if (!normalized.attachmentId) throw new Error('ATTACHMENT_ID_REQUIRED: 缺少要插入笔记的附件 ID');
  if (normalized.title.length > 255) throw new Error('TITLE_TOO_LONG: 笔记标题不能超过 255 个字符');
  if (normalized.description.length > 5000) throw new Error('CONTENT_TOO_LONG: 图片说明不能超过 5000 个字符');
  return normalized;
}

function formatSize(bytes) {
  const size = Number(bytes || 0);
  if (!Number.isFinite(size) || size <= 0) return '未知';
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

export default {
  name: 'create_image_note',
  sourceType: 'note',
  description:
    '把用户本轮上传的 PNG、JPG、JPEG 或 WebP 原图插入一篇新的 HTML 图片笔记。attachmentId 必须取自本轮 [attachment:ID] 上下文；不要求图片含文字，也不依赖 OCR 成功。',
  parameters: {
    type: 'object',
    properties: {
      attachmentId: { type: 'string', description: '本轮图片附件上下文中的 attachment ID，必填' },
      title: { type: 'string', description: '笔记标题；留空时使用图片文件名' },
      description: { type: 'string', description: '可选的图片说明，放在图片上方' },
    },
    required: ['attachmentId'],
  },
  requireRoot: false,
  isWrite: true,
  directAction: true,
  riskLevel: 'low',
  confirmationPolicy: 'default',
  argumentAliases: [
    'attachment_id',
    'sourceId',
    'source_id',
    'documentId',
    'noteTitle',
    'note_title',
    'name',
    'content',
    'caption',
    'noteContent',
    'note_content',
  ],
  normalizeArgs: normalizeCreateImageNoteArgs,
  async prepareArgs(args, ctx) {
    const normalized = validateArgs(args);
    return prepareCreateImageNoteFromAttachment({ userId: ctx.userId, ...normalized });
  },
  preview(args) {
    const normalized = { ...args, ...validateArgs(args) };
    return {
      title: '创建图片笔记',
      target: normalized.title || normalized.sourceFileName || `附件 ${normalized.attachmentId}`,
      impact: '确认后将创建一篇 HTML 笔记，并把上传的原图插入正文；无需 OCR 识别到文字',
      details: [
        { key: 'originalFileName', value: normalized.sourceFileName || `附件 ${normalized.attachmentId}` },
        { key: 'noteTitle', value: normalized.title || '使用图片文件名' },
        { key: 'description', value: normalized.description || '无' },
        { key: 'fileSize', value: formatSize(normalized.fileSize) },
      ],
    };
  },
  async execute(args, ctx) {
    const normalized = validateArgs(args);
    return createImageNoteFromAttachment({
      userId: ctx.userId,
      userRole: ctx.userRole,
      ...normalized,
      request: ctx.request,
      suppressUserRewards: ctx.suppressUserRewards,
      idempotencyKey: ctx.idempotencyKey,
    });
  },
  transform(raw) {
    return `✅ 图片笔记“${raw.title}”已创建成功（ID: ${raw.id}）。`;
  },
  summarize(raw) {
    return `图片笔记“${raw.title}”创建成功`;
  },
};
