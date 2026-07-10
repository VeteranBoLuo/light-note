import message from '@/components/base/BasicComponents/BMessage/BMessage.ts';
import i18n from '@/i18n';
import cloudSpaceStore from '@/store/cloudSpace';
import { apiBasePost } from '@/http/request.ts';
const cloud = cloudSpaceStore();
export async function downloadField(id: number | string, token?: string) {
  try {
    cloud.loading = true;
    const res = await apiBasePost('/api/file/downloadFileById', { id, token });
    if (res.status === 200 && res.data?.downloadUrl) {
      const { downloadUrl, fileName } = res.data;
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

// 分享文件
export async function shareField(
  id: number | string,
  token: string,
  fileName?: string,
  fileType?: string,
  description?: string,
) {
  try {
    // 生成分享页面链接(带不可猜 token,分享页凭 token 访问,防按自增 id 枚举越权)
    const encodedFileName = fileName ? encodeURIComponent(fileName) : '';
    const encodedFileType = fileType ? encodeURIComponent(fileType) : '';
    const encodedDesc = description ? encodeURIComponent(description) : '';
    const shareUrl = `${window.location.origin}/share/${id}/${token}${encodedFileName ? `/${encodedFileName}` : ''}${encodedFileType ? `/${encodedFileType}` : ''}${encodedDesc ? `/${encodedDesc}` : ''}`;
    await navigator.clipboard.writeText(shareUrl);
    message.success(i18n.global.t('common.shareLinkCopied'));
    return shareUrl;
  } catch (error) {
    console.error('分享失败:', error);
    message.error(i18n.global.t('common.shareLinkFailed'));
    throw error;
  }
}
