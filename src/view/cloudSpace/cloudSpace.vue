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
          <b-button class="batch-toggle-btn" @click="toggleBatchMode">
            {{ batchMode ? $t('cloudSpace.exitBatch') : $t('cloudSpace.batchAction') }}
          </b-button>
        </div>
        <HandleBtnGroup ref="handleBtnGroup" />
      </div>
      <div class="content-area">
        <CloudFolder @uploadFiles="onUploadFiles" />
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

  const handleBtnGroup = ref();
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

  const onUploadFiles = ({ files, folderId }) => {
    handleBtnGroup.value.uploadFiles(files, folderId);
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
    return previewFileInfo.fileUrl; // 返回原始URL作为fallback
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
    previewVisible.value = true;
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

  initializeCloudSpace();

  onMounted(() => {
    if (bookmark.isMobile) {
      batchMode.value = true;
    }
  });

  onUnmounted(() => {});
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
    .cloud-container {
      padding: unset;
    }
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
