import axios from 'axios';
import { apiBasePost } from '@/http/request';

export type EnsuredCloudFolder = {
  id: string;
  name: string;
  created: boolean;
};

export type CloudUploadResult = {
  filename: string;
  status: '已上传' | '已覆盖';
  fileId: string;
};

export type CloudFolderOption = {
  id: string;
  name: string;
};

/** 调用方按账号与单个 File 隔离；只在当前上传会话内保留。 */
export type ManagedCloudUploadReceipt = {
  pending?: { objectKey: string; file: File; target: string };
};

export type ManagedCloudUploadOptions = {
  batchRequest?: ManagedUploadRequest;
  receipt?: ManagedCloudUploadReceipt;
  fileName?: string;
  folderId?: string | null;
  signal?: AbortSignal;
  onProgress?: (percent: number) => void;
  addToInbox?: boolean;
  inboxSource?: 'quick_capture' | 'browser_extension';
};

type ManagedUploadResponse = { status: number; data?: any; msg?: string };
type ManagedUploadRequest = (operation: string, payload: Record<string, unknown>) => Promise<ManagedUploadResponse>;

/** 仅在一次用户发起的上传期间使用；短暂合并最多 3 项，不启动常驻轮询。 */
export function createManagedUploadBatchRequest(): ManagedUploadRequest {
  let queue: Array<{ operation: string; payload: Record<string, unknown>; resolve: (value: ManagedUploadResponse) => void; reject: (reason: unknown) => void }> = [];
  let timer: ReturnType<typeof setTimeout> | undefined;
  async function flush() {
    if (timer) clearTimeout(timer);
    timer = undefined;
    const entries = queue.splice(0, 3);
    if (!entries.length) return;
    try {
      const response = await apiBasePost('/api/file/managedUploadBatch', {
        items: entries.map(({ operation, payload }) => ({ operation, payload })),
      }, { silent: true });
      if (response.status !== 200 || !Array.isArray(response.data) || response.data.length !== entries.length) {
        throw new Error('UPLOAD_BATCH_FAILED');
      }
      entries.forEach((entry, index) => entry.resolve(response.data[index]));
    } catch (error) {
      entries.forEach((entry) => entry.reject(error));
    }
  }
  return (operation, payload) => new Promise((resolve, reject) => {
    queue.push({ operation, payload, resolve, reject });
    if (queue.length >= 3) void flush();
    else if (!timer) timer = setTimeout(() => { void flush(); }, 10);
  });
}

function managedRequest(options: ManagedCloudUploadOptions, operation: string, payload: Record<string, unknown>) {
  return options.batchRequest
    ? options.batchRequest(operation, payload)
    : apiBasePost(`/api/file/${operation}`, payload, { silent: true });
}

function apiError(response: { status?: number; msg?: string }, fallback: string) {
  return new Error(response?.msg || fallback);
}

export async function ensureCloudFolder(name: string): Promise<EnsuredCloudFolder> {
  const response = await apiBasePost('/api/file/ensureFolder', { name }, { silent: true });
  if (response.status !== 200 || !response.data?.id) {
    throw apiError(response, 'FOLDER_ENSURE_FAILED');
  }
  return {
    id: String(response.data.id),
    name: String(response.data.name || name),
    created: Boolean(response.data.created),
  };
}

export async function fetchCloudFolders(): Promise<CloudFolderOption[]> {
  const response = await apiBasePost('/api/file/queryFolder', { filters: {}, treeVersion: 2 }, { silent: true });
  if (response.status !== 200) throw apiError(response, 'FOLDER_LIST_FAILED');
  return (Array.isArray(response.data?.items) ? response.data.items : [])
    .filter((item: any) => item?.id != null && String(item?.name || '').trim())
    .map((item: any) => ({
      id: String(item.id),
      name: String(item.fullPath || item.name).trim(),
    }));
}

async function abortManagedUpload(objectKey: string, options: ManagedCloudUploadOptions) {
  const response = await managedRequest(options, 'abortManagedUpload', { objectKey });
  return response.status === 200 ? response.data : null;
}

/**
 * 创建一个全新的云空间文件。对象键由服务端随机生成，同名展示名在确认事务中自动加序号，
 * 因而不会覆盖旧文件或改变已经被笔记引用的文件 ID。
 */
export async function uploadManagedCloudFile(
  file: File,
  options: ManagedCloudUploadOptions = {},
): Promise<CloudUploadResult> {
  const metadata = {
    fileName: String(options.fileName || file.name).trim(),
    fileType: file.type || 'application/octet-stream',
    fileSize: file.size,
  };
  const target = JSON.stringify([metadata, options.folderId ?? null, options.addToInbox === true, options.inboxSource || 'quick_capture']);
  const receipt = options.receipt;
  const previous = receipt?.pending;
  if (receipt && previous) {
    if (previous.file !== file || previous.target !== target) throw new Error('UPLOAD_RECEIPT_MISMATCH');
    // 上次确认和核验都未返回时，只核验原对象，不能重新签名并上传另一份。
    const recovered = await abortManagedUpload(previous.objectKey, options).catch(() => null);
    if (recovered?.alreadyConfirmed && recovered?.fileId) {
      receipt.pending = undefined;
      return { filename: String(recovered.filename || metadata.fileName), status: '已上传', fileId: String(recovered.fileId) };
    }
    if (recovered?.deleted !== true || recovered?.alreadyConfirmed === true) {
      throw new Error('UPLOAD_RESULT_UNKNOWN');
    }
    receipt.pending = undefined;
  }
  if (options.signal?.aborted) throw new DOMException('Upload cancelled', 'AbortError');
  const prepareResponse = await managedRequest(options, 'prepareManagedUpload', metadata);
  const uploadInfo = prepareResponse.data;
  if (prepareResponse.status !== 200 || !uploadInfo?.uploadUrl || !uploadInfo?.objectKey) {
    throw apiError(prepareResponse, 'UPLOAD_PREPARE_FAILED');
  }

  if (receipt) receipt.pending = { objectKey: String(uploadInfo.objectKey), file, target };
  let confirmed = false;
  try {
    await axios.put(uploadInfo.uploadUrl, file, {
      headers: {
        ...(uploadInfo.headers || {}),
        'Content-Type': uploadInfo.fileType || metadata.fileType,
      },
      signal: options.signal,
      onUploadProgress: (event) => {
        if (!event.total || event.total <= 0) return;
        options.onProgress?.(Math.min(100, Math.max(0, Math.round((event.loaded / event.total) * 100))));
      },
    });
    options.onProgress?.(100);

    // PUT 完成与确认之间仍可能收到取消，不能继续创建文件记录。
    // 抛入既有恢复流程，清理对象；如果结果已确认则保留已保存文件。
    if (options.signal?.aborted) throw new DOMException('Upload cancelled', 'AbortError');

    const confirmResponse = await managedRequest(
      options,
      'confirmManagedUpload',
      {
        objectKey: uploadInfo.objectKey,
        fileName: metadata.fileName,
        fileType: uploadInfo.fileType || metadata.fileType,
        folderId: options.folderId ?? null,
        addToInbox: options.addToInbox === true,
        inboxSource: options.inboxSource || 'quick_capture',
      },
    );
    const result = confirmResponse.data;
    if (confirmResponse.status !== 200 || !result?.fileId || result.status !== '已上传') {
      throw apiError(confirmResponse, 'UPLOAD_CONFIRM_FAILED');
    }
    confirmed = true;
    if (receipt) receipt.pending = undefined;
    return {
      filename: String(result.filename || metadata.fileName),
      status: '已上传',
      fileId: String(result.fileId),
    };
  } catch (error) {
    if (!confirmed) {
      const recovery = await abortManagedUpload(String(uploadInfo.objectKey), options).catch(() => null);
      if (recovery?.alreadyConfirmed && recovery?.fileId) {
        if (receipt) receipt.pending = undefined;
        return {
          filename: String(recovery.filename || metadata.fileName),
          status: '已上传',
          fileId: String(recovery.fileId),
        };
      }
      if (recovery?.deleted === true && recovery?.alreadyConfirmed !== true && receipt) receipt.pending = undefined;
    }
    throw error;
  }
}

/**
 * 复用云空间的“预签名 -> OBS 直传 -> 数据库确认”链路上传单个文件。
 * 这里只封装无 UI 的原子能力，进度条和批量上传仍由云空间页面自身负责。
 */
export async function uploadCloudFile(file: File, folderId: string | null): Promise<CloudUploadResult> {
  const metadata = {
    fileName: file.name,
    fileType: file.type || 'application/octet-stream',
    fileSize: file.size,
  };
  const prepareResponse = await apiBasePost('/api/file/uploadFiles', { files: [metadata] }, { silent: true });
  const uploadInfo = prepareResponse.data?.[0];
  if (prepareResponse.status !== 200 || !uploadInfo?.uploadUrl || uploadInfo?.status === '处理失败') {
    throw apiError(prepareResponse, uploadInfo?.error || 'UPLOAD_PREPARE_FAILED');
  }

  await axios.put(uploadInfo.uploadUrl, file, {
    headers: {
      ...(uploadInfo.headers || {}),
      'Content-Type': uploadInfo.fileType || metadata.fileType,
    },
  });

  const confirmResponse = await apiBasePost(
    '/api/file/confirmUpload',
    {
      files: [
        {
          fileName: uploadInfo.filename || metadata.fileName,
          fileType: uploadInfo.fileType || metadata.fileType,
          fileSize: metadata.fileSize,
        },
      ],
      folderId,
    },
    { silent: true },
  );
  const result = confirmResponse.data?.[0];
  if (confirmResponse.status !== 200 || !result?.fileId || (result.status !== '已上传' && result.status !== '已覆盖')) {
    throw apiError(confirmResponse, result?.error || 'UPLOAD_CONFIRM_FAILED');
  }
  return {
    filename: String(result.filename || metadata.fileName),
    status: result.status,
    fileId: String(result.fileId),
  };
}
