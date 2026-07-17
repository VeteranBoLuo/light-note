import type { AiToolConfirmation, AiToolConfirmationPreview } from '@/types/aiAgent';

export interface AttachmentConfirmationPreviewLabels {
  rootFolder: string;
  noDescription: string;
  unknownValue: string;
  saveImpact: string;
  saveCreateFolderImpact: string;
  saveAlreadySavedImpact: string;
  createImageNoteImpact: string;
}

function textArg(args: Record<string, unknown>, key: string) {
  const value = args[key];
  return value == null ? '' : String(value).trim();
}

function formatFileSize(value: unknown, unknownValue: string) {
  const size = Number(value || 0);
  if (!Number.isFinite(size) || size <= 0) return unknownValue;
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

/**
 * 两个附件写工具的 args 已由服务端 prepareArgs 校验、补全并写进不可篡改的确认令牌。
 * 前端只用同一份权威 args 组织本地化展示，不改变或重建执行参数。
 */
export function buildLocalizedAttachmentConfirmationPreview(
  confirmation: AiToolConfirmation,
  labels: AttachmentConfirmationPreviewLabels,
): AiToolConfirmationPreview | undefined {
  const args = confirmation.args || {};
  if (confirmation.toolName === 'save_attachment_to_cloud') {
    const originalFileName = textArg(args, 'sourceFileName');
    const fileName = textArg(args, 'fileName') || originalFileName;
    if (!fileName) return undefined;
    const folder = textArg(args, 'folderName') || labels.rootFolder;
    return {
      target: `${folder} / ${fileName}`,
      impact: args.alreadySaved
        ? labels.saveAlreadySavedImpact
        : textArg(args, 'folderStrategy') === 'create_if_missing'
          ? labels.saveCreateFolderImpact
          : labels.saveImpact,
      details: [
        { key: 'originalFileName', value: originalFileName || labels.unknownValue },
        { key: 'fileName', value: fileName },
        { key: 'folder', value: folder },
        { key: 'fileSize', value: formatFileSize(args.fileSize, labels.unknownValue) },
      ],
    };
  }

  if (confirmation.toolName === 'create_image_note') {
    const originalFileName = textArg(args, 'sourceFileName');
    const title = textArg(args, 'title') || originalFileName;
    if (!title) return undefined;
    return {
      target: title,
      impact: labels.createImageNoteImpact,
      details: [
        { key: 'originalFileName', value: originalFileName || labels.unknownValue },
        { key: 'noteTitle', value: title },
        { key: 'description', value: textArg(args, 'description') || labels.noDescription },
        { key: 'fileSize', value: formatFileSize(args.fileSize, labels.unknownValue) },
      ],
    };
  }

  return undefined;
}
