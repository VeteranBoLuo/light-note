import { apiBasePost } from '@/http/request.ts';

export type FilePreviewJobStatus = 'missing' | 'queued' | 'processing' | 'ready' | 'failed';

export interface FilePreviewState {
  fileId: string;
  strategy: 'archive_manifest' | 'converted_pdf';
  previewType: 'archive' | 'converted-pdf';
  formatId: string;
  status: FilePreviewJobStatus;
  errorCode: string;
  pollAfterMs: number;
  previewUrl?: string;
  expiresIn?: number;
  artifactSize?: number;
  previewTicket?: string;
  ticketExpiresIn?: number;
  sourceDownloadUrl?: string;
  sourceUrlExpiresIn?: number;
  archive?: ArchivePreviewSummary;
}

export interface ArchivePreviewSummary {
  entryCount: number;
  totalUncompressedSize: number;
  containsEncrypted: boolean;
  suspiciousExpansion: boolean;
  skippedUnsafeEntries?: number;
}

export interface ArchivePreviewEntry {
  path: string;
  name: string;
  parentPath: string;
  isDirectory: boolean;
  size: number;
  packedSize: number;
  modifiedAt: string;
  encrypted: boolean;
}

export interface ArchivePreviewPage {
  directory: string;
  query: string;
  items: ArchivePreviewEntry[];
  total: number;
  nextOffset: number | null;
  summary: ArchivePreviewSummary;
}

function unwrap<T>(response: any): T {
  if (response?.status === 200) return response.data as T;
  throw Object.assign(new Error(response?.msg || 'FILE_PREVIEW_REQUEST_FAILED'), {
    code: response?.data?.errorCode || 'FILE_PREVIEW_REQUEST_FAILED',
    status: response?.status,
  });
}

export async function resolveOwnedFilePreview(fileId: string): Promise<FilePreviewState> {
  return unwrap(await apiBasePost('/api/file/preview/resolve', { fileId }, { silent: true }));
}

export async function prepareOwnedFilePreview(fileId: string, retry = false): Promise<FilePreviewState> {
  return unwrap(await apiBasePost('/api/file/preview/prepare', { fileId, retry }, { silent: true }));
}

export async function listOwnedArchivePreview(
  fileId: string,
  input: { directory?: string; query?: string; offset?: number; limit?: number },
): Promise<ArchivePreviewPage> {
  return unwrap(await apiBasePost('/api/file/preview/archive', { fileId, ...input }, { silent: true }));
}

export async function prepareSharedFilePreview(
  token: string,
  accessCode = '',
  retry = false,
): Promise<FilePreviewState> {
  return unwrap(await apiBasePost('/api/file/share/preview/prepare', { token, accessCode, retry }, { silent: true }));
}

export async function resolveSharedFilePreview(previewTicket: string): Promise<FilePreviewState> {
  return unwrap(await apiBasePost('/api/file/share/preview/resolve', { previewTicket }, { silent: true }));
}

export async function listSharedArchivePreview(
  previewTicket: string,
  input: { directory?: string; query?: string; offset?: number; limit?: number },
): Promise<ArchivePreviewPage> {
  return unwrap(await apiBasePost('/api/file/share/preview/archive', { previewTicket, ...input }, { silent: true }));
}
