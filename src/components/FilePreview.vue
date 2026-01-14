<template>
  <div v-if="visible" class="fullscreen-preview">
    <div class="preview-header">
      <span class="file-name">{{ fileInfo.fileName }}</span>
      <div class="preview-actions">
        <a-tooltip title="关闭预览">
          <a-button size="small" @click="handleClose" class="action-btn">
            <template #icon><CloseOutlined /></template>
          </a-button>
        </a-tooltip>
      </div>
    </div>
    <div class="preview-content" @click.stop>
      <!-- 加载状态 -->
      <div v-if="loading" class="preview-loading">
        <a-spin size="large" tip="文件加载中..." />
      </div>

      <!-- 错误状态 -->
      <div v-else-if="error" class="preview-error">
        <FileUnknownOutlined class="error-icon" />
        <h3>文件加载失败</h3>
        <p>{{ errorMessage }}</p>
        <a-button type="primary" @click="retry" class="retry-btn">
          <RedoOutlined />
          重新加载
        </a-button>
      </div>

      <!-- 文件预览内容 -->
      <div :style="{ opacity: loading ? '0' : '1' }" class="preview-main flex-center">
        <!-- 1. PDF预览 -->
        <iframe
          v-if="previewType === 'pdf' && pdfBlobUrl"
          :src="pdfBlobUrl"
          class="preview-iframe"
          @load="onLoad"
          @error="onError"
        />

        <!-- 2. 视频预览 -->
        <VideoPreview
          v-else-if="previewType === 'video'"
          :video-url="effectiveFileUrl"
          class="preview-video"
          @play="onRendered"
        />

        <!-- 3. 图片预览 -->
        <div v-else-if="previewType === 'image'" class="preview-image-container">
          <img
            :src="effectiveFileUrl"
            :alt="fileInfo.fileName"
            class="preview-image"
            @load="onImageLoad"
            @error="onError"
            @click="previewImage"
          />
        </div>

        <!-- 4. Word文档预览 -->
        <div v-else-if="previewType === 'word'" class="office-preview-container">
          <VueOfficeDocx :src="effectiveFileUrl" @rendered="onRendered" @error="onOfficeError" class="office-preview" />
        </div>

        <!-- 5. Excel预览 -->
        <div v-else-if="previewType === 'excel'" class="office-preview-container">
          <VueOfficeExcel
            :src="effectiveFileUrl"
            @rendered="onRendered"
            @error="onOfficeError"
            class="office-preview"
          />
        </div>

        <!-- 6. PPT预览 -->
        <div v-else-if="previewType === 'ppt'" class="office-preview-container">
          <VueOfficePptx :src="effectiveFileUrl" @rendered="onRendered" @error="onOfficeError" class="office-preview" />
        </div>

        <!-- 7. 文本文件预览 -->
        <div v-else-if="previewType === 'text'" class="text-preview-container">
          <div class="text-toolbar">
            <a-space>
              <a-tooltip title="自动换行">
                <a-button size="small" @click="toggleWrap" :type="wrapText ? 'primary' : 'default'" class="toolbar-btn">
                  <AlignLeftOutlined />
                </a-button>
              </a-tooltip>
              <a-tooltip title="复制文本">
                <a-button size="small" @click="copyText" class="toolbar-btn">
                  <CopyOutlined />
                </a-button>
              </a-tooltip>
              <span class="text-info">字数: {{ textContent.length }} 字符</span>
            </a-space>
          </div>
          <template v-if="fileInfo.fileType === 'text/html'">
            <div v-html="textContent" class="html-container"></div>
          </template>
          <pre
            v-else
            :class="{ 'text-wrap': wrapText, 'text-no-wrap': !wrapText }"
            class="preview-text"
            @scroll="onTextScroll"
          >
              {{ textContent }}
          </pre>
        </div>

        <!-- 8. 微软Office在线预览（备用方案） -->
        <div v-else-if="previewType === 'office-online'" class="online-preview-container">
          <iframe :src="microsoftOfficeViewerUrl" class="online-preview-iframe" @load="onLoad" @error="onError" />
          <div class="online-preview-notice">
            <InfoCircleOutlined />
            正在使用微软Office在线预览服务
          </div>
        </div>

        <!-- 9. 不支持预览的文件类型 -->
        <div v-else-if="previewType === 'unsupported'" class="unsupported-preview">
          <div class="unsupported-icon">
            <FileUnknownOutlined />
          </div>
          <h3>不支持预览此文件类型</h3>
          <p>当前文件格式暂不支持在线预览，您可以通过下载后查看</p>
          <a-space>
            <a-button type="primary" @click="downloadFile" v-if="fileInfo.fileUrl">
              <DownloadOutlined />
              下载文件
            </a-button>
            <a-button @click="tryOnlinePreview" v-if="canTryOnlinePreview">
              <GlobalOutlined />
              尝试在线预览
            </a-button>
          </a-space>
        </div>
      </div>
    </div>

    <!-- 预览控制栏 -->
    <div class="preview-controls">
      <a-space>
        <span class="file-type-badge">{{ getFileTypeName(previewType) }}</span>
        <a-button-group size="small">
          <a-tooltip title="下载文件">
            <a-button size="small" @click="downloadFile" v-if="fileInfo.fileUrl" class="action-btn">
              <template #icon><DownloadOutlined /></template>
            </a-button>
          </a-tooltip>
        </a-button-group>
      </a-space>
    </div>
  </div>
</template>

<script setup lang="ts">
  import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
  import VideoPreview from '@/components/base/VideoPreview.vue';

  // 引入vue-office组件
  import VueOfficeDocx from '@vue-office/docx';
  import VueOfficeExcel from '@vue-office/excel';
  import VueOfficePptx from '@vue-office/pptx';

  // 引入vue-office样式
  import '@vue-office/docx/lib/index.css';
  import '@vue-office/excel/lib/index.css';

  // 引入Ant Design Vue图标
  import {
    AlignLeftOutlined,
    CloseOutlined,
    CopyOutlined,
    DownloadOutlined,
    FileUnknownOutlined,
    GlobalOutlined,
    InfoCircleOutlined,
    RedoOutlined,
  } from '@ant-design/icons-vue';

  const props = defineProps<{
    visible: boolean;
    fileInfo: {
      id: string;
      fileName: string;
      fileType: string;
      fileUrl?: string;
    };
  }>();

  const emit = defineEmits<{
    'update:visible': [value: boolean];
    close: [];
  }>();

  // 内部状态
  const loading = ref(false);
  const error = ref(false);
  const errorMessage = ref('');
  const textContent = ref('');
  const wrapText = ref(true);
  const pdfBlobUrl = ref<string>('');

  // 文件类型映射配置
  const fileTypeConfig = {
    image: ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/bmp', 'image/webp', 'image/svg+xml'],
    video: ['video/mp4', 'video/avi', 'video/mov', 'video/wmv', 'video/flv', 'video/webm', 'video/quicktime'],
    pdf: ['application/pdf'],
    word: [
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-word',
      'application/doc',
      'application/docx',
    ],
    excel: [
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/xls',
      'application/xlsx',
    ],
    ppt: [
      'application/vnd.ms-powerpoint',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'application/ppt',
      'application/pptx',
    ],
    text: [
      'text/plain',
      'text/html',
      'text/css',
      'text/javascript',
      'application/javascript',
      'text/xml',
      'application/json',
      'text/csv',
      'application/x-sh',
      'application/x-bat',
    ],
  };

  // 计算预览类型
  const previewType = computed(() => {
    if (!props.fileInfo.fileType || !props.fileInfo.fileName) return 'unsupported';

    const fileType = props.fileInfo.fileType.toLowerCase();
    const fileName = props.fileInfo.fileName.toLowerCase();

    for (const [type, mimeTypes] of Object.entries(fileTypeConfig)) {
      if (mimeTypes.some((mime) => fileType.includes(mime))) {
        return type;
      }
    }

    const extension = fileName.split('.').pop();
    const extensionMap: { [key: string]: string } = {
      doc: 'word',
      docx: 'word',
      xls: 'excel',
      xlsx: 'excel',
      ppt: 'ppt',
      pptx: 'ppt',
      pdf: 'pdf',
      txt: 'text',
      html: 'text',
      htm: 'text',
      css: 'text',
      js: 'text',
      json: 'text',
      xml: 'text',
      csv: 'text',
      md: 'text',
      log: 'text',
    };

    return extensionMap[extension] || 'unsupported';
  });

  // 微软Office在线预览URL
  const microsoftOfficeViewerUrl = computed(() => {
    if (!props.fileInfo.fileUrl) return '';
    const encodedUrl = encodeURIComponent(props.fileInfo.fileUrl);
    return `https://view.officeapps.live.com/op/view.aspx?src=${encodedUrl}`;
  });

  const canTryOnlinePreview = computed(() => {
    return ['word', 'excel', 'ppt'].includes(previewType.value);
  });

  const effectiveFileUrl = computed(() => {
    if (!props.fileInfo.fileUrl) return '';

    const url = props.fileInfo.fileUrl;

    return url;
  });

  // 监听 visible 变化，开始预览
  watch(
    () => props.visible,
    async (newVisible) => {
      if (newVisible && props.fileInfo) {
        await startPreview(props.fileInfo);
      }
    },
    { immediate: true },
  );

  // 开始预览
  async function startPreview(file: typeof props.fileInfo) {
    loading.value = true;
    error.value = false;
    errorMessage.value = '';
    textContent.value = '';
    try {
      if (previewType.value === 'pdf') {
        await loadPdfBlob(effectiveFileUrl.value);
      } else if (previewType.value === 'text') {
        await loadTextContent(effectiveFileUrl.value);
      } else if (previewType.value === 'unsupported') {
        loading.value = false;
      }
    } catch (err) {
      error.value = true;
      errorMessage.value = '文件加载失败';
      loading.value = false;
    }
  }

  // 加载PDF blob URL
  async function loadPdfBlob(url?: string) {
    if (!url) {
      error.value = true;
      errorMessage.value = '文件地址无效';
      loading.value = false;
      return;
    }

    try {
      // 先清理之前的blob URL
      if (pdfBlobUrl.value) {
        URL.revokeObjectURL(pdfBlobUrl.value);
        pdfBlobUrl.value = '';
      }

      const response = await fetch(url, { mode: 'cors' });
      if (!response.ok) {
        throw new Error(`HTTP错误! 状态码: ${response.status}`);
      }

      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);
      pdfBlobUrl.value = blobUrl;
    } catch (err) {
      console.error('加载PDF文件失败:', err);
      error.value = true;
      errorMessage.value = 'PDF加载失败，请检查文件链接或格式';
      throw err;
    } finally {
      loading.value = false;
    }
  }

  // 加载文本内容
  async function loadTextContent(url?: string) {
    if (!url) {
      textContent.value = '文件地址无效';
      loading.value = false;
      return;
    }

    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP错误! 状态码: ${response.status}`);
      }
      const content = await response.text();

      if (content.length > 1000000) {
        textContent.value = content.substring(0, 1000000) + '\n\n... (内容过长，已截断)';
      } else {
        textContent.value = content;
      }
    } catch (err) {
      console.error('加载文本文件失败:', err);
      textContent.value = '抱歉，文件内容加载失败。';
      throw err;
    } finally {
      loading.value = false;
    }
  }

  // 事件处理
  function onLoad() {
    loading.value = false;
    error.value = false;
  }

  function onError(err?: any) {
    console.error('预览加载失败:', err);
    loading.value = false;
    error.value = true;
    errorMessage.value = err?.message || '文件加载失败，请检查文件链接或格式';
  }

  function onImageLoad() {
    loading.value = false;
  }

  function onRendered() {
    loading.value = false;
    error.value = false;
  }

  function onOfficeError(err: any) {
    console.error(`${previewType.value} 文档渲染失败:`, err);
    loading.value = false;
    error.value = true;
    errorMessage.value = `文档渲染失败: ${err.message || '请检查文件链接或格式'}`;
  }

  // 工具函数
  function toggleWrap() {
    wrapText.value = !wrapText.value;
  }

  async function copyText() {
    try {
      await navigator.clipboard.writeText(textContent.value);
      console.log('文本已复制到剪贴板');
    } catch (err) {
      console.error('复制失败:', err);
    }
  }

  function onTextScroll() {}

  function previewImage() {
    // 这里可以调用外部的图片预览逻辑
  }

  function tryOnlinePreview() {
    if (canTryOnlinePreview.value) {
      // 这里可以修改 fileInfo 为 office-online 类型
    }
  }

  function downloadFile() {
    if (!props.fileInfo.fileUrl) return;

    const link = document.createElement('a');
    link.href = props.fileInfo.fileUrl;
    link.download = props.fileInfo.fileName;
    link.target = '_blank';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  function retry() {
    startPreview(props.fileInfo);
  }

  function handleClose() {
    // 清理PDF blob URL
    if (pdfBlobUrl.value) {
      URL.revokeObjectURL(pdfBlobUrl.value);
      pdfBlobUrl.value = '';
    }
    emit('close');
  }

  function getFileTypeName(type: string) {
    const typeNames: { [key: string]: string } = {
      pdf: 'PDF文档',
      word: 'Word文档',
      excel: 'Excel表格',
      ppt: 'PPT演示文稿',
      image: '图片',
      video: '视频',
      text: '文本文件',
      'office-online': 'Office在线预览',
      unsupported: '不支持的类型',
    };
    return typeNames[type] || '未知类型';
  }

  // 键盘事件
  function handleKeyDown(e: KeyboardEvent) {
    if (e.key === 'Escape' && props.visible) {
      handleClose();
    }
  }

  onMounted(() => {
    document.addEventListener('keydown', handleKeyDown);
  });

  onUnmounted(() => {
    document.removeEventListener('keydown', handleKeyDown);
    // 清理PDF blob URL
    if (pdfBlobUrl.value) {
      URL.revokeObjectURL(pdfBlobUrl.value);
      pdfBlobUrl.value = '';
    }
  });
</script>

<style lang="less" scoped>
  .fullscreen-preview {
    position: fixed;
    top: 0;
    left: 0;
    width: 100vw;
    height: 100vh;
    background: white;
    z-index: 99999;

    .preview-header {
      display: flex;
      align-items: center;
      width: 100%;
      background-color: white;
      color: #000;
      padding: 0 8px;
      height: 32px;
      box-sizing: border-box;
      justify-content: center;
      .file-name {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .preview-actions {
        position: absolute;
        right: 8px;
        display: flex;
        gap: 8px;

        .action-btn {
          display: flex;
          align-items: center;
          justify-content: center;
        }
      }
    }

    .preview-content {
      height: calc(100vh - 80px);
      position: relative;
      display: flex;
      justify-content: center;
      align-items: center;
      overflow: auto;
      .preview-loading {
        position: absolute;
        z-index: 10;
        text-align: center;
        padding: 40px;
        :deep(.ant-spin-text) {
          margin-top: 16px;
          color: #666;
        }
      }

      .preview-error {
        text-align: center;
        padding: 40px;
        position: absolute;
        .error-icon {
          font-size: 64px;
          color: #ff4d4f;
          margin-bottom: 16px;
        }

        h3 {
          margin-bottom: 8px;
          color: #666;
        }

        p {
          color: #999;
          margin-bottom: 20px;
        }

        .retry-btn {
          margin-top: 16px;
        }
      }

      .preview-main {
        width: 100%;
        height: 100%;

        .preview-iframe {
          width: 100%;
          height: 100%;
          border: none;
        }

        .preview-pdf-viewer {
          width: 100%;
          height: 100%;
          border: none;
        }

        .preview-video {
          width: 100%;
          height: 100%;
          display: flex;
          justify-content: center;
          align-items: center;
        }

        .preview-image-container {
          width: 100%;
          height: 100%;
          display: flex;
          justify-content: center;
          align-items: center;

          .preview-image {
            max-width: 100%;
            max-height: 100%;
            object-fit: contain;
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
          }
        }

        .office-preview-container {
          width: 100%;
          height: 100%;
          background: white;
          position: absolute;
          top: 0;
          left: 0;

          .office-preview {
            width: 100%;
            height: 100%;
            border: none;
          }
        }

        .text-preview-container {
          width: 100%;
          height: 100%;
          display: flex;
          flex-direction: column;
          background: white;

          .text-toolbar {
            padding: 12px 16px;
            border-bottom: 1px solid #d9d9d9;
            background: #fafafa;

            .toolbar-btn {
              display: flex;
              align-items: center;
            }

            .text-info {
              color: #666;
              font-size: 12px;
            }
          }

          .preview-text {
            flex: 1;
            margin: 0;
            padding: 16px;
            overflow: auto;
            background: #f8f9fa;
            font-family: 'Monaco', 'Menlo', 'Consolas', 'Ubuntu Mono', monospace;
            font-size: 14px;
            line-height: 1.5;
            color: #333;
          }

          .text-wrap {
            white-space: pre-wrap;
            word-wrap: break-word;
          }

          .text-no-wrap {
            white-space: pre;
            overflow-x: auto;
          }
        }

        .online-preview-container {
          width: 100%;
          height: 100%;
          position: relative;

          .online-preview-iframe {
            width: 100%;
            height: calc(100% - 40px);
            border: none;
          }

          .online-preview-notice {
            height: 40px;
            display: flex;
            align-items: center;
            justify-content: center;
            background: #e6f7ff;
            color: #1890ff;
            font-size: 12px;
            border-top: 1px solid #91d5ff;
          }
        }

        .unsupported-preview {
          text-align: center;
          padding: 60px 40px;

          .unsupported-icon {
            font-size: 72px;
            color: #d9d9d9;
            margin-bottom: 24px;
          }

          h3 {
            margin-bottom: 12px;
            color: #666;
          }

          p {
            color: #999;
            margin-bottom: 24px;
            max-width: 300px;
            margin-left: auto;
            margin-right: auto;
          }
        }
      }
    }

    .preview-controls {
      padding: 12px 16px;
      border-top: 1px solid #d9d9d9;
      background: #fafafa;
      display: flex;
      justify-content: space-between;
      align-items: center;

      .file-type-badge {
        padding: 4px 8px;
        background: #1890ff;
        color: white;
        border-radius: 4px;
        font-size: 12px;
      }
    }
  }

  .html-container {
    color: black;
    padding: 9px;
    :deep(a) {
      text-decoration: underline !important;
      font-family: 'Arial', sans-serif;
      font-weight: 600;
    }
  }
</style>
