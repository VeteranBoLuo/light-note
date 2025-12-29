<template>
  <CommonContainer :title="$t('cloudSpace.title')">
    <div class="cloud-container">
      <div class="header">
        <div v-if="bookmark.isMobileDevice" class="mobile-header-left">
          <b-input
            v-model:value="cloud.searchFileName"
            :placeholder="$t('cloudSpace.fileName')"
            class="header-input"
            @enter="cloud.queryFieldList"
          >
            <template #suffix>
              <svg-icon class="dom-hover" :src="icon.navigation.search" size="16" @click="cloud.queryFieldList" />
            </template>
          </b-input>
        </div>
        <div v-else class="flex-align-center">
          <div
            style="font-weight: 500; font-size: 20px; position: absolute"
            @click="initializeCloudSpace"
            class="dom-hover"
            >{{ $t('cloudSpace.title') }}</div
          >
          <div style="width: 60px"></div>
          <div class="search-icon">
            <b-input
              @input="inputQueryFieldList"
              v-model:value="cloud.searchFileName"
              :placeholder="$t('cloudSpace.fileName')"
            >
              <template #suffix>
                <svg-icon class="dom-hover" :src="icon.navigation.search" size="16" @click="cloud.queryFieldList" />
              </template>
            </b-input>
          </div>
          <FileTypeFilter />
          <b-button type="default" class="batch-toggle-btn" @click="toggleBatchMode">
            {{ batchMode ? $t('cloudSpace.exitBatch') : $t('cloudSpace.batchAction') }}
          </b-button>
        </div>
        <HandleBtnGroup />
      </div>
      <div class="content-area">
        <CloudFolder />
        <FieldList
          :batch-mode="batchMode"
          :clear-key="clearSelectionKey"
          @preview-file="previewFile"
          @move-field="moveField"
        />
      </div>
    </div>
    <MoveFile v-model:visible="moveCfg.moveFileVisible" :files="moveCfg.files" @moved="handleMoveDone" />

    <!-- 全屏文件预览 -->
    <FilePreview v-model:visible="previewVisible" :file-info="previewFileInfo" @close="closePreview" />
  </CommonContainer>
</template>

<script lang="ts" setup>
  import icon from '@/config/icon';
  import { computed, onMounted, onUnmounted, reactive, ref } from 'vue';
  import { bookmarkStore, cloudSpaceStore } from '@/store';
  import HandleBtnGroup from '@/components/cloudSpace/HandleBtnGroup.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import CloudFolder from '@/components/cloudSpace/CloudFolder.vue';
  import FileTypeFilter from '@/components/cloudSpace/FileTypeFilter.vue';
  import { backRouterPage, debounce } from '@/utils/common';
  import MoveFile from '@/components/cloudSpace/MoveFile.vue';

  import FieldList from '@/components/cloudSpace/fieldList.vue';

  import FilePreview from '@/components/FilePreview.vue';
  import BButton from '@/components/base/BasicComponents/BButton.vue';

  const bookmark = bookmarkStore();
  const cloud = cloudSpaceStore();

  const batchMode = ref(false);

  const inputQueryFieldList = debounce(cloud.queryFieldList, 500);

  function initializeCloudSpace() {
    cloud.folder = {
      name: '全部文件',
      id: 'all',
    };
    cloud.searchFileName = '';
    cloud.queryFieldList();
    clearSelectionKey.value += 1;
    batchMode.value = false;
  }

  const moveCfg = reactive({
    moveFileVisible: false,
    files: [],
  });
  const clearSelectionKey = ref(0);

  const toggleBatchMode = () => {
    batchMode.value = !batchMode.value;
    if (!batchMode.value) {
      clearSelectionKey.value += 1;
    }
  };

  interface FileItem {
    id: string;
    fileName: string;
    fileType: string;
    fileUrl?: string;
    size?: number;
  }

  // 预览相关状态
  const previewVisible = ref(false);
  const previewLoading = ref(false);
  const previewError = ref(false);
  const errorMessage = ref('');
  const previewFileInfo = reactive<FileItem>({
    id: '',
    fileName: '',
    fileType: '',
    fileUrl: '',
  });

  // 文本预览相关状态
  const textContent = ref('');
  const wrapText = ref(true);

  // 缩放控制
  const zoomLevel = ref(1);

  // 文件类型映射配置
  const fileTypeConfig = {
    // 图片类型
    image: ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/bmp', 'image/webp', 'image/svg+xml'],

    // 视频类型
    video: ['video/mp4', 'video/avi', 'video/mov', 'video/wmv', 'video/flv', 'video/webm', 'video/quicktime'],

    // 文档类型
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

    // 文本类型
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
    if (!previewFileInfo.fileType || !previewFileInfo.fileName) return 'unsupported';

    const fileType = previewFileInfo.fileType.toLowerCase();
    const fileName = previewFileInfo.fileName.toLowerCase();

    // 检查每种文件类型
    for (const [type, mimeTypes] of Object.entries(fileTypeConfig)) {
      if (mimeTypes.some((mime) => fileType.includes(mime))) {
        return type;
      }
    }

    // 通过文件扩展名判断
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

  // 计算预览对话框宽度和高度
  const previewModalWidth = computed(() => {
    if (['image', 'text'].includes(previewType.value)) return '80vw';
    if (['word', 'excel', 'ppt', 'pdf'].includes(previewType.value)) return '90vw';
    return '85vw';
  });

  const previewModalHeight = computed(() => {
    if (['excel', 'ppt'].includes(previewType.value)) return '100vh';
    return '100vh';
  });

  const previewContentStyle = computed(() => ({
    height: `calc(${previewModalHeight.value} - 80px)`,
    transform: `scale(${zoomLevel.value})`,
    transformOrigin: 'center center',
  }));

  // 微软Office在线预览URL
  const microsoftOfficeViewerUrl = computed(() => {
    if (!previewFileInfo.fileUrl) return '';
    const encodedUrl = encodeURIComponent(previewFileInfo.fileUrl);
    return `https://view.officeapps.live.com/op/view.aspx?src=${encodedUrl}`;
  });

  // 是否可以尝试在线预览
  const canTryOnlinePreview = computed(() => {
    return ['word', 'excel', 'ppt'].includes(previewType.value);
  });

  const effectiveFileUrl = computed(() => {
    if (!previewFileInfo.fileUrl) return '';

    const url = previewFileInfo.fileUrl;

    // 如果已经是相对路径或/api路径，直接使用
    if (url.startsWith('/') || url.startsWith('./') || url.startsWith('../')) {
      return url;
    }

    // 将 https://boluo66.top/files/... 转换为 /api/files/...
    try {
      const urlObj = new URL(url);
      if (urlObj.hostname === 'boluo66.top') {
        return `/api${urlObj.pathname}`;
      }
    } catch (error) {
      console.error('URL解析错误:', error);
    }

    return url; // 返回原始URL作为fallback
  });

  // 文件预览函数
  async function previewFile(file: FileItem) {
    if (!file || !file.fileType) return;

    // 重置状态
    previewLoading.value = true;
    previewError.value = false;
    errorMessage.value = '';
    zoomLevel.value = 1;
    textContent.value = '';

    // 设置文件信息
    Object.assign(previewFileInfo, file);

    previewFileInfo.fileUrl = cloud.cacheImgArr.includes(previewFileInfo.id)
      ? `${previewFileInfo.fileUrl}?t=${Date.now()}`
      : previewFileInfo.fileUrl;
    previewVisible.value = true;
    // 根据文件类型进行不同的预处理
    try {
      switch (previewType.value) {
        case 'text':
          await loadTextContent(effectiveFileUrl.value);
          break;
        // 对于PDF、图片、Office文档等，不在此处设置加载完成
        // 它们的加载状态将由各自的 @load、@rendered 等事件控制
        default:
          // 其他文件类型不需要特殊预处理
          break;
      }
    } catch (error) {
      previewError.value = true;
      errorMessage.value = '文件加载失败';
      previewLoading.value = false; // 仅预处理出错时关闭加载
    }
  }

  function previewImage() {
    // 如果图片是被覆盖的，需要手动加上时间戳更新图片缓存
    const url = cloud.cacheImgArr.includes(previewFileInfo.id)
      ? `${previewFileInfo.fileUrl}?t=${Date.now()}`
      : previewFileInfo.fileUrl;
    bookmark.refreshViewer(url, {});
  }

  // 加载文本内容
  async function loadTextContent(url?: string) {
    if (!url) {
      textContent.value = '文件地址无效';
      previewLoading.value = false;
      return;
    }

    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP错误! 状态码: ${response.status}`);
      }
      const content = await response.text();

      // 限制文本长度，避免性能问题
      if (content.length > 1000000) {
        // 1MB限制
        textContent.value = content.substring(0, 1000000) + '\n\n... (内容过长，已截断)';
      } else {
        textContent.value = content;
      }
    } catch (error) {
      console.error('加载文本文件失败:', error);
      textContent.value = '抱歉，文件内容加载失败。';
      throw error;
    } finally {
      previewLoading.value = false;
    }
  }

  // 预览加载完成回调
  function onPreviewLoad() {
    previewLoading.value = false;
    previewError.value = false;
  }

  function onPreviewError(error?: any) {
    console.error('预览加载失败:', error);
    previewLoading.value = false;
    previewError.value = true;
    errorMessage.value = error?.message || '文件加载失败，请检查文件链接或格式';
  }

  // 图片加载完成回调
  function onImageLoad() {
    previewLoading.value = false;
  }

  // Office文档渲染回调
  function onOfficeRendered() {
    console.log(`${previewType.value} 文档渲染完成`);
    previewLoading.value = false;
    previewError.value = false;
  }

  function onOfficeError(error: any) {
    console.error(`${previewType.value} 文档渲染失败:`, error);
    previewLoading.value = false;
    previewError.value = true;
    errorMessage.value = `文档渲染失败: ${error.message || '请检查文件链接或格式'}`;
  }

  // 文本预览工具函数
  function toggleWrap() {
    wrapText.value = !wrapText.value;
  }

  async function copyText() {
    try {
      await navigator.clipboard.writeText(textContent.value);
      // 可以添加消息提示
      console.log('文本已复制到剪贴板');
    } catch (err) {
      console.error('复制失败:', err);
    }
  }

  function onTextScroll(event: Event) {
    // 可以添加滚动处理逻辑
  }

  // 缩放控制函数
  function zoomIn() {
    if (zoomLevel.value < 3) {
      zoomLevel.value = Math.min(3, zoomLevel.value + 0.1);
    }
  }

  function zoomOut() {
    if (zoomLevel.value > 0.5) {
      zoomLevel.value = Math.max(0.5, zoomLevel.value - 0.1);
    }
  }

  function resetZoom() {
    zoomLevel.value = 1;
  }

  // 尝试在线预览
  function tryOnlinePreview() {
    if (canTryOnlinePreview.value) {
      previewFileInfo.fileType = 'office-online';
      previewLoading.value = true;
      previewError.value = false;
    }
  }

  // 重新加载预览
  function retryPreview() {
    previewFile(previewFileInfo);
  }

  // 下载当前文件
  function downloadCurrentFile() {
    if (!previewFileInfo.fileUrl) return;

    const link = document.createElement('a');
    link.href = previewFileInfo.fileUrl;
    link.download = previewFileInfo.fileName;
    link.target = '_blank';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  // 获取文件类型名称
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

  // 关闭预览
  function closePreview() {
    previewVisible.value = false;
    // 延迟重置状态，避免动画卡顿
    setTimeout(() => {
      previewLoading.value = false;
      previewError.value = false;
      textContent.value = '';
      zoomLevel.value = 1;
    }, 300);
  }

  function moveField(fileOrFiles: FileItem | FileItem[]) {
    moveCfg.moveFileVisible = true;
    moveCfg.files = Array.isArray(fileOrFiles) ? fileOrFiles : [fileOrFiles];
  }

  function handleMoveDone() {
    clearSelectionKey.value += 1;
  }

  // 键盘事件处理
  function handleKeyDown(e: KeyboardEvent) {
    if (e.key === 'Escape' && previewVisible.value) {
      closePreview();
    }

    // Ctrl + 滚轮缩放
    if (e.ctrlKey && (e.key === '+' || e.key === '=')) {
      e.preventDefault();
      zoomIn();
    } else if (e.ctrlKey && e.key === '-') {
      e.preventDefault();
      zoomOut();
    } else if (e.ctrlKey && e.key === '0') {
      e.preventDefault();
      resetZoom();
    }
  }

  initializeCloudSpace();

  onMounted(() => {
    document.addEventListener('keydown', handleKeyDown);
    if (bookmark.isMobile) {
      batchMode.value = true;
    }
  });

  onUnmounted(() => {
    document.removeEventListener('keydown', handleKeyDown);
  });
</script>

<style lang="less" scoped>
  .cloud-container {
    padding: 20px 20px 0 20px;
    width: 100%;
    height: 100%;
    border-top: 1px solid var(--notePage-topBody-border-color);
    box-sizing: border-box;
    display: flex;
    gap: 10px;
    flex-direction: column;
  }

  .header {
    height: 40px;
    display: flex;
    justify-content: space-between;
    align-items: center;

    .mobile-header-left {
      display: flex;
      align-items: center;
      gap: 10px;
      flex: 1;
    }

    .header-input {
      width: 300px;
    }

    .batch-toggle-btn {
      margin-left: 10px;
    }
  }

  .content-area {
    height: calc(100% - 42px);
    overflow: hidden;
    display: flex;
  }

  .search-icon {
    height: 32px;
    width: 200px;
    margin-left: 250px;
    border-color: var(--card-border-color) !important;
  }

  @media (max-width: 1000px) {
    .header {
      height: 40px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 10px;

      .header-input {
        flex: 1;
        width: auto;
      }

      .batch-toggle-btn {
        margin-left: 0;
        white-space: nowrap;
      }
    }

    .file-container {
      height: calc(100% - 20px);
    }

    .file-label {
      width: 150px;
    }

    // 移动端预览样式调整
    .file-preview-modal {
      :deep(.ant-modal) {
        width: 95vw !important;
        max-width: 95vw;
        margin: 10px;
      }

      .preview-content {
        height: 60vh;
      }

      .preview-controls {
        flex-direction: column;
        gap: 12px;
        align-items: stretch;
      }
    }
  }
</style>
