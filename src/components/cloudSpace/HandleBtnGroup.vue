<template>
  <b-space :size="15">
    <CloudStorageBar v-if="!bookmark.isMobileDevice" />
    <b-upload multiple class="upload-btn" @change="handleChange" :max-total-size="100 * 1024 * 1024">
      <b-button type="primary">
        <UploadOutlined />
        {{ $t('cloudSpace.uploadFile') }}
      </b-button>
    </b-upload>

    <!-- 上传进度条 -->
    <div v-if="uploadProgress.visible" class="upload-progress">
      <div class="progress-header">
        <span class="progress-title">{{ $t('cloudSpace.uploading') }}</span>
        <div class="progress-actions">
          <span class="progress-percent">{{ Math.round(uploadProgress.overall) }}%</span>
          <span class="progress-speed">{{ formatSpeed(uploadProgress.speed) }}</span>
          <a-popconfirm
            title="确认取消上传"
            description="确定要取消当前的文件上传吗？"
            ok-text="确定取消"
            cancel-text="继续上传"
            ok-type="danger"
            @confirm="handleCancelConfirm"
          >
            <a-button size="small" type="text" class="cancel-btn">
              <template #icon><CloseOutlined /></template>
            </a-button>
          </a-popconfirm>
        </div>
      </div>
      <a-progress :percent="uploadProgress.overall" :show-info="false" class="overall-progress" />
      <div class="file-progress-list" v-if="uploadProgress.files.length > 0">
        <div v-for="(file, index) in uploadProgress.files" :key="index" class="file-progress-item">
          <span class="file-name">{{ file.name }}</span>
          <a-progress :percent="file.progress" size="small" :status="file.status" />
        </div>
      </div>
    </div>
  </b-space>
</template>

<script lang="ts" setup>
  import CloudStorageBar from '@/components/cloudSpace/CloudStorageBar.vue';
  import { bookmarkStore, cloudSpaceStore } from '@/store';
  import { apiBasePost } from '@/http/request.ts';
  import { message, Popconfirm } from 'ant-design-vue';
  import { CloseOutlined, UploadOutlined } from '@ant-design/icons-vue';
  import axios from 'axios';
  import { reactive, ref } from 'vue';
  const bookmark = bookmarkStore();
  const cloud = cloudSpaceStore();
  const emit = defineEmits(['addFolder']);

  // 规范化文件名，确保后缀小写
  const normalizeFileName = (name: string) => {
    const parts = name.split('.');
    if (parts.length > 1) {
      const ext = parts.pop()?.toLowerCase();
      return parts.join('.') + '.' + ext;
    }
    return name;
  };

  // 格式化速度
  const formatSpeed = (speed: number) => {
    if (speed < 1024) return `${speed.toFixed(0)} B/s`;
    if (speed < 1024 * 1024) return `${(speed / 1024).toFixed(1)} KB/s`;
    return `${(speed / (1024 * 1024)).toFixed(1)} MB/s`;
  };

  // 上传进度状态
  const uploadProgress = reactive({
    visible: false,
    overall: 0,
    speed: 0,
    totalLoaded: 0,
    files: [] as Array<{
      name: string;
      progress: number;
      status: 'active' | 'success' | 'exception';
    }>,
  });

  // 上传控制器
  let uploadController = ref<AbortController | null>(null);

  async function handleChange(e) {
    uploadProgress.visible = true;
    uploadProgress.overall = 0;
    uploadProgress.speed = 0;
    uploadProgress.totalLoaded = 0;
    uploadProgress.files = [];

    // 创建上传控制器
    uploadController.value = new AbortController();

    const startTime = Date.now();

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
        // 规范化文件名
        processedFile = new File([processedFile], normalizeFileName(processedFile.name), { type: processedFile.type });
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

    // 初始化进度条
    uploadProgress.files = filesData.map((file) => ({
      name: file.fileName,
      progress: 0,
      status: 'active' as const,
    }));

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
            uploadProgress.files[index].status = 'exception';
            return { ...info, uploadStatus: 'failed' };
          }
          try {
            const fileData = filesData[index].file;
            await axios.put(info.uploadUrl, fileData, {
              headers: {
                ...info.headers,
                'Content-Type': info.fileType,
              },
              signal: uploadController.value?.signal,
              onUploadProgress: (progressEvent) => {
                const percent = Math.round((progressEvent.loaded / progressEvent.total) * 100);
                uploadProgress.files[index].progress = percent;
                // 计算总体进度
                const totalProgress = uploadProgress.files.reduce((sum, file) => sum + file.progress, 0);
                uploadProgress.overall = totalProgress / uploadProgress.files.length;
                // 计算总上传字节数
                uploadProgress.totalLoaded = uploadProgress.files.reduce((sum, file, idx) => {
                  const fileSize = filesData[idx].fileSize;
                  return sum + (file.progress / 100) * fileSize;
                }, 0);
                // 计算速度
                const now = Date.now();
                const elapsed = (now - startTime) / 1000;
                if (elapsed > 0) {
                  uploadProgress.speed = uploadProgress.totalLoaded / elapsed;
                }
              },
            });
            uploadProgress.files[index].status = 'success';
            return { ...info, uploadStatus: 'success' };
          } catch (error) {
            console.error('上传失败:', error);
            // 如果是用户取消的请求，不显示错误信息
            if (error.name !== 'AbortError') {
              uploadProgress.files[index].status = 'exception';
            }
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
        // 如果是用户取消的请求，不显示错误信息
        if (error.name !== 'AbortError') {
          message.error('上传失败：' + error.message);
        }
      } finally {
        uploadProgress.visible = false;
        uploadController.value = null;

        // 显示预检错误信息
        if (invalidFiles.length > 0) {
          message.warning(`以下文件无法处理：${invalidFiles.map((f) => f.name + ' - ' + f.error).join(', ')}`);
        }
      }
    } else {
      message.warning('剩余空间不足');
      uploadProgress.visible = false;
    }
  }

  // 取消上传确认
  const handleCancelConfirm = () => {
    if (uploadController.value) {
      uploadController.value.abort();
      uploadController.value = null;
      uploadProgress.visible = false;
      message.info('上传已取消');
    }
  };
</script>

<style lang="less" scoped>
  .upload-btn {
    :deep(.ant-btn) {
      height: 48px;
      padding: 0 24px;
      font-size: 16px;
      font-weight: 600;
      border-radius: 12px;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      border: none;
      box-shadow: 0 4px 16px rgba(102, 126, 234, 0.3);
      transition: all 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275);
      position: relative;
      overflow: hidden;
      color: white;
      text-shadow: 0 1px 2px rgba(0, 0, 0, 0.2);
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;

      &::before {
        content: '';
        position: absolute;
        top: 0;
        left: -100%;
        width: 100%;
        height: 100%;
        background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.2), transparent);
        transition: left 0.6s;
      }

      &:hover {
        transform: translateY(-2px) scale(1.02);
        box-shadow: 0 8px 24px rgba(102, 126, 234, 0.4);
        background: linear-gradient(135deg, #764ba2 0%, #667eea 100%);

        &::before {
          left: 100%;
        }
      }

      &:active {
        transform: translateY(0) scale(0.98);
        box-shadow: 0 2px 8px rgba(102, 126, 234, 0.3);
      }

      // 图标样式
      .anticon {
        margin-right: 8px;
        font-size: 18px;
        transition: transform 0.3s ease;
      }

      &:hover .anticon {
        transform: scale(1.1);
      }
    }

    // 整体悬停效果
    &:hover {
      transform: scale(1.02);
      transition: transform 0.3s ease;
    }

    // 拖拽状态样式
    &.dragging {
      :deep(.ant-btn) {
        animation: pulse 1.5s infinite;
        background: linear-gradient(135deg, #52c41a 0%, #73d13d 100%);

        &:hover {
          background: linear-gradient(135deg, #73d13d 0%, #52c41a 100%);
          box-shadow: 0 8px 24px rgba(82, 196, 26, 0.4);
        }
      }
    }
  }

  // 脉冲动画
  @keyframes pulse {
    0%,
    100% {
      transform: scale(1);
      box-shadow: 0 4px 16px rgba(102, 126, 234, 0.3);
    }
    50% {
      transform: scale(1.05);
      box-shadow: 0 8px 24px rgba(102, 126, 234, 0.5);
    }
  }

  .upload-progress {
    position: fixed;
    top: 20px;
    right: 20px;
    z-index: 1000;
    width: 320px;
    padding: 20px;
    background: rgba(255, 255, 255, 0.95);
    backdrop-filter: blur(10px);
    -webkit-backdrop-filter: blur(10px);
    border-radius: 12px;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.15);
    border: 1px solid rgba(255, 255, 255, 0.2);

    .progress-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 12px;

      .progress-title {
        font-weight: 600;
        color: #1890ff;
        font-size: 16px;
      }

      .progress-actions {
        display: flex;
        align-items: center;
        gap: 8px;

        .progress-percent {
          font-size: 14px;
          color: #666;
          font-weight: 500;
        }

        .progress-speed {
          font-size: 14px;
          color: #666;
          font-weight: 500;
        }

        .cancel-btn {
          color: #666;

          &:hover {
            color: #ff4d4f;
            background: rgba(255, 77, 79, 0.1);
          }
        }
      }
    }

    .overall-progress {
      margin-bottom: 16px;

      :deep(.ant-progress-bg) {
        background: linear-gradient(90deg, #1890ff 0%, #36cfc9 100%);
      }
    }

    .file-progress-list {
      max-height: 200px;
      overflow-y: auto;

      .file-progress-item {
        margin-bottom: 12px;
        padding: 8px 12px;
        background: rgba(249, 250, 251, 0.8);
        border-radius: 6px;
        border: 1px solid rgba(229, 231, 235, 0.5);

        &:last-child {
          margin-bottom: 0;
        }

        .file-name {
          display: block;
          font-size: 13px;
          color: #374151;
          margin-bottom: 6px;
          font-weight: 500;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .file-progress-wrapper {
          display: flex;
          align-items: center;
          gap: 8px;

          :deep(.ant-progress) {
            flex: 1;
          }

          .file-cancel-btn {
            flex-shrink: 0;
            color: #ef4444;
            padding: 2px;

            &:hover {
              color: #dc2626;
              background-color: rgba(239, 68, 68, 0.1);
            }
          }
        }

        :deep(.ant-progress-bg) {
          background: linear-gradient(90deg, #52c41a 0%, #73d13d 100%);
        }

        :deep(.ant-progress-status-exception .ant-progress-bg) {
          background: #ff4d4f;
        }
      }
    }
  }

  // 深色主题样式
  [data-theme='night'] {
    .upload-progress {
      background: rgba(53, 56, 63, 0.95);
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.7);
      border: 1px solid rgba(77, 77, 84, 0.3);

      .progress-header {
        .progress-title {
          color: #ffffff;
        }

        .progress-actions {
          .progress-percent,
          .progress-speed {
            color: #ffffff;
          }

          .cancel-btn {
            color: #ffffff;

            &:hover {
              background: rgba(255, 77, 79, 0.2);
            }
          }
        }
      }

      .file-progress-list {
        .file-progress-item {
          background: rgba(60, 63, 65, 0.9);
          border: 1px solid rgba(77, 77, 84, 0.3);

          .file-name {
            color: #ffffff;
          }

          :deep(.ant-progress-text) {
            color: #ffffff !important;
          }
        }
      }

      .overall-progress {
        :deep(.ant-progress-text) {
          color: #ffffff !important;
        }
      }
    }
  }

  // 响应式设计
  @media (max-width: 768px) {
    .upload-btn {
      :deep(.ant-btn) {
        height: 44px;
        padding: 0 20px;
        font-size: 14px;

        .anticon {
          font-size: 16px;
          margin-right: 6px;
        }
      }
    }

    .upload-progress {
      position: fixed;
      top: 10px;
      left: 10px;
      right: 10px;
      width: auto;
      max-width: none;
    }
  }
</style>
<style>
  [data-theme='night'] {
    .ant-popover-inner {
      background-color: #edf2fa !important;
    }
  }
</style>
