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
