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
      const formData = new FormData();

      // 添加所有文件到FormData
      filesData.forEach((file, index) => {
        formData.append('files', file, file.name); // 字段名必须与后端保持一致
      });
      // 发送上传请求
      apiBasePost('/api/file/uploadFiles', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      })
        .then((res) => {
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
        })
        .catch((error) => {
          message.error('上传失败：' + error.message);
        })
        .finally(() => {
          cloud.loading = false;

          // 显示预检错误信息
          if (invalidFiles.length > 0) {
            message.warning(`以下文件无法处理：${invalidFiles.map((f) => f.name + ' - ' + f.error).join(', ')}`);
          }
        });
    } else {
      message.warning('剩余空间不足');
      cloud.loading = false;
    }
  }
</script>

<style lang="less" scoped></style>
