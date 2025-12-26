import axios from 'axios';
import { message } from 'ant-design-vue';
import { cloudSpaceStore } from '@/store';
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
    } else {
      message.error('获取下载链接失败');
    }
  } catch (error) {
    console.error('下载失败:', error);
    message.error('下载失败，请重试');
  } finally {
    cloud.loading = false;
  }
}

// 删除文件
export async function deleteField(id: number | string) {
  await apiBasePost('/api/file/deleteFileById', { id });
  message.success('删除成功');
}

// 分享文件
export async function shareField(id: number | string, fileName?: string, fileType?: string) {
  try {
    // 生成分享页面链接，通过前端页面处理下载
    const encodedFileName = fileName ? encodeURIComponent(fileName) : '';
    const encodedFileType = fileType ? encodeURIComponent(fileType) : '';
    const shareUrl = `${window.location.origin}/#/share/${id}${encodedFileName ? `/${encodedFileName}` : ''}${encodedFileType ? `/${encodedFileType}` : ''}`;
    await navigator.clipboard.writeText(shareUrl);
    message.success('分享链接已复制到剪贴板');
    return shareUrl;
  } catch (error) {
    console.error('分享失败:', error);
    message.error('生成分享链接失败');
    throw error;
  }
}
