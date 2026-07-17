import type { AiAttachment } from '@/api/aiAttachmentApi';
import type { AiAttachmentDirectActionName } from '@/config/aiTools';

export interface AiAttachmentActionRequest {
  toolName: AiAttachmentDirectActionName;
  args: Record<string, unknown>;
}

export interface AiAttachmentActionDraft {
  toolName: AiAttachmentDirectActionName;
  attachmentId: string;
  fileName: string;
  folderId: string;
  folderName: string;
  folderStrategy: 'existing' | 'root' | 'create_if_missing';
  title: string;
  description: string;
}

function textValue(value: unknown) {
  return value == null ? '' : String(value).trim();
}

function defaultNoteTitle(fileName: string) {
  const title = String(fileName || '')
    .replace(/\.[^.]+$/, '')
    .trim();
  return title || String(fileName || '').trim();
}

export function createAttachmentActionDraft(
  toolName: AiAttachmentDirectActionName,
  attachment: AiAttachment,
  initialArgs: Record<string, unknown> = {},
): AiAttachmentActionDraft {
  const folderId = textValue(initialArgs.folderId || initialArgs.folder_id);
  const rawFolderStrategy = textValue(initialArgs.folderStrategy);
  const folderStrategy = ['root', 'create_if_missing'].includes(rawFolderStrategy)
    ? (rawFolderStrategy as 'root' | 'create_if_missing')
    : 'existing';
  return {
    toolName,
    attachmentId: attachment.id,
    fileName: textValue(initialArgs.fileName || initialArgs.file_name) || attachment.fileName,
    folderId,
    // 已有文件夹的 ID 是权威选择；后端返回的 folderName 只是预览标签，不能误当成“自定义名称”。
    folderName:
      folderId || folderStrategy === 'root'
        ? ''
        : textValue(initialArgs.folderName || initialArgs.folder_name || initialArgs.directoryName),
    folderStrategy,
    title:
      textValue(initialArgs.title || initialArgs.noteTitle || initialArgs.note_title) ||
      defaultNoteTitle(attachment.fileName),
    description: textValue(
      initialArgs.description || initialArgs.caption || initialArgs.noteContent || initialArgs.note_content,
    ),
  };
}

export function buildAttachmentActionRequest(draft: AiAttachmentActionDraft): AiAttachmentActionRequest {
  if (draft.toolName === 'save_attachment_to_cloud') {
    return {
      toolName: draft.toolName,
      args: {
        attachmentId: draft.attachmentId,
        fileName: draft.fileName.trim(),
        folderId: draft.folderName.trim() ? '' : draft.folderId || '',
        folderName: draft.folderName.trim(),
        folderStrategy: draft.folderStrategy,
      },
    };
  }
  return {
    toolName: draft.toolName,
    args: {
      attachmentId: draft.attachmentId,
      title: draft.title.trim(),
      description: draft.description.trim(),
    },
  };
}

export function preservesAttachmentExtension(fileName: string, originalFileName: string) {
  const extension = (value: string) => {
    const normalized = String(value || '').trim();
    const dotIndex = normalized.lastIndexOf('.');
    return dotIndex > 0 ? normalized.slice(dotIndex).toLowerCase() : '';
  };
  const requestedExtension = extension(fileName);
  return !requestedExtension || requestedExtension === extension(originalFileName);
}

/**
 * 只读生成型快捷项是“提问建议”，不是不可修改的命令。
 * 输入框已有草稿时追加，不覆盖；重复点击同一建议也不重复堆叠。
 */
export function mergePromptSuggestion(currentValue: string, suggestion: string) {
  const current = String(currentValue || '');
  const normalizedCurrent = current.trim();
  const next = String(suggestion || '').trim();
  if (!next || normalizedCurrent.includes(next)) return current;
  if (!normalizedCurrent) return next;
  return `${current}${current.endsWith('\n') ? '' : '\n'}${next}`;
}
