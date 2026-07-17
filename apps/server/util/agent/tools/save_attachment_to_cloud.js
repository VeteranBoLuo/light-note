import { prepareSaveAttachmentToCloud, saveAttachmentToCloud } from '../../services/attachmentActionService.js';

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
    folderId: firstValue(args, ['folderId', 'folder_id', 'directoryId', 'directory_id']),
    folderName: firstValue(args, ['folderName', 'folder_name', 'folder', 'directoryName', 'directory_name']),
    folderStrategy: firstValue(args, ['folderStrategy', 'folder_strategy', 'missingFolderPolicy']) || 'existing',
  };
}

function validateArgs(args) {
  const normalized = normalizeSaveAttachmentArgs(args);
  if (!normalized.attachmentId) throw new Error('ATTACHMENT_ID_REQUIRED: 缺少要保存的附件 ID');
  if (normalized.fileName.length > 255) throw new Error('FILE_NAME_INVALID: 文件名不能超过 255 个字符');
  if (normalized.folderName.length > 255) throw new Error('FOLDER_NAME_INVALID: 文件夹名称不能超过 255 个字符');
  if (!['existing', 'root', 'create_if_missing'].includes(normalized.folderStrategy)) {
    throw new Error('FOLDER_STRATEGY_INVALID: 文件夹处理方式无效');
  }
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
  name: 'save_attachment_to_cloud',
  description:
    '把用户本轮已上传的附件原文件保存到当前账号的云空间。attachmentId 必须取自本轮 [attachment:ID] 上下文；fileName 可自定义文件名，folderId/folderName 可指定已有文件夹（ID 优先，名称必须精确匹配）；无需等待文字解析或 OCR 成功。已有云空间文件不会重复保存。',
  parameters: {
    type: 'object',
    properties: {
      attachmentId: { type: 'string', description: '本轮附件上下文中的 attachment ID，必填' },
      fileName: { type: 'string', description: '可选的新文件名；不能改变原扩展名' },
      folderId: { type: 'string', description: '可选，目标云空间文件夹 ID；来自文件夹选择器时以它为准' },
      folderName: { type: 'string', description: '可选，目标已有文件夹的精确名称；不填则保存到根目录' },
    },
    required: ['attachmentId'],
  },
  requireRoot: false,
  isWrite: true,
  directAction: true,
  riskLevel: 'low',
  confirmationPolicy: 'default',
  normalizeArgs: normalizeSaveAttachmentArgs,
  async prepareArgs(args, ctx) {
    const normalized = validateArgs(args);
    return prepareSaveAttachmentToCloud({ userId: ctx.userId, ...normalized });
  },
  preview(args) {
    const normalized = { ...args, ...validateArgs(args) };
    const targetFolder = normalized.folderName || '云空间根目录';
    const createsFolder = normalized.folderStrategy === 'create_if_missing';
    return {
      title: '保存附件到云空间',
      target: `${targetFolder} / ${normalized.fileName || normalized.sourceFileName || `附件 ${normalized.attachmentId}`}`,
      impact: normalized.alreadySaved
        ? '该附件已经保存在云空间，确认后不会重复创建文件'
        : createsFolder
          ? `确认后若“${targetFolder}”仍不存在，将创建该文件夹并保存原文件`
          : '确认后将保留附件原文件，不依赖 OCR 或文字解析结果，并占用相应云空间容量',
      details: [
        { key: 'originalFileName', value: normalized.sourceFileName || `附件 ${normalized.attachmentId}` },
        { key: 'fileName', value: normalized.fileName || normalized.sourceFileName || '沿用原文件名' },
        { key: 'folder', value: targetFolder },
        { key: 'fileSize', value: formatSize(normalized.fileSize) },
      ],
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
    const location = raw.folderName ? `文件夹“${raw.folderName}”` : '云空间根目录';
    const folderPrefix = raw.folderCreated ? `已新建文件夹“${raw.folderName}”，` : '';
    return raw.alreadySaved
      ? `文件“${raw.fileName}”已经在${location}中（ID: ${raw.id}），无需重复保存。`
      : `✅ ${folderPrefix}文件“${raw.fileName}”已保存到${location}（ID: ${raw.id}）。`;
  },
  summarize(raw) {
    if (raw.alreadySaved) return `文件“${raw.fileName}”原本就在云空间`;
    return raw.folderCreated
      ? `已新建文件夹“${raw.folderName}”并保存文件“${raw.fileName}”`
      : `文件“${raw.fileName}”已保存到云空间`;
  },
};
