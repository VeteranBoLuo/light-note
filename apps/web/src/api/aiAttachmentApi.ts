import axios from 'axios';
import { apiBasePost } from '@/http/request';

export type AiAttachmentStatus = 'awaiting_upload' | 'queued' | 'parsing' | 'ready' | 'no_text' | 'failed';

export interface AiAttachment {
  id: string;
  sourceType: 'temporary' | 'cloud';
  fileId?: string | null;
  fileName: string;
  fileType: string;
  fileSize: number;
  status: AiAttachmentStatus;
  errorCode?: string;
  errorMessage?: string;
  extractedChars?: number;
  chunkCount?: number;
  expiresAt?: string | Date | null;
}

interface InitUploadResult {
  attachment: AiAttachment;
  uploadUrl: string;
  headers: Record<string, string>;
  expiresIn: number;
}

function assertSuccess(response: any): any {
  if (response?.status !== 200) {
    const error = new Error(response?.msg || '文件处理失败') as Error & { code?: string; status?: number };
    error.code = response?.data?.code || 'AI_DOCUMENT_FAILED';
    error.status = Number(response?.status || 500);
    throw error;
  }
  return response.data;
}

export async function uploadAiAttachment(file: File, sessionId = ''): Promise<AiAttachment> {
  const init = assertSuccess(
    await apiBasePost(
      '/api/chat/attachments/init',
      {
        fileName: file.name,
        fileType: file.type || 'application/octet-stream',
        fileSize: file.size,
        sessionId,
      },
      { silent: true },
    ),
  ) as InitUploadResult;
  try {
    await axios.put(init.uploadUrl, file, {
      headers: init.headers,
      timeout: 120_000,
    });
    return assertSuccess(
      await apiBasePost('/api/chat/attachments/confirm', { attachmentId: init.attachment.id }, { silent: true }),
    ) as AiAttachment;
  } catch (error) {
    void deleteAiAttachment(init.attachment.id).catch(() => {});
    throw error;
  }
}

export async function attachAiCloudFile(fileId: string, sessionId = ''): Promise<AiAttachment> {
  return assertSuccess(
    await apiBasePost('/api/chat/attachments/attachCloudFile', { fileId, sessionId }, { silent: true }),
  ) as AiAttachment;
}

export async function fetchAiAttachmentStatuses(attachmentIds: string[]): Promise<AiAttachment[]> {
  return assertSuccess(
    await apiBasePost('/api/chat/attachments/status', { attachmentIds }, { silent: true }),
  ) as AiAttachment[];
}

export async function retryAiAttachment(attachment: AiAttachment): Promise<AiAttachment> {
  if (attachment.sourceType === 'cloud' && attachment.fileId) return attachAiCloudFile(String(attachment.fileId));
  return assertSuccess(
    await apiBasePost('/api/chat/attachments/confirm', { attachmentId: attachment.id }, { silent: true }),
  ) as AiAttachment;
}

export async function deleteAiAttachment(attachmentId: string): Promise<void> {
  assertSuccess(await apiBasePost('/api/chat/attachments/delete', { attachmentId }, { silent: true }));
}

export async function clearAiTemporaryAttachments(): Promise<{ deleted: number; failed: number }> {
  return assertSuccess(await apiBasePost('/api/chat/attachments/clearTemporary', {}, { silent: true }));
}
