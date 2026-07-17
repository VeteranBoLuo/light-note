import { saveAttachmentToCloud } from '../../services/attachmentActionService.js';

function firstValue(args, keys) {
  for (const key of keys) {
    const value = args?.[key];
    if (value != null && String(value).trim()) return String(value).trim();
  }
  return '';
}

export function normalizeSaveAttachmentArgs(args = {}) {
  return {
    attachmentId: firstValue(args, ['attachmentId', 'attachment_id', 'sourceId', 'source_id', 'documentId']),
    fileName: firstValue(args, ['fileName', 'file_name', 'name']),
  };
}

function validateArgs(args) {
  const normalized = normalizeSaveAttachmentArgs(args);
  if (!normalized.attachmentId) throw new Error('ATTACHMENT_ID_REQUIRED: 缺少要保存的附件 ID');
  if (normalized.fileName.length > 255) throw new Error('FILE_NAME_INVALID: 文件名不能超过 255 个字符');
  return normalized;
}

export default {
  name: 'save_attachment_to_cloud',
  description:
    '把用户本轮已上传的附件原文件保存到当前账号的云空间。attachmentId 必须取自本轮 [attachment:ID] 上下文；无需等待文字解析或 OCR 成功。已有云空间文件不会重复保存。',
  parameters: {
    type: 'object',
    properties: {
      attachmentId: { type: 'string', description: '本轮附件上下文中的 attachment ID，必填' },
      fileName: { type: 'string', description: '可选的新文件名；不能改变原扩展名' },
    },
    required: ['attachmentId'],
  },
  requireRoot: false,
  isWrite: true,
  riskLevel: 'low',
  confirmationPolicy: 'default',
  normalizeArgs: normalizeSaveAttachmentArgs,
  preview(args) {
    const normalized = validateArgs(args);
    return {
      title: '保存附件到云空间',
      target: normalized.fileName || `附件 ${normalized.attachmentId}`,
      impact: '确认后将保留附件原文件，不依赖 OCR 或文字解析结果，并占用相应云空间容量',
    };
  },
  async execute(args, ctx) {
    const normalized = validateArgs(args);
    return saveAttachmentToCloud({
      userId: ctx.userId,
      userRole: ctx.userRole,
      ...normalized,
      request: ctx.request,
      suppressUserRewards: ctx.suppressUserRewards,
    });
  },
  transform(raw) {
    return raw.alreadySaved
      ? `文件“${raw.fileName}”已经在云空间中（ID: ${raw.id}），无需重复保存。`
      : `✅ 文件“${raw.fileName}”已保存到云空间（ID: ${raw.id}）。`;
  },
  summarize(raw) {
    return raw.alreadySaved ? `文件“${raw.fileName}”原本就在云空间` : `文件“${raw.fileName}”已保存到云空间`;
  },
};
