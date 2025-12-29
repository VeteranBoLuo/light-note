<template>
  <div class="share-download">
    <div class="download-container">
      <div v-if="loading" class="loading-section">
        <div class="loading-card">
          <div class="loading-icon">
            <component :is="fileIcon" class="pulse" />
          </div>
          <h2 class="loading-title">{{ $t('cloudSpace.downloading') }}</h2>
          <p class="loading-subtitle">{{ fileName ? ` - ${fileName}` : '' }}</p>
          <div class="progress-bar">
            <div class="progress-fill"></div>
          </div>
          <p class="loading-text">{{ $t('cloudSpace.pleaseWait') }}</p>
        </div>
      </div>
      <div v-else-if="downloadSuccess" class="success-section">
        <div class="success-card">
          <div class="success-header">
            <div class="success-icon">
              <CheckCircleOutlined class="bounce" />
            </div>
            <h2 class="success-title">{{ $t('cloudSpace.downloadSuccess') }}</h2>
            <p class="success-subtitle">{{ fileName }}</p>
          </div>
          <div class="file-details">
            <div class="detail-item">
              <FileTextOutlined />
              <span
                ><strong>{{ $t('cloudSpace.fileSize') }}:</strong> {{ formatFileSize(file.fileSize) }}</span
              >
            </div>
            <div class="detail-item">
              <ClockCircleOutlined />
              <span
                ><strong>{{ $t('cloudSpace.createTime') }}:</strong> {{ file.createTime }}</span
              >
            </div>
            <div class="detail-item">
              <UserOutlined />
              <span
                ><strong>{{ $t('cloudSpace.createBy') }}:</strong> {{ file.createBy }}</span
              >
            </div>
          </div>
          <div class="action-buttons">
            <a-space>
              <a-button type="primary" size="large" @click="downloadFile" class="download-btn">
                <DownloadOutlined />
                {{ $t('cloudSpace.downloadAgain') }}
              </a-button>
              <a-button size="large" @click="previewFile" class="preview-btn">
                <EyeOutlined />
                {{ $t('cloudSpace.preview') }}
              </a-button>
            </a-space>
          </div>
        </div>
      </div>
      <div v-else class="file-info-section">
        <div class="file-card">
          <div class="file-header">
            <div class="file-icon">
              <component :is="fileIcon" />
            </div>
            <h2 class="file-title">{{ fileName || $t('cloudSpace.share') }}</h2>
            <p class="file-subtitle">{{ $t('cloudSpace.shareDescription') }}</p>
          </div>
          <div class="file-details">
            <div class="detail-item">
              <FileTextOutlined />
              <span
                ><strong>{{ $t('cloudSpace.fileSize') }}:</strong> {{ formatFileSize(file.fileSize) }}</span
              >
            </div>
            <div class="detail-item">
              <ClockCircleOutlined />
              <span
                ><strong>{{ $t('cloudSpace.createTime') }}:</strong> {{ file.createTime }}</span
              >
            </div>
            <div class="detail-item">
              <UserOutlined />
              <span
                ><strong>{{ $t('cloudSpace.createBy') }}:</strong> {{ file.creatorName }}</span
              >
            </div>
          </div>
          <div class="action-buttons">
            <a-space :size="40">
              <a-button size="large" @click="previewFile" class="preview-btn">
                <EyeOutlined />
                {{ $t('cloudSpace.preview') }}
              </a-button>
              <a-button type="primary" size="large" @click="downloadFile" class="download-btn">
                <DownloadOutlined />
                {{ $t('cloudSpace.download') }}
              </a-button>
            </a-space>
          </div>
        </div>
      </div>
    </div>
    <!-- 文件预览组件 -->
    <FilePreview v-model:visible="previewVisible" :file-info="previewFileInfo" @close="previewVisible = false" />
  </div>
</template>

<script lang="ts" setup>
  import { ref, computed, reactive } from 'vue';
  import { useRoute } from 'vue-router';
  import { useI18n } from 'vue-i18n';
  import {
    CheckCircleOutlined,
    FileTextOutlined,
    FileImageOutlined,
    FilePdfOutlined,
    FileWordOutlined,
    FileExcelOutlined,
    VideoCameraOutlined,
    AudioOutlined,
    DownloadOutlined,
    ClockCircleOutlined,
    UserOutlined,
    EyeOutlined,
  } from '@ant-design/icons-vue';
  import { downloadField } from '@/http/common.ts';
  import { apiBasePost } from '@/http/request';
  import FilePreview from '@/components/FilePreview.vue';

  const route = useRoute();
  const { t } = useI18n();
  const loading = ref(false);
  const downloadSuccess = ref(false);
  const previewVisible = ref(false);

  // 根据文件类型获取对应的图标组件
  const fileIcon = computed(() => {
    const type = file.type.toLowerCase();
    if (type.includes('image')) return FileImageOutlined;
    if (type.includes('pdf')) return FilePdfOutlined;
    if (type.includes('word') || type.includes('doc')) return FileWordOutlined;
    if (type.includes('excel') || type.includes('xls')) return FileExcelOutlined;
    if (type.includes('video')) return VideoCameraOutlined;
    if (type.includes('audio')) return AudioOutlined;
    return FileTextOutlined;
  });

  const file = reactive<{
    id: string;
    fileName: string;
    type: string;
    createBy: string;
    createTime: string;
    fileSize: number;
    creatorName: string;
    fileUrl: string;
    fileType: string;
  }>({
    id: '',
    fileName: '',
    type: '',
    createBy: '',
    createTime: '',
    fileSize: 0,
    creatorName: '默认用户',
    fileUrl: '',
    fileType: '',
  });
  // 格式化文件大小
  const formatFileSize = (size: number) => {
    if (!size) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let index = 0;
    while (size >= 1024 && index < units.length - 1) {
      size /= 1024;
      index++;
    }
    return `${size.toFixed(2)} ${units[index]}`;
  };

  const fileName = computed(() => file.fileName);

  // 预览文件信息
  const previewFileInfo = computed(() => ({
    id: file.id,
    fileName: file.fileName,
    fileType: file.fileType,
    fileUrl: file.fileUrl,
  }));

  // 从路由参数中获取文件名 and 文件类型
  const initFileInfo = () => {
    apiBasePost('/api//file/getFileInfo', { id: route.params.id as string }).then((res) => {
      if (res.status === 200) {
        Object.assign(file, res.data);
      }
    });
  };

  const downloadFile = async () => {
    const id = route.params.id as string;
    if (id) {
      loading.value = true;
      try {
        await downloadField(id);
        loading.value = false;
        downloadSuccess.value = true;
      } catch (error) {
        console.error('下载失败:', error);
        loading.value = false;
      }
    }
  };

  const previewFile = () => {
    previewVisible.value = true;
  };

  // 初始化文件信息
  initFileInfo();
</script>

<style lang="less" scoped>
  .share-download {
    display: flex;
    justify-content: center;
    align-items: center;
    min-height: 100vh;
    background:
      radial-gradient(circle at 20% 80%, rgba(120, 119, 198, 0.3) 0%, transparent 50%),
      radial-gradient(circle at 80% 20%, rgba(255, 119, 198, 0.3) 0%, transparent 50%),
      radial-gradient(circle at 40% 40%, rgba(120, 219, 226, 0.3) 0%, transparent 50%),
      var(--bg-image, linear-gradient(135deg, #667eea 0%, #764ba2 100%));
    padding: 20px;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    position: relative;
    overflow: hidden;

    &::before {
      content: '';
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: url('data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><defs><pattern id="grain" width="100" height="100" patternUnits="userSpaceOnUse"><circle cx="25" cy="25" r="1" fill="rgba(255,255,255,0.1)"/><circle cx="75" cy="75" r="1" fill="rgba(255,255,255,0.1)"/><circle cx="50" cy="10" r="0.5" fill="rgba(255,255,255,0.1)"/><circle cx="10" cy="50" r="0.5" fill="rgba(255,255,255,0.1)"/><circle cx="90" cy="50" r="0.5" fill="rgba(255,255,255,0.1)"/><circle cx="50" cy="90" r="0.5" fill="rgba(255,255,255,0.1)"/></pattern></defs><rect width="100" height="100" fill="url(%23grain)"/></svg>');
      pointer-events: none;
      opacity: 0.5;
    }

    .download-container {
      max-width: 600px;
      width: 100%;

      .loading-section,
      .success-section,
      .file-info-section {
        display: flex;
        justify-content: center;
        align-items: center;
        min-height: 500px;
      }

      .loading-card,
      .success-card,
      .file-card {
        background: rgba(255, 255, 255, 0.1);
        backdrop-filter: blur(20px);
        -webkit-backdrop-filter: blur(20px);
        border-radius: 24px;
        box-shadow:
          0 20px 60px rgba(0, 0, 0, 0.15),
          inset 0 1px 0 rgba(255, 255, 255, 0.2);
        padding: 40px;
        text-align: center;
        width: 100%;
        max-width: 500px;
        transition: all 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275);
        border: 1px solid rgba(255, 255, 255, 0.2);
        position: relative;
        overflow: hidden;

        &::before {
          content: '';
          position: absolute;
          top: 0;
          left: -100%;
          width: 100%;
          height: 100%;
          background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.1), transparent);
          transition: left 0.5s;
        }

        &:hover {
          box-shadow:
            0 30px 80px rgba(0, 0, 0, 0.2),
            inset 0 1px 0 rgba(255, 255, 255, 0.3);

          &::before {
            left: 100%;
          }
        }
      }

      .loading-card {
        .loading-icon {
          margin-bottom: 20px;

          .pulse {
            animation: pulse 2s infinite;
            font-size: 80px;
            color: var(--primary-btn-bg-color, #667eea);
          }
        }

        .loading-title {
          font-size: 24px;
          font-weight: 600;
          color: var(--text-color, #333);
          margin-bottom: 8px;
        }

        .loading-subtitle {
          font-size: 16px;
          color: var(--desc-color, #666);
          margin-bottom: 20px;
        }

        .progress-bar {
          width: 100%;
          height: 6px;
          background: var(--bl-input-noBorder-bg-color, #f0f0f0);
          border-radius: 3px;
          overflow: hidden;
          margin-bottom: 20px;

          .progress-fill {
            height: 100%;
            background: linear-gradient(90deg, #667eea, #764ba2);
            animation: progress 2s ease-in-out infinite;
          }
        }

        .loading-text {
          color: var(--desc-color, #666);
          font-size: 14px;
        }
      }

      .success-card,
      .file-card {
        .success-header,
        .file-header {
          margin-bottom: 30px;

          .success-icon,
          .file-icon {
            margin-bottom: 20px;
            font-size: 50px;
            color: var(--primary-btn-bg-color, #667eea);
            filter: drop-shadow(0 4px 12px rgba(0, 0, 0, 0.2));
          }

          .bounce {
            animation: bounce 1s ease-in-out;
          }

          .success-title,
          .file-title {
            font-size: 32px;
            font-weight: 800;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            background-clip: text;
            margin-bottom: 12px;
            text-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
            animation: titleGlow 2s ease-in-out infinite alternate;
          }

          .success-subtitle,
          .file-subtitle {
            font-size: 16px;
            color: #ccc;
          }
        }

        .file-details {
          background: var(--bl-input-noBorder-bg-color, #f8f9fa);
          border-radius: 12px;
          padding: 20px;
          margin-bottom: 30px;

          .detail-item {
            display: flex;
            align-items: center;
            margin-bottom: 16px;
            gap: 10px;
            padding: 8px 12px;
            background: rgba(255, 255, 255, 0.1);
            border-radius: 8px;
            transition: all 0.3s ease;

            &:last-child {
              margin-bottom: 0;
            }

            &:hover {
              background: rgba(255, 255, 255, 0.2);
              transform: translateX(5px);
            }

            svg {
              margin-right: 16px;
              color: var(--icon-color, #bfbfbf);
              font-size: 20px;
              flex-shrink: 0;
            }

            span {
              color: var(--text-color, #555);
              font-size: 14px;
              line-height: 1.4;

              strong {
                color: var(--text-color, #333);
                font-weight: 600;
              }
            }
          }
        }

        .action-buttons {
          .download-btn,
          .preview-btn {
            width: 100%;
            height: 56px;
            font-size: 18px;
            font-weight: 700;
            border-radius: 16px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            border: none;
            transition: all 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275);
            display: flex;
            align-items: center;
            justify-content: center;
            position: relative;
            overflow: hidden;
            color: white;
            text-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);

            &::before {
              content: '';
              position: absolute;
              top: 0;
              left: -100%;
              width: 100%;
              height: 100%;
              background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.2), transparent);
              transition: left 0.5s;
            }

            &:hover {
              transform: translateY(-3px) scale(1.05);
              box-shadow: 0 12px 30px rgba(102, 126, 234, 0.5);
              background: linear-gradient(135deg, #764ba2 0%, #667eea 100%);

              &::before {
                left: 100%;
              }
            }

            svg {
              margin-right: 12px;
              font-size: 20px;
            }
          }

          .preview-btn {
            background: linear-gradient(135deg, #52c41a 0%, #73d13d 100%);

            &:hover {
              background: linear-gradient(135deg, #73d13d 0%, #52c41a 100%);
              box-shadow: 0 12px 30px rgba(82, 196, 26, 0.5);
            }
          }
        }
      }
    }
  }

  @keyframes pulse {
    0%,
    100% {
      opacity: 1;
      transform: scale(1);
    }
    50% {
      opacity: 0.7;
      transform: scale(1.05);
    }
  }

  @keyframes progress {
    0% {
      width: 0%;
    }
    50% {
      width: 70%;
    }
    100% {
      width: 100%;
    }
  }

  @keyframes bounce {
    0%,
    20%,
    50%,
    80%,
    100% {
      transform: translateY(0);
    }
    40% {
      transform: translateY(-10px);
    }
    60% {
      transform: translateY(-5px);
    }
  }

  @keyframes titleGlow {
    from {
      filter: brightness(1) drop-shadow(0 0 5px rgba(102, 126, 234, 0.3));
    }
    to {
      filter: brightness(1.1) drop-shadow(0 0 15px rgba(102, 126, 234, 0.6));
    }
  }

  @media (max-width: 768px) {
    .share-download {
      padding: 10px;

      .download-container {
        .loading-card,
        .success-card,
        .file-card {
          padding: 30px 20px;

          .loading-icon,
          .success-icon,
          .file-icon {
            svg {
              font-size: 60px;
            }
          }

          .success-title,
          .file-title {
            font-size: 24px;
          }

          .file-details {
            padding: 16px;

            .detail-item {
              span {
                font-size: 13px;
              }
            }
          }

          .download-btn,
          .preview-btn {
            height: 45px;
            font-size: 15px;
          }
        }
      }
    }
  }
</style>
