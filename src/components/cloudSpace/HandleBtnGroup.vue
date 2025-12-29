<template>
  <b-space :size="15">
    <CloudStorageBar v-if="!bookmark.isMobileDevice" />
    <b-upload multiple class="upload-btn" @change="handleChange" :max-total-size="100 * 1024 * 1024">
      <b-button type="primary">{{ $t('cloudSpace.uploadFile') }}</b-button>
    </b-upload>
  </b-space>
</template>

<script lang="ts" setup>
  import CloudStorageBar from '@/components/cloudSpace/CloudStorageBar.vue';
  import { bookmarkStore, cloudSpaceStore } from '@/store';
  import { apiBasePost } from '@/http/request.ts';
  import { message } from 'ant-design-vue';
  import axios from 'axios';

  const bookmark = bookmarkStore();
  const cloud = cloudSpaceStore();
  const emit = defineEmits(['addFolder']);

  async function handleChange(e) {
    cloud.loading = true;
    let filesData = [];
    let totalSize = 0;
    let invalidFiles = [];

    // 遍历所有选中的文件
    for (let file of e) {
      try {
        // 处理Base64文件
        let processedFile;
        if (file.isImg) {
          // Base64转Blob
          const base64String = file.file.split(';base64,').pop();
          const mimeType = file.file.split(';base64,')[0].split(':')[1]; // 提取MIME类型
          const byteCharacters = atob(base64String);
          const byteNumbers = new Array(byteCharacters.length);

          for (let i = 0; i < byteCharacters.length; i++) {
            byteNumbers[i] = byteCharacters.charCodeAt(i);
          }

          const byteArray = new Uint8Array(byteNumbers);
          processedFile = new Blob([byteArray], {
            type: mimeType, // 使用实际的MIME类型
          });
          processedFile.name = file.fileName || `converted-image.${mimeType.split('/')[1]}`;
        } else {
          // 原始文件
          processedFile = file;
        }
        // 累计文件大小
        totalSize += processedFile.size;
        filesData.push({
          fileName: processedFile.name,
          fileType: processedFile.type || 'application/octet-stream',
          fileSize: processedFile.size,
          file: processedFile,
        });
      } catch (error) {
        invalidFiles.push({ name: file.name, error: '文件处理失败' });
      }
    }

    // 检查总空间
    const uploadAfterSize = Number((totalSize / 1024 / 1024 + cloud.usedSpace).toFixed(2));
    if (uploadAfterSize <= cloud.maxSpace) {
      try {
        // 第一步：调用后端获取预签名上传URL
        const uploadRes = await apiBasePost('/api/file/uploadFiles', { files: filesData });
        if (uploadRes.status !== 200) {
          throw new Error('获取上传URL失败');
        }

        const uploadInfos = uploadRes.data; // 数组，每个文件有 uploadUrl, headers 等

        // 第二步：逐个上传到OBS
        const uploadPromises = uploadInfos.map(async (info, index) => {
          if (info.status === '处理失败') {
            return { ...info, uploadStatus: 'failed' };
          }
          try {
            const fileData = filesData[index].file;
            await axios.put(info.uploadUrl, fileData, {
              headers: {
                ...info.headers,
                'Content-Type': info.fileType,
              },
            });
            return { ...info, uploadStatus: 'success' };
          } catch (error) {
            console.error('上传失败:', error);
            return { ...info, uploadStatus: 'failed', error: error.message };
          }
        });

        const uploadResults = await Promise.all(uploadPromises);

        // 第三步：上传成功后，调用confirmUpload写入数据库
        const confirmFiles = uploadResults
          .filter((result) => result.uploadStatus === 'success')
          .map((result) => ({
            fileName: result.filename,
            fileType: result.fileType,
            fileSize: filesData.find((f) => f.fileName === result.filename)?.fileSize || 0,
          }));

        if (confirmFiles.length > 0) {
          const confirmRes = await apiBasePost('/api/file/confirmUpload', { files: confirmFiles });
          if (confirmRes.status === 200) {
            // 处理确认结果
            const successFiles = confirmRes.data.filter((item) => item.status === '已上传');
            const existedFiles = confirmRes.data.filter((item) => item.status === '已覆盖');
            const failedFiles = confirmRes.data.filter((item) => item.status === '处理失败');

            if (successFiles.length > 0) {
              message.success(`成功上传 ${successFiles.length} 个文件`);
            }

            if (existedFiles.length > 0) {
              message.warning(`覆盖了 ${existedFiles.length} 个已有文件`);
              existedFiles.forEach((item) => cloud.cacheImgArr.push(item.fileId));
            }

            if (failedFiles.length > 0) {
              message.error(`以下文件确认失败：${failedFiles.map((f) => f.filename).join(', ')}`);
            }

            if (successFiles.length > 0 || existedFiles.length > 0) {
              cloud.queryFieldList();
            }
          } else {
            message.error('确认上传失败');
          }
        }

        // 处理上传失败的文件
        const failedUploads = uploadResults.filter((result) => result.uploadStatus === 'failed');
        if (failedUploads.length > 0) {
          message.error(`以下文件上传失败：${failedUploads.map((f) => f.filename).join(', ')}`);
        }
      } catch (error) {
        message.error('上传失败：' + error.message);
      } finally {
        cloud.loading = false;

        // 显示预检错误信息
        if (invalidFiles.length > 0) {
          message.warning(`以下文件无法处理：${invalidFiles.map((f) => f.name + ' - ' + f.error).join(', ')}`);
        }
      }
    } else {
      message.warning('剩余空间不足');
      cloud.loading = false;
    }
  }
</script>

<style lang="less" scoped></style>
