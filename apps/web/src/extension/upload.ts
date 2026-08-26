import { extensionPost } from './api';

export const EXTENSION_UPLOAD_MAX_TOTAL_BYTES = 200 * 1024 * 1024;

export interface ExtensionUploadOptions {
  addToInbox: boolean;
  signal?: AbortSignal;
  onProgress?: (percent: number) => void;
}

export interface ExtensionUploadResult {
  fileId: string;
  filename: string;
  addedToInbox: boolean;
}

function uploadSignedObject(
  url: string,
  file: File,
  headers: Record<string, string>,
  options: Pick<ExtensionUploadOptions, 'signal' | 'onProgress'>,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const abort = () => xhr.abort();
    xhr.open('PUT', url, true);
    Object.entries(headers || {}).forEach(([name, value]) => xhr.setRequestHeader(name, String(value)));
    if (!Object.keys(headers || {}).some((name) => name.toLowerCase() === 'content-type')) {
      xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
    }
    xhr.upload.addEventListener('progress', (event) => {
      if (!event.lengthComputable || event.total <= 0) return;
      options.onProgress?.(Math.min(100, Math.round((event.loaded / event.total) * 100)));
    });
    xhr.addEventListener('load', () => {
      options.signal?.removeEventListener('abort', abort);
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new Error(`文件上传失败（${xhr.status || '网络错误'}）`));
    });
    xhr.addEventListener('error', () => {
      options.signal?.removeEventListener('abort', abort);
      reject(new Error('文件上传失败，请检查网络后重试'));
    });
    xhr.addEventListener('abort', () => {
      options.signal?.removeEventListener('abort', abort);
      reject(new DOMException('上传已取消', 'AbortError'));
    });
    if (options.signal?.aborted) return abort();
    options.signal?.addEventListener('abort', abort, { once: true });
    xhr.send(file);
  });
}

export async function uploadExtensionFile(
  file: File,
  options: ExtensionUploadOptions,
): Promise<ExtensionUploadResult> {
  const metadata = {
    fileName: file.name,
    fileType: file.type || 'application/octet-stream',
    fileSize: file.size,
  };
  const prepared = await extensionPost<any>('/api/file/prepareManagedUpload', metadata, true, options.signal);
  if (!prepared?.uploadUrl || !prepared?.objectKey) throw new Error('无法准备文件上传');
  let confirmed = false;
  try {
    await uploadSignedObject(prepared.uploadUrl, file, prepared.headers || {}, options);
    options.onProgress?.(100);
    const result = await extensionPost<any>(
      '/api/file/confirmManagedUpload',
      {
        objectKey: prepared.objectKey,
        fileName: metadata.fileName,
        fileType: prepared.fileType || metadata.fileType,
        folderId: null,
        addToInbox: options.addToInbox,
        inboxSource: 'browser_extension',
      },
      true,
      options.signal,
    );
    if (!result?.fileId) throw new Error('文件确认失败，请重试');
    confirmed = true;
    return {
      fileId: String(result.fileId),
      filename: String(result.filename || file.name),
      addedToInbox: Boolean(result.addedToInbox),
    };
  } catch (error) {
    if (!confirmed) {
      const recovery = await extensionPost<any>(
        '/api/file/abortManagedUpload',
        { objectKey: prepared.objectKey },
      ).catch(() => null);
      if (recovery?.alreadyConfirmed && recovery?.fileId) {
        return {
          fileId: String(recovery.fileId),
          filename: String(recovery.filename || file.name),
          addedToInbox: options.addToInbox,
        };
      }
    }
    throw error;
  }
}
