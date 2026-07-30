import message from '@/components/base/BasicComponents/BMessage/BMessage.ts';
import i18n from '@/i18n';
import cloudSpaceStore from '@/store/cloudSpace';
import { apiBasePost } from '@/http/request.ts';
import { postAndroidMessage } from '@/utils/androidBridge.ts';
const cloud = cloudSpaceStore();

function requestAndroidDownload(downloadUrl: string, fileName?: string): boolean {
  return postAndroidMessage({
    type: 'download',
    url: downloadUrl,
    fileName: fileName || '',
  });
}

export async function downloadField(id: number | string) {
  try {
    cloud.loading = true;
    const res = await apiBasePost('/api/file/downloadFileById', { id });
    if (res.status === 200 && res.data?.downloadUrl) {
      const { downloadUrl, fileName } = res.data;
      if (requestAndroidDownload(downloadUrl, fileName)) {
        return true;
      }
      const a = document.createElement('a');
      a.href = downloadUrl; // OBS will serve the file directly
      if (fileName) a.download = decodeURIComponent(fileName);
      document.body.appendChild(a);
      a.click();
      a.remove();
      return true;
    } else {
      message.error(i18n.global.t('common.downloadLinkFailed'));
      return false;
    }
  } catch (error) {
    console.error('下载失败:', error);
    message.error(i18n.global.t('common.downloadFailed'));
    return false;
  } finally {
    cloud.loading = false;
  }
}

// 删除文件
export async function deleteField(id: number | string) {
  try {
    const res = await apiBasePost('/api/file/deleteFileById', { id });
    if (res.status === 200) {
      message.success(i18n.global.t('common.deleteSuccess'));
      return true;
    }
    message.error(res.msg || i18n.global.t('common.deleteFailed'));
    return false;
  } catch (error) {
    message.error(i18n.global.t('common.deleteFailedRetry'));
    return false;
  }
}

export interface FileShareInput {
  description?: string;
  expiresInDays?: 1 | 7 | 30;
  accessCode?: string;
  maxAccessCount?: number | null;
  maxDownloadCount?: number | null;
}

export interface FileShareRecord {
  id: string;
  fileId: number | string;
  fileName: string;
  tokenHint: string;
  description: string;
  requiresCode: boolean;
  expiresAt: string;
  maxAccessCount: number | null;
  maxDownloadCount: number | null;
  accessCount: number;
  downloadCount: number;
  lastAccessAt: string | null;
  lastDownloadAt: string | null;
  revokedAt: string | null;
  createTime: string;
  state: string;
}

async function copyFileShareToken(token: string) {
  const shareUrl = `${window.location.origin}/share/${encodeURIComponent(token)}`;
  await navigator.clipboard.writeText(shareUrl);
  message.success(i18n.global.t('common.shareLinkCopied'));
  return shareUrl;
}

// 创建独立分享记录；令牌只在创建/轮换成功时返回一次。
export async function shareField(id: number | string, options: FileShareInput = {}) {
  try {
    const res = await apiBasePost('/api/file/share/create', { fileId: id, ...options });
    if (res.status !== 200 || !res.data?.token) {
      throw new Error(res.data?.errorCode || 'FILE_SHARE_CREATE_FAILED');
    }
    const shareUrl = await copyFileShareToken(res.data.token);
    return { ...res.data, shareUrl };
  } catch (error) {
    console.error('分享失败:', error);
    message.error(i18n.global.t('common.shareLinkFailed'));
    throw error;
  }
}

export async function listFileShares(fileId?: number | string): Promise<FileShareRecord[]> {
  const res = await apiBasePost('/api/file/share/list', fileId ? { fileId } : {});
  if (res.status !== 200 || !Array.isArray(res.data)) {
    throw new Error(res.data?.errorCode || 'FILE_SHARE_LIST_FAILED');
  }
  return res.data;
}

export async function revokeFileShare(shareId: string) {
  const res = await apiBasePost('/api/file/share/revoke', { shareId });
  if (res.status !== 200) throw new Error(res.data?.errorCode || 'FILE_SHARE_REVOKE_FAILED');
  return true;
}

export async function rotateFileShare(shareId: string, options: FileShareInput = {}) {
  const res = await apiBasePost('/api/file/share/rotate', { shareId, ...options });
  if (res.status !== 200 || !res.data?.token) {
    throw new Error(res.data?.errorCode || 'FILE_SHARE_ROTATE_FAILED');
  }
  const shareUrl = await copyFileShareToken(res.data.token);
  return { ...res.data, shareUrl };
}

export async function resolveFileShare(token: string, accessCode = '') {
  return apiBasePost('/api/file/share/resolve', { token, accessCode });
}

export async function getFileShareDownload(token: string, accessCode = '') {
  const res = await apiBasePost('/api/file/share/download', { token, accessCode });
  if (res.status !== 200 || !res.data?.downloadUrl) {
    throw Object.assign(new Error(res.msg || 'FILE_SHARE_DOWNLOAD_FAILED'), {
      code: res.data?.errorCode || 'FILE_SHARE_DOWNLOAD_FAILED',
    });
  }
  return res.data as { downloadUrl: string; fileName: string; expiresIn: number };
}

export async function downloadFileShare(token: string, accessCode = '') {
  const { downloadUrl, fileName } = await getFileShareDownload(token, accessCode);
  if (!requestAndroidDownload(downloadUrl, fileName)) {
    const anchor = document.createElement('a');
    anchor.href = downloadUrl;
    if (fileName) anchor.download = decodeURIComponent(fileName);
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  }
  return true;
}
