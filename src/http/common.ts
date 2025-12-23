import axios from 'axios';
import { message } from 'ant-design-vue';
import { cloudSpaceStore } from '@/store';
import { apiBasePost } from '@/http/request.ts';
const cloud = cloudSpaceStore();
export async function downloadField(id: number | string) {
  try {
    cloud.loading = true;
    // 使用 axios.post 直接发起请求，并设置 responseType: 'blob'
    const response = await axios.post(
      '/api/file/downloadFileById',
      { id },
      {
        responseType: 'blob', // 必须设置为 blob 才能正确处理二进制流
        headers: {
          // 可选：如果需要带 token 或其他 header
          // 'Authorization': 'Bearer your_token_here',
        },
      },
    );

    // 规范化 header key 为小写
    const headers = Object.keys(response.headers).reduce(
      (acc, key) => {
        acc[key.toLowerCase()] = response.headers[key];
        return acc;
      },
      {} as Record<string, string>,
    );

    // 获取文件名和类型
    const rawFileName = headers['x-file-name'];
    const fileName = rawFileName ? decodeURIComponent(rawFileName) : 'unknown';
    const fileType = headers['x-file-type'] || 'application/octet-stream';
    const fileSize = parseInt(headers['x-file-size'], 10) || 0;

    // 创建 Blob 对象
    const blob = new Blob([response.data], { type: fileType });

    // 创建 a 标签进行下载
    const downloadUrl = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = downloadUrl;
    a.download = fileName; // 设置下载文件名
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(downloadUrl);
    cloud.loading = false;
    // 可选：打印文件大小等信息
    console.log('文件大小:', fileSize);
  } catch (error) {
    console.error('下载失败:', error);
    message.error('下载失败，请重试');
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
