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

  const bookmark = bookmarkStore();
  const cloud = cloudSpaceStore();
  const emit = defineEmits(['addFolder']);

  async function uploadBigFileInChunks(file: File, chunkSize = 20 * 1024 * 1024, concurrency = 3) {
    // 1) init
    const initRes = await apiBasePost('/api/file/upload/init', { filename: file.name }, { timeout: 10 * 60 * 1000 });
    const uploadId = initRes.data.uploadId;

    // 2) 切片并并发上传
    const totalChunks = Math.ceil(file.size / chunkSize);
    const chunks = [];
    for (let index = 0; index < totalChunks; index++) {
      const start = index * chunkSize;
      const end = Math.min(file.size, start + chunkSize);
      const blob = file.slice(start, end);
      chunks.push({ index, blob });
    }

    // 并发上传函数（带重试）
    async function uploadChunkWithRetry(chunk, retries = 3) {
      for (let attempt = 0; attempt < retries; attempt++) {
        try {
          const form = new FormData();
          form.append('chunk', chunk.blob);
          await apiBasePost(`/api/file/upload/chunk?uploadId=${uploadId}&index=${chunk.index}`, form, {
            timeout: 10 * 60 * 1000,
            onUploadProgress: (evt) => {
              const progress = Math.round((evt.loaded / evt.total) * 100);
              console.log(`分片 ${chunk.index + 1}/${totalChunks} 进度: ${progress}%`);
            },
          });
          return; // 成功则退出
        } catch (error) {
          if (attempt === retries - 1) throw error; // 最后一次失败则抛出
          console.log(`分片 ${chunk.index} 重试 ${attempt + 1}`);
          await new Promise((resolve) => setTimeout(resolve, 1000)); // 延迟1秒重试
        }
      }
    }

    // 分批并发上传（限制并发数）
    for (let i = 0; i < chunks.length; i += concurrency) {
      const batch = chunks.slice(i, i + concurrency);
      await Promise.all(batch.map((chunk) => uploadChunkWithRetry(chunk)));
    }

    // 3) complete 合并 + 入库
    const completeRes = await apiBasePost(
      '/api/file/upload/complete',
      {
        uploadId,
        filename: file.name,
        totalChunks,
        fileType: file.type || 'application/octet-stream',
        fileSize: file.size,
      },
      { timeout: 10 * 60 * 1000 },
    );

    return completeRes;
  }

  function handleChange(e) {
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
          const byteCharacters = atob(base64String);
          const byteNumbers = new Array(byteCharacters.length);

          for (let i = 0; i < byteCharacters.length; i++) {
            byteNumbers[i] = byteCharacters.charCodeAt(i);
          }

          const byteArray = new Uint8Array(byteNumbers);
          processedFile = new Blob([byteArray], {
            type: 'image/svg+xml', // 根据实际情况调整MIME类型
          });
          processedFile.name = file.fileName || 'converted-image.svg';
        } else {
          // 原始文件
          processedFile = file;
        }
        // 累计文件大小
        totalSize += processedFile.size;
        filesData.push(processedFile);
      } catch (error) {
        invalidFiles.push({ name: file.name, error: '文件处理失败' });
      }
    }
    // 检查总空间
    const uploadAfterSize = Number((totalSize / 1024 / 1024 + cloud.usedSpace).toFixed(2));
    if (uploadAfterSize <= cloud.maxSpace) {
      // 分离大文件和小文件（阈值 20MB）
      const smallFiles = filesData.filter((f) => f.size <= 20 * 1024 * 1024);
      const bigFiles = filesData.filter((f) => f.size > 20 * 1024 * 1024);

      // 异步上传
      (async () => {
        try {
          // 先上传大文件（分片）- 并发上传
          await Promise.all(bigFiles.map((bf) => uploadBigFileInChunks(bf)));

          // 再上传小文件（原接口）
          if (smallFiles.length > 0) {
            const formData = new FormData();
            smallFiles.forEach((file, index) => {
              formData.append('files', file, file.name);
            });
            const res = await apiBasePost('/api/file/uploadFiles', formData, {
              timeout: 10 * 60 * 1000, // 10 分钟超时
              onUploadProgress: (evt) => {
                if (evt.total) {
                  const percent = Math.round((evt.loaded / evt.total) * 100);
                  // 这里可以绑定到进度条，例如：cloud.uploadProgress = percent;
                  console.log('小文件上传进度', percent);
                }
              },
            });
            if (res.status === 200) {
              // 处理上传结果
              const successFiles = res.data.filter((item) => item.status === '已上传');
              const existedFiles = res.data.filter((item) => item.status === '已覆盖');
              const failedFiles = res.data.filter((item) => item.status === '处理失败');

              if (successFiles.length > 0) {
                message.success(`成功上传 ${successFiles.length} 个文件`);
              }

              if (existedFiles.length > 0) {
                message.warning(`覆盖了 ${existedFiles.length} 个已有文件`);
                existedFiles.forEach((item) => cloud.cacheImgArr.push(item.fileId));
              }

              if (failedFiles.length > 0) {
                message.error(`以下文件上传失败：${failedFiles.map((f) => f.filename).join(', ')}`);
              }

              if (successFiles.length > 0 || existedFiles.length > 0) {
                cloud.queryFieldList();
              }
            }
          } else {
            // 如果只有大文件，上传完成后刷新
            cloud.queryFieldList();
          }
        } catch (error) {
          message.error('上传失败：' + (error?.message || error));
        } finally {
          cloud.loading = false;
          // 显示预检错误信息
          if (invalidFiles.length > 0) {
            message.warning(`以下文件无法处理：${invalidFiles.map((f) => f.name + ' - ' + f.error).join(', ')}`);
          }
        }
      })();
    } else {
      message.warning('剩余空间不足');
      cloud.loading = false;
    }
  }
</script>

<style lang="less" scoped></style>
