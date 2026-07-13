<template>
  <CommonContainer :title="$t('cloudSpace.title')">
    <div
      class="cloud-container"
      @dragover.prevent="onDragOver"
      @dragenter.prevent="onDragEnter"
      @dragleave.prevent="onDragLeave"
      @drop.prevent="onDrop"
    >
      <!-- 拖拽提示层 -->
      <div v-if="dragActive" class="drag-overlay">
        <div class="drag-content">
          <svg-icon :src="icon.file_upload" size="64" color="#667eea" />
          <p>{{ $t('cloudSpace.dropFiles') }}</p>
        </div>
      </div>

      <div class="header">
        <div v-if="bookmark.isMobile" class="mobile-header">
          <div class="mobile-tools">
            <div class="view-toggle mobile-view-toggle">
              <button class="view-toggle-btn" :class="{ active: viewMode === 'card' }" @click="setViewMode('card')">
                <svg-icon :src="cardViewIcon" size="14" />
              </button>
              <button class="view-toggle-btn" :class="{ active: viewMode === 'table' }" @click="setViewMode('table')">
                <svg-icon :src="listViewIcon" size="14" />
              </button>
            </div>
            <FileTypeFilter />
            <HandleBtnGroup ref="handleBtnGroup" class="mobile-upload-actions" />
          </div>
        </div>
        <div v-else class="header-pc">
          <div
            style="font-weight: 500; font-size: 20px; cursor: pointer; white-space: nowrap"
            @click="initializeCloudSpace('')"
            v-click-log="{ module: '云空间', operation: '刷新云空间' }"
            class="dom-hover"
            >{{ $t('cloudSpace.title') }}</div
          >
          <div class="header-spacer"></div>
          <div class="header-toolbar">
            <div class="view-toggle">
              <button class="view-toggle-btn" :class="{ active: viewMode === 'card' }" @click="setViewMode('card')">
                <svg-icon :src="cardViewIcon" size="14" />
              </button>
              <button class="view-toggle-btn" :class="{ active: viewMode === 'table' }" @click="setViewMode('table')">
                <svg-icon :src="listViewIcon" size="14" />
              </button>
            </div>
            <b-button
              class="batch-toggle-btn"
              @click="toggleBatchMode"
              v-click-log="{ module: '云空间', operation: batchMode ? '退出批量操作' : '开启批量操作' }"
            >
              {{ batchMode ? $t('cloudSpace.exitBatch') : $t('cloudSpace.batchAction') }}
            </b-button>
            <FileTypeFilter />
            <HandleBtnGroup ref="handleBtnGroup" class="header-handle-group" />
          </div>
        </div>
      </div>
      <div v-if="bookmark.isMobile" class="mobile-folder-filter">
        <div class="mobile-folder-list">
          <div
            class="mobile-folder-item"
            :class="{ active: cloud.folder.id === 'all' }"
            @click="selectAllFolder"
            v-click-log="{ module: '云空间', operation: '查看全部文件' }"
            :title="$t('cloudSpace.allFile')"
          >
            {{ $t('cloudSpace.allFile') }}
          </div>
          <div
            v-for="folder in cloud.folderList"
            :key="folder.id"
            class="mobile-folder-item"
            :class="{ active: cloud.folder.id === folder.id }"
            :title="folder.name"
            @click="selectFolder(folder)"
            v-click-log="{ module: '云空间', operation: `查看文件夹【${folder.name}】` }"
          >
            {{ folder.name }}
          </div>
        </div>
      </div>
      <div class="content-area">
        <CloudFolder v-if="!bookmark.isMobile" @uploadFiles="onUploadFiles" />
        <FieldList
          :view-mode="viewMode"
          :batch-mode="batchMode"
          :clear-key="clearSelectionKey"
          @preview-file="previewFile"
          @move-field="moveField"
        />
      </div>
    </div>
    <MoveFile v-model:visible="moveCfg.moveFileVisible" :files="moveCfg.files" @moved="handleMoveDone" />

    <!-- 全屏文件预览 -->
    <FilePreview
      v-model:visible="previewVisible"
      :file-info="previewFileInfo"
      :show-next="cloud.fileList.length > 1"
      @prev="previewPrevFile"
      @next="previewNextFile"
      @close="closePreview"
    />
  </CommonContainer>
</template>

<script lang="ts" setup>
  import icon from '@/config/icon';
  import { computed, defineAsyncComponent, onMounted, onUnmounted, reactive, ref, watch } from 'vue';
  import { bookmarkStore, cloudSpaceStore, useUserStore } from '@/store';
  import HandleBtnGroup from '@/components/cloudSpace/HandleBtnGroup.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import CloudFolder from '@/components/cloudSpace/CloudFolder.vue';
  import FileTypeFilter from '@/components/cloudSpace/FileTypeFilter.vue';
  import MoveFile from '@/components/cloudSpace/MoveFile.vue';
  import { recordOperation } from '@/api/commonApi.ts';
  import { updatePreference } from '@/utils/savePreference';
  import { useRoute } from 'vue-router';
  import { useI18n } from 'vue-i18n';

  import FieldList from '@/components/cloudSpace/fieldList.vue';

  import BButton from '@/components/base/BasicComponents/BButton.vue';
  const FilePreview = defineAsyncComponent(() => import('@/components/FilePreview.vue'));

  const { t } = useI18n();
  const bookmark = bookmarkStore();
  const cloud = cloudSpaceStore();
  const user = useUserStore();
  const route = useRoute();

  const CLOUD_SPACE_VIEW_STORAGE_KEY = 'cloud-space-view-mode';

  const handleBtnGroup = ref();
  const batchMode = ref(false);
  // 视图优先取用户偏好(设置页「云空间视图」/ 跨设备),再回退本浏览器独立缓存,最后卡片——与标签详情/资源中心对齐。
  // user 偏好在 App.vue setup 阶段已从 localStorage 早恢复,本路由组件 setup 时已就绪。
  const viewMode = ref<'card' | 'table'>(
    (user.preferences.cloudView as 'card' | 'table') ||
      (localStorage.getItem(CLOUD_SPACE_VIEW_STORAGE_KEY) as 'card' | 'table') ||
      'card',
  );
  // 切换云空间视图:本地即时生效(下方 watch 写独立缓存)+ 记忆到偏好(登录用户同步后端、设置页可改)
  function setViewMode(mode: 'card' | 'table') {
    if (viewMode.value === mode) return;
    viewMode.value = mode;
    updatePreference({ cloudView: mode }).catch(() => {});
  }
  const cardViewIcon =
    '<svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 24 24"><g fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></g></svg>';
  const listViewIcon = icon.filterPanel.list;

  // 拖拽状态
  const dragActive = ref(false);

  function selectAllFolder() {
    cloud.folder = {
      name: '全部文件',
      id: 'all',
    };
    cloud.queryFieldList();
  }

  function selectFolder(folder) {
    cloud.folder = folder;
    cloud.queryFieldList();
  }

  function getRouteFileName() {
    const value = route.query.fileName;
    return Array.isArray(value) ? String(value[0] || '') : String(value || '');
  }

  function initializeCloudSpace(fileName = getRouteFileName()) {
    cloud.folder = {
      name: '全部文件',
      id: 'all',
    };
    cloud.searchFileName = fileName;
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

  // 拖拽事件处理
  function isExternalFileDrag(event) {
    const types = event?.dataTransfer?.types;
    if (!types) return false;
    return Array.from(types).includes('Files');
  }

  function onDragOver(event) {
    if (!isExternalFileDrag(event)) return;
    dragActive.value = true;
    event.dataTransfer.dropEffect = 'copy';
  }

  function onDragEnter(event) {
    if (!isExternalFileDrag(event)) return;
    dragActive.value = true;
  }

  function onDragLeave(event) {
    if (!isExternalFileDrag(event)) return;
    // 检查是否完全离开容器
    const relatedTarget = event.relatedTarget;
    if (!relatedTarget || !event.currentTarget.contains(relatedTarget)) {
      dragActive.value = false;
    }
  }

  function onDrop(event) {
    if (!isExternalFileDrag(event)) {
      dragActive.value = false;
      return;
    }
    dragActive.value = false;
    const files = Array.from(event.dataTransfer.files);
    if (files.length) {
      handleBtnGroup.value.uploadFiles(files, cloud.folder.id === 'all' ? null : cloud.folder.id);
    }
  }

  // 粘贴事件处理
  function onPaste(event) {
    const clipboardData = event.clipboardData || (window as any).clipboardData;
    const items = clipboardData.items;

    if (items) {
      const files = [];
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.kind === 'file') {
          // 处理所有类型的文件粘贴
          const file = item.getAsFile();
          if (file) {
            // 为截图等没有文件名的文件生成唯一名称
            if (!file.name || file.name === 'image.png') {
              const timestamp = Date.now();
              const extension = file.type.split('/')[1] || 'png';
              const uniqueName = `paste_${timestamp}.${extension}`;
              // 创建新的文件对象，保留原始文件的内容和类型
              const newFile = new File([file], uniqueName, { type: file.type });
              files.push(newFile);
            } else {
              files.push(file);
            }
          }
        }
      }

      if (files.length) {
        handleBtnGroup.value.uploadFiles(files, cloud.folder.id === 'all' ? null : cloud.folder.id);
      }
    }
  }

  interface FileItem {
    id: string;
    fileName: string;
    fileType: string;
    fileUrl?: string;
    size?: number;
    category?: string;
  }

  // 预览相关状态
  const previewVisible = ref(false);
  const previewFileInfo = reactive<FileItem>({
    id: '',
    fileName: '',
    fileType: '',
    fileUrl: '',
    category: 'other',
  });

  // 文件预览函数
  async function previewFile(file: FileItem) {
    if (!file || !file.fileType) return;

    // 设置文件信息
    Object.assign(previewFileInfo, file);
    previewVisible.value = true;
  }

  function previewNextFile() {
    const list = cloud.fileList || [];
    if (!list.length) return;
    const currentIndex = list.findIndex((item) => item.id === previewFileInfo.id);
    const nextIndex = currentIndex === -1 ? 0 : (currentIndex + 1) % list.length;
    Object.assign(previewFileInfo, list[nextIndex]);
    previewVisible.value = true;
  }

  function previewPrevFile() {
    const list = cloud.fileList || [];
    if (!list.length) return;
    const currentIndex = list.findIndex((item) => item.id === previewFileInfo.id);
    const prevIndex = currentIndex === -1 ? 0 : (currentIndex - 1 + list.length) % list.length;
    Object.assign(previewFileInfo, list[prevIndex]);
    previewVisible.value = true;
  }

  // 关闭预览
  function closePreview() {
    previewVisible.value = false;
  }

  function moveField(fileOrFiles: FileItem | FileItem[]) {
    const files = Array.isArray(fileOrFiles) ? fileOrFiles : [fileOrFiles];
    recordOperation({ module: '云空间', operation: `打开移动文件弹窗【${files.length}个】` });
    moveCfg.moveFileVisible = true;
    moveCfg.files = files;
  }

  function handleMoveDone() {
    clearSelectionKey.value += 1;
  }

  initializeCloudSpace();

  watch(viewMode, (val) => {
    localStorage.setItem(CLOUD_SPACE_VIEW_STORAGE_KEY, val);
  });

  watch(
    () => route.query.fileName,
    () => {
      if (!route.path.includes('/cloudSpace')) return;
      initializeCloudSpace();
    },
  );

  onMounted(() => {
    if (bookmark.isMobile) {
      cloud.queryFolder();
    }
    // 为window添加粘贴事件监听
    window.addEventListener('paste', onPaste);
  });

  onUnmounted(() => {
    // 移除window粘贴事件监听
    window.removeEventListener('paste', onPaste);
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
    position: relative;
  }

  .header {
    min-height: 40px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    flex-shrink: 0;

    .mobile-header {
      display: flex;
      flex-direction: column;
      gap: 8px;
      flex: 1;
      min-width: 0;
    }

    .mobile-tools {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 6px;
      min-width: 0;
      width: 100%;
    }

    .mobile-tools {
      display: flex;
      align-items: center;
      gap: 6px;
      flex-shrink: 0;
    }
  }

  .content-area {
    flex: 1;
    min-height: 0;
    overflow: hidden;
    display: flex;
    gap: 14px;
  }

  .file-type-chips {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    flex: 1 1 0;
    min-width: 200px;
  }

  .header-pc {
    display: flex;
    align-items: center;
    width: 100%;
    gap: 10px;
  }

  .header-toolbar {
    display: flex;
    align-items: center;
    gap: 10px;
    flex: 1;
    min-width: 0;
  }

  .header-spacer {
    width: 240px;
    flex-shrink: 0;
  }

  .header-handle-group {
    margin-left: auto;
  }

  .view-toggle {
    display: flex;
    gap: 4px;
    background: var(--bl-input-noBorder-bg-color);
    border-radius: 8px;
    padding: 3px;
  }

  .view-toggle-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 30px;
    height: 26px;
    border: 0;
    border-radius: 6px;
    cursor: pointer;
    color: var(--desc-color);
    background: transparent;
    transition: all 0.18s ease;
    &.active {
      background: var(--background-color);
      color: var(--text-color);
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
    }
    &:hover:not(.active) {
      color: var(--text-color);
    }
  }

  .mobile-folder-filter {
    margin-top: 4px;
  }

  .mobile-folder-list {
    display: flex;
    align-items: center;
    gap: 8px;
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
    padding: 0 0 6px;
  }

  .mobile-folder-item {
    max-width: 140px;
    min-width: fit-content;
    padding: 4px 12px;
    border-radius: 999px;
    border: 1px solid var(--folder-list-border-color);
    background: var(--card-bg-color);
    color: var(--text-color);
    font-size: 12px;
    line-height: 20px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .mobile-folder-item.active {
    border-color: var(--primary-color);
    background: var(--category-item-ba-color);
    color: var(--primary-color);
  }

  // 拖拽样式
  .drag-overlay {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(255, 255, 255, 0.8);
    border: 2px dashed #667eea;
    border-radius: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
    backdrop-filter: blur(5px);
    transition: all 0.3s ease;
  }

  .drag-content {
    text-align: center;
    color: #667eea;
    font-size: 20px;
    font-weight: 500;
  }

  .drag-content p {
    margin-top: 16px;
  }

  @media (max-width: 1000px) {
    .cloud-container {
      padding: unset;
    }
    .header {
      height: auto;
      min-height: 40px;
      display: flex;
      justify-content: space-between;
      align-items: stretch;
      gap: 10px;

      .batch-toggle-btn {
        white-space: nowrap;
      }
    }

    .mobile-tools {
      .mobile-view-toggle {
        margin-left: 0;
      }

      :deep(.filter-container) {
        margin-left: 0;
        flex: 1;
        min-width: 0;
      }
    }

    .mobile-upload-actions {
      flex-shrink: 0;
    }

    .mobile-folder-filter {
      margin-top: 0;
      margin-bottom: 6px;
    }

    .mobile-folder-list {
      gap: 6px;
      padding-bottom: 4px;
    }

    .mobile-folder-item {
      font-size: 12px;
      padding: 4px 10px;
      max-width: 120px;
    }

    .content-area {
      flex: 1;
      min-height: 0;
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
