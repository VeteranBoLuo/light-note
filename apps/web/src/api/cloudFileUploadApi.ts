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

export type ManagedCloudUploadOptions = {
  fileName?: string;
  folderId?: string | null;
  signal?: AbortSignal;
  onProgress?: (percent: number) => void;
};

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
  const response = await apiBasePost('/api/file/queryFolder', { filters: {} }, { silent: true });
  if (response.status !== 200) throw apiError(response, 'FOLDER_LIST_FAILED');
  return (Array.isArray(response.data?.items) ? response.data.items : [])
    .filter((item: any) => item?.id != null && String(item?.name || '').trim())
    .map((item: any) => ({ id: String(item.id), name: String(item.name).trim() }));
}

async function abortManagedUpload(objectKey: string) {
  await apiBasePost('/api/file/abortManagedUpload', { objectKey }, { silent: true });
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
  const prepareResponse = await apiBasePost('/api/file/prepareManagedUpload', metadata, { silent: true });
  const uploadInfo = prepareResponse.data;
  if (prepareResponse.status !== 200 || !uploadInfo?.uploadUrl || !uploadInfo?.objectKey) {
    throw apiError(prepareResponse, 'UPLOAD_PREPARE_FAILED');
  }

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

    const confirmResponse = await apiBasePost(
      '/api/file/confirmManagedUpload',
      {
        objectKey: uploadInfo.objectKey,
        fileName: metadata.fileName,
        fileType: uploadInfo.fileType || metadata.fileType,
        folderId: options.folderId ?? null,
      },
      { silent: true },
    );
    const result = confirmResponse.data;
    if (confirmResponse.status !== 200 || !result?.fileId || result.status !== '已上传') {
      throw apiError(confirmResponse, 'UPLOAD_CONFIRM_FAILED');
    }
    confirmed = true;
    return {
      filename: String(result.filename || metadata.fileName),
      status: '已上传',
      fileId: String(result.fileId),
    };
  } catch (error) {
    if (!confirmed) await abortManagedUpload(String(uploadInfo.objectKey)).catch(() => {});
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
