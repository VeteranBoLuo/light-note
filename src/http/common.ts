import message from '@/components/base/BasicComponents/BMessage/BMessage.ts';
import cloudSpaceStore from '@/store/cloudSpace';
import { apiBasePost } from '@/http/request.ts';
const cloud = cloudSpaceStore();
export async function downloadField(id: number | string) {
  try {
    cloud.loading = true;
    const res = await apiBasePost('/api/file/downloadFileById', { id });
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
      message.error('获取下载链接失败');
      return false;
    }
  } catch (error) {
    console.error('下载失败:', error);
    message.error('下载失败，请重试');
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
      message.success('删除成功');
      return true;
    }
    message.error(res.msg || '删除失败');
    return false;
  } catch (error) {
    message.error('删除失败，请重试');
    return false;
  }
}

// 分享文件
export async function shareField(id: number | string, fileName?: string, fileType?: string, description?: string) {
  try {
    // 生成分享页面链接，通过前端页面处理下载
    const encodedFileName = fileName ? encodeURIComponent(fileName) : '';
    const encodedFileType = fileType ? encodeURIComponent(fileType) : '';
    const encodedDesc = description ? encodeURIComponent(description) : '';
    const shareUrl = `${window.location.origin}/share/${id}${encodedFileName ? `/${encodedFileName}` : ''}${encodedFileType ? `/${encodedFileType}` : ''}${encodedDesc ? `/${encodedDesc}` : ''}`;
    await navigator.clipboard.writeText(shareUrl);
    message.success('分享链接已复制到剪贴板');
    return shareUrl;
  } catch (error) {
    console.error('分享失败:', error);
    message.error('生成分享链接失败');
    throw error;
  }
}
