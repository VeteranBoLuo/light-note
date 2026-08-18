<template>
  <ResourcePageShell
    :title="$t('cloudSpace.title')"
    :subtitle="$t('cloudSpace.subtitle')"
    accent="file"
    layout="workspace"
    compact-mobile-heading
    :title-actionable="!bookmark.isMobile"
    @title-click="resetCloudSpace"
  >
    <template #meta>
      <span class="cloud-count-chip">{{ $t('cloudSpace.fileCount', { count: cloud.fileTotal }) }}</span>
    </template>

    <template #actions>
      <CloudStorageBar v-if="bookmark.isMobile" ref="mobileCloudStorageBar" compact class="mobile-cloud-storage" />
      <BTooltip
        v-if="!bookmark.isMobile"
        class="cloud-sort-tooltip"
        :title="`${$t('cloudSpace.sort')}：${cloudSortLabel}`"
      >
        <div class="cloud-sort-control">
          <SvgIcon class="cloud-sort-icon" :src="icon.cloudSpace.sort" size="16" aria-hidden="true" />
          <BSelect
            class="cloud-sort-select"
            :value="cloudSortValue"
            :options="cloudSortOptions"
            :aria-label="$t('cloudSpace.sort')"
            @change="changeCloudSort"
          />
        </div>
      </BTooltip>
      <div class="cloud-view-toggle" :aria-label="$t('cloudSpace.viewMode')">
        <BTooltip :title="$t('note.cardView')">
          <BButton class="cloud-view-button" :class="{ active: viewMode === 'card' }" @click="setViewMode('card')">
            <SvgIcon :src="icon.navigation.portal" size="15" />
            <span class="cloud-view-label">{{ $t('note.cardView') }}</span>
          </BButton>
        </BTooltip>
        <BTooltip :title="$t('note.listView')">
          <BButton class="cloud-view-button" :class="{ active: viewMode === 'table' }" @click="setViewMode('table')">
            <SvgIcon :src="icon.filterPanel.list" size="15" />
            <span class="cloud-view-label">{{ $t('note.listView') }}</span>
          </BButton>
        </BTooltip>
      </div>
      <BButton
        v-if="!bookmark.isMobile"
        class="batch-toggle-btn"
        :class="{ active: batchMode }"
        @click="toggleBatchMode"
        v-click-log="{ module: '云空间', operation: batchMode ? '退出批量操作' : '开启批量操作' }"
      >
        {{ batchMode ? $t('cloudSpace.exitBatch') : $t('cloudSpace.batchAction') }}
      </BButton>
      <FileTypeFilter class="cloud-type-filter" />
      <div v-if="!bookmark.isMobile" class="cloud-search-action">
        <BInput
          v-model:value="cloud.searchFileName"
          :placeholder="$t('cloudSpace.searchFile')"
          clearable
          @input="onCloudSearchInput"
          @enter="cloud.queryFieldList()"
        >
          <template #prefix>
            <SvgIcon :src="icon.navigation.search" size="16" />
          </template>
        </BInput>
      </div>
      <HandleBtnGroup
        v-show="!bookmark.isMobile"
        ref="handleBtnGroup"
        class="header-handle-group"
        @storage-quota="openMobileStorageDetails"
      />
    </template>

    <div
      ref="cloudContainerRef"
      class="cloud-container"
      @dragover.prevent="onDragOver"
      @dragenter.prevent="onDragEnter"
      @dragleave.prevent="onDragLeave"
      @drop.prevent="onDrop"
    >
      <!-- 拖拽提示层 -->
      <div v-if="dragActive" class="drag-overlay">
        <div class="drag-content">
          <svg-icon :src="icon.file_upload" size="64" color="var(--primary-color)" />
          <p>{{ $t('cloudSpace.dropFiles') }}</p>
        </div>
      </div>

      <div v-if="showInboxFileOrganizer" class="inbox-file-organizer">
        <span>{{ t('inbox.completeFileHint') }}</span>
        <BButton type="primary" size="small" :loading="completingInbox" @click="completeOrganizingFile">
          {{ t('inbox.complete') }}
        </BButton>
      </div>
      <!-- 移动端不放第二个文本搜索框：找文件统一走顶栏全局搜索，这里只保留文件夹与类型筛选 -->
      <div v-if="bookmark.isMobile" class="mobile-folder-filter">
        <div ref="mobileFolderListRef" class="mobile-folder-list">
          <div
            class="mobile-folder-item"
            :class="{ active: cloud.folder.id === 'all' }"
            data-folder-id="all"
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
            :data-folder-id="folder.id"
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
          @files-deleted="handleFilesDeleted"
          @exit-batch="toggleBatchMode"
          @request-upload="openCurrentFolderUpload"
        />
      </div>
    </div>
    <MoveFile v-model:visible="moveCfg.moveFileVisible" :files="moveCfg.files" @moved="handleMoveDone" />

    <!-- 全屏文件预览 -->
    <FilePreview
      v-if="previewVisible"
      v-model:visible="previewVisible"
      :file-info="previewFileInfo"
      :show-next="cloud.fileTotal > 1"
      @prev="previewPrevFile"
      @next="previewNextFile"
      @close="closePreview"
    />
    <MobileCloudSpaceActionsDrawer
      v-if="bookmark.isMobile"
      v-model:open="mobilePageActionsOpen"
      :batch-mode="batchMode"
      :creating="mobileFolderCreating"
      :folders="cloud.folderList"
      :current-folder-id="String(cloud.folder.id || '')"
      :folder-mutation-id="mobileFolderMutationId"
      :sort-value="cloudSortValue"
      :sort-options="cloudSortOptions"
      :before-open-create-folder="allowMobileFolderCreate"
      :before-manage-folders="allowMobileFolderCreate"
      @batch="toggleBatchMode"
      @sort="changeCloudSort"
      @create-folder="createMobileFolder"
      @rename-folder="renameMobileFolder"
      @delete-folder="requestMobileFolderDelete"
    />
  </ResourcePageShell>
</template>

<script lang="ts" setup>
  import icon from '@/config/icon';
  import { computed, defineAsyncComponent, nextTick, onMounted, onUnmounted, reactive, ref, watch } from 'vue';
  import { scrollChipIntoCenter } from '@/utils/horizontalChipScroll';
  import { bookmarkStore, cloudSpaceStore, useUserStore } from '@/store';
  import HandleBtnGroup from '@/components/cloudSpace/HandleBtnGroup.vue';
  import CloudStorageBar from '@/components/cloudSpace/CloudStorageBar.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import CloudFolder from '@/components/cloudSpace/CloudFolder.vue';
  import FileTypeFilter from '@/components/cloudSpace/FileTypeFilter.vue';
  import MoveFile from '@/components/cloudSpace/MoveFile.vue';
  import { recordOperation } from '@/api/commonApi.ts';
  import { updatePreference } from '@/utils/savePreference';
  import { useRoute, useRouter } from 'vue-router';
  import { useI18n } from 'vue-i18n';

  import FieldList from '@/components/cloudSpace/fieldList.vue';

  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BInput from '@/components/base/BasicComponents/BInput.vue';
  import BSelect from '@/components/base/BasicComponents/BSelect.vue';
  import BTooltip from '@/components/base/BasicComponents/BTooltip.vue';
  import ResourcePageShell from '@/components/base/ResourcePageShell.vue';
  import message from '@/components/base/BasicComponents/BMessage/BMessage';
  import { useInboxOrganizer } from '@/composables/useInboxOrganizer';
  import { CLOUD_FILE_CATEGORY_ORDER } from '@/constants/cloudFileCategory.ts';
  import { apiBasePost } from '@/http/request';
  import { useMobileTopBar } from '@/composables/useMobileTopBar';
  import MobileCloudSpaceActionsDrawer from '@/components/cloudSpace/MobileCloudSpaceActionsDrawer.vue';
  import { blockGuestWrite } from '@/composables/useGuestGuard';
  import Alert from '@/components/base/BasicComponents/BModal/Alert.ts';
  import { closeCurrentMobileOverlayThen } from '@/utils/mobileOverlayHistory';
  import FilePreviewLoadingState from '@/components/cloudSpace/FilePreviewLoadingState.vue';
  import type { CloudFileSort, CloudFileSortField, CloudFileSortOrder } from '@/store/cloudSpace';
  const FilePreview = defineAsyncComponent({
    loader: () => import('@/components/FilePreview.vue'),
    loadingComponent: FilePreviewLoadingState,
    delay: 0,
    suspensible: false,
  });

  const { t } = useI18n();
  const bookmark = bookmarkStore();
  const cloud = cloudSpaceStore();
  const user = useUserStore();
  const route = useRoute();
  const router = useRouter();
  const { isOrganizingFromInbox, completingInbox, completeInboxResource } = useInboxOrganizer();
  const deletedOrganizingFileId = ref('');
  const organizingFileId = computed(() => {
    const value = route.query.fileId;
    return Array.isArray(value) ? String(value[0] || '') : String(value || '');
  });
  const showInboxFileOrganizer = computed(
    () =>
      isOrganizingFromInbox.value &&
      Boolean(organizingFileId.value) &&
      deletedOrganizingFileId.value !== organizingFileId.value,
  );

  function queryValue(value: unknown) {
    return Array.isArray(value) ? String(value[0] || '') : String(value || '');
  }

  function getRouteFileId() {
    return queryValue(route.query.fileId);
  }

  function getRouteFolderId() {
    return queryValue(route.query.folderId);
  }

  function routeQueryWith(key: 'fileId' | 'folderId', value = '') {
    const query = { ...route.query };
    if (value) query[key] = value;
    else delete query[key];
    return query;
  }

  function syncFileRoute(fileId = '') {
    if (getRouteFileId() === fileId) return Promise.resolve();
    return router.replace({ path: '/cloudSpace', query: routeQueryWith('fileId', fileId) });
  }

  function syncFolderRoute(folderId = '') {
    if (getRouteFolderId() === folderId) return;
    void router.replace({ path: '/cloudSpace', query: routeQueryWith('folderId', folderId) });
  }

  function handleFilesDeleted(fileIds: string[]) {
    const currentId = organizingFileId.value;
    if (!currentId || !fileIds.map(String).includes(currentId)) return;

    // 后端删除事务已同步清理待整理关系；先在本地隐藏入口，再清理只属于该目标的路由上下文。
    deletedOrganizingFileId.value = currentId;
    const query = { ...route.query };
    delete query.fileId;
    delete query.fileName;
    delete query.organize;
    delete query.from;
    void router.replace({ path: '/cloudSpace', query });
  }

  async function completeOrganizingFile() {
    if (!organizingFileId.value) return;
    const completed = await completeInboxResource('file', organizingFileId.value);
    if (!completed) {
      message.warning(t('inbox.completeFailed'));
      return;
    }
    message.success(t('inbox.completedSuccess'));
    router.push('/inbox');
  }

  const CLOUD_SPACE_VIEW_STORAGE_KEY = 'cloud-space-view-mode';

  interface HandleBtnGroupExposed {
    uploadFiles: (files: any[], folderId?: string | null) => Promise<void>;
    openFileDialog: (folderId?: string | null) => void;
  }

  interface MobileFolderItem {
    id: string;
    name: string;
  }

  const handleBtnGroup = ref<HandleBtnGroupExposed | null>(null);
  const mobileCloudStorageBar = ref<{ openDetails: (shortfallMb?: number) => void } | null>(null);
  const batchMode = ref(false);
  const mobilePageActionsOpen = ref(false);
  const cloudContainerRef = ref<HTMLElement | null>(null);
  const mobileFolderCreating = ref(false);
  const mobileFolderMutationId = ref('');

  function openMobileStorageDetails(shortfallMb: number) {
    mobileCloudStorageBar.value?.openDetails(shortfallMb);
  }
  // 视图优先取用户偏好(设置页「云空间视图」/ 跨设备),再回退本浏览器独立缓存,最后卡片——与标签详情/资源中心对齐。
  // user 偏好在 App.vue setup 阶段已从 localStorage 早恢复,本路由组件 setup 时已就绪。
  const viewMode = ref<'card' | 'table'>(
    (user.preferences.cloudView as 'card' | 'table') ||
      (localStorage.getItem(CLOUD_SPACE_VIEW_STORAGE_KEY) as 'card' | 'table') ||
      'card',
  );
  const cloudSortOptions = computed(() => [
    { value: 'createTime:desc', label: t('cloudSpace.sortLatest') },
    { value: 'createTime:asc', label: t('cloudSpace.sortEarliest') },
    { value: 'fileName:asc', label: t('cloudSpace.sortNameAsc') },
    { value: 'fileName:desc', label: t('cloudSpace.sortNameDesc') },
    { value: 'fileSize:desc', label: t('cloudSpace.sortSizeDesc') },
    { value: 'fileSize:asc', label: t('cloudSpace.sortSizeAsc') },
  ]);
  const cloudSortValue = computed(() => `${cloud.fileSort.field}:${cloud.fileSort.order}`);
  const cloudSortLabel = computed(
    () =>
      cloudSortOptions.value.find((option) => option.value === cloudSortValue.value)?.label ||
      t('cloudSpace.sortLatest'),
  );

  async function changeCloudSort(value: string | number) {
    const [field, order] = String(value).split(':') as [CloudFileSortField, CloudFileSortOrder];
    if (!['createTime', 'fileName', 'fileSize'].includes(field) || !['asc', 'desc'].includes(order)) return;
    await cloud.setFileSortValue({ field, order } as CloudFileSort);
    await nextTick();
    const scrollElement = cloudContainerRef.value?.querySelector<HTMLElement>('[data-mobile-resource-scroll]');
    if (scrollElement) scrollElement.scrollTop = 0;
  }
  // 切换云空间视图:本地即时生效(下方 watch 写独立缓存)+ 记忆到偏好(登录用户同步后端、设置页可改)
  function setViewMode(mode: 'card' | 'table') {
    if (viewMode.value === mode) return;
    viewMode.value = mode;
    updatePreference({ cloudView: mode }).catch(() => {});
  }
  let cloudSearchTimer = 0;
  let suppressRouteFileNameWatch = false;
  let suppressFolderRouteWatch = Boolean(getRouteFolderId());
  let folderListLoaded = cloud.folderList.length > 0;
  let unavailableFolderId = '';
  function onCloudSearchInput() {
    window.clearTimeout(cloudSearchTimer);
    cloudSearchTimer = window.setTimeout(() => cloud.queryFieldList(), 220);
  }

  const cloudIdentityKey = computed(() =>
    [
      user.id || '',
      user.role || '',
      user.visitorWorkspace ? 'visitor-workspace' : '',
      user.adminContext?.subjectUserId || '',
      user.adminContext?.mode || '',
    ].join('|'),
  );

  useMobileTopBar(['cloudSpace'], {
    searchSourceType: 'file',
    onAuxiliaryAction: () => {
      if (batchMode.value) {
        toggleBatchMode();
        return;
      }
      mobilePageActionsOpen.value = true;
    },
    auxiliaryActionLabel: () => t(batchMode.value ? 'cloudSpace.exitBatch' : 'common.more'),
    auxiliaryActionIcon: () => (batchMode.value ? icon.common.close : icon.common.more),
    onAdd: () => openCurrentFolderUpload(),
    addLabel: () => t('cloudSpace.uploadFile'),
  });

  // 拖拽状态
  const dragActive = ref(false);

  const mobileFolderListRef = ref<HTMLElement | null>(null);

  function selectAllFolder() {
    cloud.folder = {
      name: t('cloudSpace.allFile'),
      id: 'all',
    };
    cloud.queryFieldList();
  }

  function selectFolder(folder) {
    cloud.folder = folder;
    cloud.queryFieldList();
  }

  // 移动端目录条:当前目录变化后把选中项滚入视野。
  // 用 watch 而非点击事件,因为切目录会重新拉取列表导致重渲染,直接在点击里滚动会被打断;
  // 同时覆盖「全部文件」和从其他入口(路由/上传后)切换目录的情况。
  watch(
    () => [cloud.folder.id, cloud.folderList.length, bookmark.isMobile],
    () => {
      if (!bookmark.isMobile) return;
      nextTick(() => {
        const container = mobileFolderListRef.value;
        const active = container?.querySelector<HTMLElement>(
          `[data-folder-id="${CSS.escape(String(cloud.folder.id ?? 'all'))}"]`,
        );
        scrollChipIntoCenter(container, active);
      });
    },
    { immediate: true },
  );

  function getRouteFileName() {
    const value = route.query.fileName;
    return Array.isArray(value) ? String(value[0] || '') : String(value || '');
  }

  async function applyFolderFromRoute() {
    const folderId = getRouteFolderId();
    if (folderId && !folderListLoaded) return;
    const targetFolder = folderId ? cloud.folderList.find((folder) => String(folder.id) === folderId) : null;
    if (folderId && !targetFolder) {
      syncFolderRoute('');
      if (unavailableFolderId !== folderId) {
        unavailableFolderId = folderId;
        message.warning(t('cloudSpace.folderUnavailable'));
      }
    } else {
      unavailableFolderId = '';
    }
    const targetFolderId = targetFolder ? String(targetFolder.id) : 'all';
    if (String(cloud.folder?.id || 'all') === targetFolderId) {
      suppressFolderRouteWatch = false;
      return;
    }
    suppressFolderRouteWatch = true;
    cloud.folder = targetFolder
      ? { name: targetFolder.name, id: String(targetFolder.id) }
      : { name: t('cloudSpace.allFile'), id: 'all' };
    cloud.queryFieldList();
    await nextTick();
    suppressFolderRouteWatch = false;
  }

  function initializeCloudSpace(fileName = getRouteFileName()) {
    suppressFolderRouteWatch = Boolean(getRouteFolderId());
    cloud.folder = {
      name: t('cloudSpace.allFile'),
      id: 'all',
    };
    cloud.searchFileName = fileName;
    cloud.queryFieldList();
    clearSelectionKey.value += 1;
    batchMode.value = false;
    if (getRouteFolderId()) {
      void applyFolderFromRoute();
    } else {
      void nextTick(() => {
        suppressFolderRouteWatch = false;
      });
    }
  }

  async function resetCloudSpace() {
    window.clearTimeout(cloudSearchTimer);
    suppressRouteFileNameWatch = true;
    suppressFolderRouteWatch = true;
    try {
      if (route.path !== '/cloudSpace' || Object.keys(route.query).length) {
        await router.replace({ path: '/cloudSpace', query: {} });
      }
    } finally {
      suppressRouteFileNameWatch = false;
    }

    cloud.folder = {
      name: t('cloudSpace.allFile'),
      id: 'all',
    };
    cloud.searchFileName = '';
    clearSelectionKey.value += 1;
    batchMode.value = false;

    const allTypes = [...CLOUD_FILE_CATEGORY_ORDER];
    const alreadyShowingAllTypes =
      cloud.typeCheckValue.length === allTypes.length && allTypes.every((type) => cloud.typeCheckValue.includes(type));
    if (alreadyShowingAllTypes) {
      cloud.queryFieldList();
    } else {
      cloud.typeCheckValue = allTypes;
    }
    await nextTick();
    suppressFolderRouteWatch = false;
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

  function allowMobileFolderCreate() {
    return !blockGuestWrite('manage-folder');
  }

  async function createMobileFolder(name: string) {
    if (blockGuestWrite('manage-folder') || mobileFolderCreating.value) return;
    mobileFolderCreating.value = true;
    try {
      const res = await apiBasePost('/api/file/addFolder', { name }, { silent: true });
      if (res?.status !== 200 || res.data === undefined || res.data === null) {
        message.error(t('cloudSpace.createFolderFailed'));
        return;
      }

      const folderId = String(res.data);
      const createdFolder = { id: folderId, name };
      cloud.folderList = [createdFolder, ...cloud.folderList.filter((folder) => String(folder.id) !== folderId)];
      cloud.folder = createdFolder;
      clearSelectionKey.value += 1;
      mobilePageActionsOpen.value = false;
      recordOperation({ module: '云空间', operation: `新增文件夹成功【${name}】` });
      message.success(t('cloudSpace.createFolderSuccess', { name }));

      const folderRefreshed = await cloud.queryFolder();
      if (folderRefreshed) {
        const refreshedFolder = cloud.folderList.find((folder) => String(folder.id) === folderId);
        if (refreshedFolder?.id) {
          cloud.folder = { id: refreshedFolder.id, name: refreshedFolder.name };
        }
      }
      await cloud.queryFieldList();
    } catch {
      message.error(t('cloudSpace.createFolderFailed'));
    } finally {
      mobileFolderCreating.value = false;
    }
  }

  async function renameMobileFolder(folder: MobileFolderItem, done: (success: boolean) => void) {
    if (blockGuestWrite('manage-folder') || mobileFolderMutationId.value) {
      done(false);
      return;
    }
    mobileFolderMutationId.value = folder.id;
    let success = false;
    try {
      const res = await apiBasePost('/api/file/updateFolder', folder, { silent: true });
      if (res?.status !== 200) {
        message.error(t('cloudSpace.renameFolderFailed'));
        return;
      }

      cloud.folderList = cloud.folderList.map((item) =>
        String(item.id) === folder.id ? { ...item, name: folder.name } : item,
      );
      if (String(cloud.folder.id) === folder.id) {
        cloud.folder = { id: cloud.folder.id, name: folder.name };
      }
      recordOperation({ module: '云空间', operation: `重命名文件夹成功【${folder.name}】` });
      message.success(t('cloudSpace.renameFolderSuccess', { name: folder.name }));
      success = true;
      await cloud.queryFolder();
      void cloud.queryFieldList();
    } catch {
      message.error(t('cloudSpace.renameFolderFailed'));
    } finally {
      mobileFolderMutationId.value = '';
      done(success);
    }
  }

  function requestMobileFolderDelete(folder: MobileFolderItem) {
    if (blockGuestWrite('delete-folder')) {
      mobilePageActionsOpen.value = false;
      return;
    }
    void closeCurrentMobileOverlayThen(
      () => {
        mobilePageActionsOpen.value = false;
      },
      () => {
        Alert.alert({
          title: t('cloudSpace.deleteFolderTitle'),
          content: t('cloudSpace.deleteFolderConfirm', { name: folder.name }),
          okText: t('common.delete'),
          okType: 'danger',
          cancelText: t('common.cancel'),
          onOk: () => void deleteMobileFolder(folder),
        });
      },
    );
  }

  async function deleteMobileFolder(folder: MobileFolderItem) {
    if (mobileFolderMutationId.value) return;
    mobileFolderMutationId.value = folder.id;
    try {
      const res = await apiBasePost('/api/file/deleteFolder', { id: folder.id }, { silent: true });
      if (res?.status !== 200) {
        message.error(t('cloudSpace.deleteFolderFailed'));
        return;
      }

      const deletingCurrentFolder = String(cloud.folder.id) === folder.id;
      cloud.folderList = cloud.folderList.filter((item) => String(item.id) !== folder.id);
      if (deletingCurrentFolder) {
        cloud.folder = { id: 'all', name: t('cloudSpace.allFile') };
      }
      recordOperation({ module: '云空间', operation: `删除文件夹成功【${folder.name}】` });
      message.success(t('cloudSpace.deleteFolderSuccess', { name: folder.name }));
      await Promise.all([cloud.queryFolder(), cloud.queryFieldList()]);
    } catch {
      message.error(t('cloudSpace.deleteFolderFailed'));
    } finally {
      mobileFolderMutationId.value = '';
    }
  }

  const onUploadFiles = ({ files, folderId }) => {
    handleBtnGroup.value?.uploadFiles(files, folderId);
  };

  function openCurrentFolderUpload() {
    const folderId = cloud.folder.id === 'all' ? null : String(cloud.folder.id);
    handleBtnGroup.value?.openFileDialog(folderId);
  }

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
      handleBtnGroup.value?.uploadFiles(files, cloud.folder.id === 'all' ? null : cloud.folder.id);
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
        handleBtnGroup.value?.uploadFiles(files, cloud.folder.id === 'all' ? null : cloud.folder.id);
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
  let pendingLocalPreviewId = '';
  let previewRequestId = 0;
  let unavailableFileId = '';

  function normalizeFileInfo(file: any): FileItem {
    return {
      ...file,
      id: String(file?.id || ''),
      fileName: file?.fileName || file?.file_name || '',
      fileType: file?.fileType || file?.file_type || '',
      fileUrl: file?.fileUrl || file?.file_url || '',
      size: file?.size ?? file?.fileSize ?? file?.file_size,
      category: file?.category || 'other',
    };
  }

  async function openRouteFile(fileId = getRouteFileId()) {
    if (!fileId || isOrganizingFromInbox.value || pendingLocalPreviewId === fileId) return;
    const requestId = ++previewRequestId;
    let res;
    try {
      res = await apiBasePost('/api/file/getFileInfo', { id: fileId }, { silent: true });
    } catch {
      res = null;
    }
    if (requestId !== previewRequestId || getRouteFileId() !== fileId) return;
    if (res?.status !== 200 || !res.data) {
      previewVisible.value = false;
      if (unavailableFileId !== fileId) {
        unavailableFileId = fileId;
        message.warning(t('cloudSpace.fileUnavailable'));
      }
      await syncFileRoute('');
      return;
    }
    unavailableFileId = '';
    Object.assign(previewFileInfo, normalizeFileInfo(res.data));
    previewVisible.value = true;
  }

  // 文件预览函数
  async function previewFile(file: FileItem) {
    if (!file || !file.fileType) return;
    const normalized = normalizeFileInfo(file);
    pendingLocalPreviewId = normalized.id;
    Object.assign(previewFileInfo, normalized);
    previewVisible.value = true;
    try {
      await syncFileRoute(normalized.id);
    } finally {
      if (pendingLocalPreviewId === normalized.id) pendingLocalPreviewId = '';
    }
  }

  async function previewNextFile() {
    let list = cloud.fileList || [];
    if (!list.length) return;
    let currentIndex = list.findIndex((item) => String(item.id) === String(previewFileInfo.id));
    if (currentIndex === list.length - 1 && cloud.fileHasMore) {
      const loaded = await cloud.loadMoreFiles();
      if (!loaded) return;
      list = cloud.fileList || [];
      currentIndex = list.findIndex((item) => String(item.id) === String(previewFileInfo.id));
    }
    const nextIndex = currentIndex === -1 ? 0 : (currentIndex + 1) % list.length;
    const target = normalizeFileInfo(list[nextIndex]);
    pendingLocalPreviewId = target.id;
    Object.assign(previewFileInfo, target);
    previewVisible.value = true;
    try {
      await syncFileRoute(target.id);
    } finally {
      if (pendingLocalPreviewId === target.id) pendingLocalPreviewId = '';
    }
  }

  async function previewPrevFile() {
    const list = cloud.fileList || [];
    if (!list.length) return;
    const currentIndex = list.findIndex((item) => String(item.id) === String(previewFileInfo.id));
    if (currentIndex === 0 && cloud.fileHasMore) return;
    const prevIndex = currentIndex === -1 ? 0 : (currentIndex - 1 + list.length) % list.length;
    const target = normalizeFileInfo(list[prevIndex]);
    pendingLocalPreviewId = target.id;
    Object.assign(previewFileInfo, target);
    previewVisible.value = true;
    try {
      await syncFileRoute(target.id);
    } finally {
      if (pendingLocalPreviewId === target.id) pendingLocalPreviewId = '';
    }
  }

  // 关闭预览
  async function closePreview() {
    previewVisible.value = false;
    previewRequestId += 1;
    if (!isOrganizingFromInbox.value) await syncFileRoute('');
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

  watch(cloudIdentityKey, () => {
    folderListLoaded = false;
    unavailableFolderId = '';
    unavailableFileId = '';
    initializeCloudSpace();
    void cloud.queryFolder();
  });

  watch(viewMode, (val) => {
    localStorage.setItem(CLOUD_SPACE_VIEW_STORAGE_KEY, val);
  });

  watch(
    () => route.query.fileName,
    () => {
      if (suppressRouteFileNameWatch) return;
      if (!route.path.includes('/cloudSpace')) return;
      initializeCloudSpace();
    },
  );

  watch(
    () => [route.query.fileId, route.query.organize],
    ([rawFileId, organize]) => {
      const nextFileId = queryValue(rawFileId);
      if (queryValue(organize) !== 'inbox' || !nextFileId || nextFileId !== deletedOrganizingFileId.value) {
        deletedOrganizingFileId.value = '';
      }
      const fileId = getRouteFileId();
      if (!fileId || isOrganizingFromInbox.value) {
        if (!fileId) unavailableFileId = '';
        previewRequestId += 1;
        previewVisible.value = false;
        return;
      }
      void openRouteFile(fileId);
    },
    { immediate: true },
  );

  watch(
    () => route.query.folderId,
    () => void applyFolderFromRoute(),
  );

  watch(
    () => cloud.folderList,
    (folders, previousFolders) => {
      if (folders.length || previousFolders !== undefined) folderListLoaded = true;
      if (getRouteFolderId()) void applyFolderFromRoute();
    },
    { immediate: true },
  );

  watch(
    () => cloud.folder?.id,
    (folderId) => {
      if (suppressFolderRouteWatch) return;
      syncFolderRoute(folderId && folderId !== 'all' ? String(folderId) : '');
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
    window.clearTimeout(cloudSearchTimer);
  });
</script>

<style lang="less" scoped>
  .cloud-count-chip {
    height: 22px;
    padding: 0 8px;
    border-radius: 999px;
    display: inline-flex;
    align-items: center;
    color: var(--resource-file-color, #ff8a00);
    background: color-mix(in srgb, var(--resource-file-color, #ff8a00) 10%, transparent);
    font-size: 11px;
    font-weight: 650;
    font-variant-numeric: tabular-nums;
  }

  .cloud-view-toggle {
    display: flex;
    gap: 3px;
    padding: 3px;
    border-radius: 10px;
    background: var(--bl-input-noBorder-bg-color);
  }

  .cloud-sort-control {
    position: relative;
    height: 36px;
    width: 142px;
    min-width: 142px;
    display: flex;
    align-items: center;
    gap: 7px;
    padding-left: 10px;
    border: 1px solid var(--card-border-color);
    border-radius: 10px;
    color: var(--resource-file-color, #ff8a00);
    background: var(--menu-body-bg-color);
  }

  .cloud-sort-select {
    width: 110px;
    min-width: 0;
    color: var(--text-color);
  }

  .cloud-sort-select :deep(.select-trigger) {
    height: 34px;
    border: 0;
    background: transparent;
  }

  @media (max-width: 1550px) and (min-width: 768px) {
    .cloud-sort-tooltip {
      flex: 0 0 48px;
    }

    .cloud-sort-control {
      width: 48px;
      min-width: 48px;
      justify-content: center;
      gap: 2px;
      padding-left: 0;
    }

    .cloud-sort-icon {
      pointer-events: none;
    }

    .cloud-sort-select {
      position: absolute;
      inset: 0;
      width: 100%;
    }

    .cloud-sort-select :deep(.select-trigger) {
      width: 100%;
      padding: 0;
      background: transparent;
    }

    .cloud-sort-select :deep(.select-text) {
      display: none;
    }

    .cloud-sort-select :deep(.select-suffix) {
      display: none;
    }
  }

  .cloud-view-button {
    width: 30px;
    min-width: 30px;
    height: 30px;
    padding: 0;
    border-radius: 8px;
    color: var(--desc-color);
    background: transparent;
  }

  .cloud-view-label {
    display: none;
  }

  .cloud-view-button.active {
    color: var(--resource-file-color, #ff8a00);
    background: var(--menu-body-bg-color);
    box-shadow: 0 2px 7px rgba(15, 23, 42, 0.08);
  }

  .batch-toggle-btn {
    height: 36px;
    border-radius: 10px;
  }

  .batch-toggle-btn.active {
    color: var(--resource-file-color, #ff8a00);
    background: color-mix(in srgb, var(--resource-file-color, #ff8a00) 9%, var(--menu-body-bg-color));
  }

  .cloud-search-action {
    width: 220px;
  }

  .cloud-search-action :deep(.b-input) {
    height: 36px;
    border-radius: 10px;
  }

  .inbox-file-organizer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    margin: 0 0 10px;
    padding: 9px 12px;
    border: 1px solid color-mix(in srgb, var(--primary-color) 18%, var(--card-border-color));
    border-radius: 8px;
    color: var(--desc-color);
    background: color-mix(in srgb, var(--primary-color) 8%, var(--background-color));
    font-size: 13px;
  }
  .cloud-container {
    padding: 0;
    width: 100%;
    height: 100%;
    box-sizing: border-box;
    display: flex;
    gap: 9px;
    flex-direction: column;
    position: relative;
  }

  .content-area {
    flex: 1;
    min-height: 0;
    overflow: hidden;
    display: flex;
    gap: 14px;
  }

  .header-handle-group {
    flex: 0 0 auto;
  }

  .mobile-folder-filter {
    margin-top: 4px;
  }

  .mobile-cloud-storage {
    display: flex;
    min-width: 84px;
    flex: 1 1 auto;

    :deep(.storage-usage) {
      width: 100%;
      min-width: 0;
    }
  }

  .mobile-folder-list {
    /* 作为 offsetParent,供选中项自动滚动按 offsetLeft 计算 */
    position: relative;
    display: flex;
    align-items: center;
    gap: 8px;
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
    padding: 0 24px 6px 0;
    box-shadow: inset -20px 0 16px -18px color-mix(in srgb, var(--text-color) 46%, transparent);
  }

  .mobile-folder-item {
    max-width: 140px;
    min-width: fit-content;
    min-height: 32px;
    padding: 5px 10px;
    box-sizing: border-box;
    border-radius: 9px;
    border: 1px solid color-mix(in srgb, var(--card-border-color) 78%, transparent);
    background: var(--menu-body-bg-color);
    color: var(--text-color);
    font-size: 12px;
    line-height: 20px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .mobile-folder-item.active {
    border-color: color-mix(in srgb, var(--resource-file-color, #ff8a00) 42%, var(--card-border-color));
    background: color-mix(in srgb, var(--resource-file-color, #ff8a00) 9%, var(--menu-body-bg-color));
    color: var(--resource-file-color, #ff8a00);
  }

  .content-area :deep(.folder-list) {
    width: 230px;
    padding: 12px;
    box-sizing: border-box;
    border: 1px solid color-mix(in srgb, var(--card-border-color) 72%, transparent);
    border-radius: 14px;
    background: var(--workspace-panel-bg-color, var(--menu-body-bg-color));
    box-shadow: 0 12px 30px -28px color-mix(in srgb, var(--text-color) 38%, transparent);
  }

  .content-area :deep(.field-list) {
    min-width: 0;
    padding: 0;
    overflow: hidden;
    border: 1px solid color-mix(in srgb, var(--card-border-color) 72%, transparent);
    border-radius: 14px;
    background: var(--workspace-panel-bg-color, var(--menu-body-bg-color));
    box-shadow: 0 12px 30px -28px color-mix(in srgb, var(--text-color) 38%, transparent);
  }

  // 拖拽样式
  .drag-overlay {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    // 主题变量而非写死白色:暗色主题下拖拽不再闪出刺眼白幕
    background: color-mix(in srgb, var(--background-color) 80%, transparent);
    border: 2px dashed var(--primary-color);
    border-radius: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 300;
    backdrop-filter: blur(5px);
    transition: all 0.3s ease;
  }

  .drag-content {
    text-align: center;
    color: var(--primary-color);
    font-size: 20px;
    font-weight: 500;
  }

  .drag-content p {
    margin-top: 16px;
  }

  @media (max-width: 1000px) {
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
      padding: 5px 9px;
      max-width: 120px;
    }

    .content-area {
      flex: 1;
      min-height: 0;
    }

    .content-area :deep(.field-list) {
      border-radius: 12px;
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

  @media (max-width: 767px) {
    .cloud-count-chip,
    .cloud-search-action {
      display: none;
    }

    .cloud-view-toggle {
      min-width: 0;
      height: 40px;
      box-sizing: border-box;
      flex: 0 0 76px;
    }

    .cloud-view-button {
      width: 100%;
      min-width: 0;
      height: 34px;
      gap: 5px;
      flex: 1 1 0;
    }

    .cloud-view-button.active {
      box-shadow: none;
    }

    .cloud-view-toggle :deep(.b-tooltip-wrap) {
      min-width: 0;
      flex: 1 1 0;
    }

    .cloud-view-label {
      display: none;
    }

    .cloud-type-filter {
      min-width: 0;
      max-width: 112px;
      flex: 0 1 112px;
    }

    .cloud-type-filter :deep(.b-popover-trigger) {
      display: flex;
      width: 100%;
      min-width: 0;
    }

    .cloud-type-filter :deep(.filter-button) {
      width: 100%;
      height: 40px;
      padding: 0 8px;
      gap: 5px;
      font-size: 12px;
    }

    .header-handle-group {
      margin-left: auto;
    }

    .mobile-folder-list {
      padding-bottom: 2px;
    }

    .content-area :deep(.field-list) {
      border: 0;
      box-shadow: none;
      background: transparent;
    }
  }
</style>
