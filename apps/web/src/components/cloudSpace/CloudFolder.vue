<template>
  <div class="folder-list" :class="{ 'is-tree-mode': folderTreeMode }">
    <BButton
      class="cloud-folder-row cloud-folder-row--all"
      :class="{
        'is-current': cloud.folder.id === 'all',
        'is-file-drop-target': fileDropTargetId === 'all',
        'is-folder-drop-target': folderDropTarget?.id === 'all',
      }"
      :title="t('cloudSpace.allFile')"
      @click="clickAllFolder"
      @dragover.prevent="onAllDragOver"
      @dragleave.prevent="clearFileDropTarget($event, 'all')"
      @drop.prevent="onDropAll"
      v-click-log="{ module: '云空间', operation: '查看全部文件' }"
    >
      <span v-if="folderTreeMode" class="cloud-folder-row__chevron-placeholder" aria-hidden="true"></span>
      <SvgIcon class="cloud-folder-row__folder-icon" size="17" :src="icon.common.folder" aria-hidden="true" />
      <span class="cloud-folder-row__name">{{ t('cloudSpace.allFile') }}</span>
      <span class="cloud-folder-row__count">{{ cloud.allFileCount }}</span>
    </BButton>

    <div v-if="cloud.folderLoading && !cloud.folderList.length" class="cloud-folder-skeleton" aria-hidden="true">
      <div v-for="index in 6" :key="index" class="cloud-folder-skeleton__row"></div>
    </div>
    <div v-else v-auto-scrollbar class="cloud-folder-tree" role="tree" :aria-label="t('cloudSpace.folderTree')">
      <BActionMenu
        v-for="folder in visibleFolders"
        :key="folder.id"
        class="cloud-folder-action-menu"
        :items="folderMenuItems(folder)"
        :triggers="folderMenuTriggers"
        placement="right-start"
        :disabled="Boolean(draggingFolderId) || Boolean(cloud.draggingFile?.id)"
        :aria-label="t('cloudSpace.folderActionsFor', { name: folder.name })"
        @select="(action, source) => handleFolderMenu(action, folder, source)"
      >
        <div class="cloud-folder-item">
          <div
            class="cloud-folder-row"
            :class="{
              'is-current': String(cloud.folder.id) === folder.id,
              'is-file-drop-target': fileDropTargetId === folder.id,
              'is-folder-drop-target': folderDropTarget?.id === folder.id && folderDropTarget.position === 'inside',
              'is-folder-dragging': draggingFolderId === folder.id,
              'is-sort-before': folderDropTarget?.id === folder.id && folderDropTarget.position === 'before',
              'is-sort-after': folderDropTarget?.id === folder.id && folderDropTarget.position === 'after',
            }"
            :style="{ '--cloud-folder-depth': String(Math.min(folder.depth, 6)) }"
            :title="folder.fullPath"
            role="treeitem"
            :aria-level="folder.depth"
            :aria-selected="String(cloud.folder.id) === folder.id"
            :aria-expanded="folder.hasChildren ? expandedIds.has(folder.id) : undefined"
            tabindex="0"
            :draggable="!bookmark.isTouchDevice"
            @click.stop="folderClick(folder)"
            @keydown.enter.prevent.stop="folderClick(folder)"
            @keydown.space.prevent.stop="folderClick(folder)"
            @dragstart="onFolderDragStart($event, folder)"
            @dragend="onFolderDragEnd"
            @dragover.prevent="onFolderRowDragOver($event, folder)"
            @dragleave.prevent="clearFileDropTarget($event, folder.id)"
            @drop.prevent="onDropFolder($event, folder)"
            v-click-log="{ module: '云空间', operation: `查看文件夹【${folder.fullPath}】` }"
          >
            <BButton
              v-if="folderTreeMode && folder.hasChildren"
              class="cloud-folder-row__chevron"
              :class="{ 'is-expanded': expandedIds.has(folder.id) }"
              :aria-label="
                t(expandedIds.has(folder.id) ? 'cloudSpace.collapseFolder' : 'cloudSpace.expandFolder', {
                  name: folder.name,
                })
              "
              @click.stop="cloud.toggleFolderExpanded(folder.id)"
            >
              <span class="cloud-folder-row__chevron-icon" aria-hidden="true">
                <SvgIcon :src="icon.noteTree.chevron" size="13" />
              </span>
            </BButton>
            <span v-else-if="folderTreeMode" class="cloud-folder-row__chevron-placeholder" aria-hidden="true"></span>
            <SvgIcon class="cloud-folder-row__folder-icon" size="17" :src="icon.common.folder" aria-hidden="true" />
            <span class="cloud-folder-row__name">{{ folder.name }}</span>
            <span class="cloud-folder-row__count">{{ folder.directFileCount || '—' }}</span>
          </div>
        </div>
      </BActionMenu>

      <p v-if="!visibleFolders.length" class="cloud-folder-empty">{{ t('cloudSpace.noFoldersToManage') }}</p>
    </div>

    <p
      v-if="draggingFolderId"
      class="cloud-folder-drop-hint"
      :class="{ 'is-ready': Boolean(folderDropTarget) }"
      role="status"
      aria-live="polite"
      :aria-label="folderDropHint.fullText"
    >
      <template v-if="folderDropHint.target">
        <span class="cloud-folder-drop-hint__action">{{ folderDropHint.action }}</span>
        <span class="cloud-folder-drop-hint__target" :title="folderDropHint.target">
          {{ folderDropHint.target }}
        </span>
        <span class="cloud-folder-drop-hint__relation">{{ folderDropHint.relation }}</span>
      </template>
      <span v-else class="cloud-folder-drop-hint__plain">{{ folderDropHint.fullText }}</span>
    </p>

    <BButton v-else class="cloud-folder-create" block @click="openCreateFolder(null)">
      <SvgIcon :src="icon.common.plus" size="16" aria-hidden="true" />
      <span>{{ t('cloudSpace.newFolder') }}</span>
    </BButton>

    <!-- 浏览器文件选择能力没有对应 B 组件，仅保留不可见原生 input，由 BButton/菜单触发。 -->
    <input ref="folderUploadInput" type="file" multiple hidden @change="onFileSelect" />

    <BModal
      v-model:visible="editorVisible"
      :title="editorTitle"
      :mask-closable="false"
      width="min(440px, 88vw)"
      initial-focus=".cloud-folder-editor-input .b-input"
      @ok="submitFolderEditor"
    >
      <div class="cloud-folder-editor">
        <p v-if="editorParent" class="cloud-folder-editor__parent">
          {{ t('cloudSpace.createSubfolderUnder', { path: editorParent.fullPath }) }}
        </p>
        <BInput
          v-model:value="editorName"
          class="cloud-folder-editor-input"
          :maxlength="255"
          :placeholder="t('cloudSpace.folderNamePlaceholder')"
          :disabled="editorSaving"
          @enter="submitFolderEditor"
        />
        <p v-if="editorError" class="cloud-folder-editor__error" role="alert">{{ editorError }}</p>
      </div>
    </BModal>

    <CloudFolderMoveModal v-model:visible="moveVisible" :folder="movingFolder" @moved="handleFolderMoved" />
    <CloudFolderClearModal v-model:visible="clearVisible" :folder="clearingFolder" :folders="cloud.folderList" />
  </div>
</template>

<script lang="ts" setup>
  import { computed, ref, watch } from 'vue';
  import { useI18n } from 'vue-i18n';
  import BActionMenu from '@/components/base/BasicComponents/BActionMenu.vue';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BInput from '@/components/base/BasicComponents/BInput.vue';
  import BModal from '@/components/base/BasicComponents/BModal/BModal.vue';
  import message from '@/components/base/BasicComponents/BMessage/BMessage.ts';
  import Alert from '@/components/base/BasicComponents/BModal/Alert.ts';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import CloudFolderMoveModal from '@/components/cloudSpace/CloudFolderMoveModal.vue';
  import CloudFolderClearModal from '@/components/cloudSpace/CloudFolderClearModal.vue';
  import icon from '@/config/icon.ts';
  import type {
    BActionMenuItem,
    BActionMenuSource,
    BActionMenuTrigger,
  } from '@/components/base/BasicComponents/actionMenu';
  import { bookmarkStore, cloudSpaceStore } from '@/store';
  import {
    cloudFolderDropBlockReason,
    collectCloudFolderDescendantIds,
    flattenCloudFolderTree,
    resolveCloudFolderDropPosition,
    type CloudFolderDropPosition,
  } from '@/utils/cloudFolderTree';
  import type { CloudFolderNode } from '@/types/cloudFolder';
  import { recordOperation } from '@/api/commonApi.ts';
  import { apiBasePost } from '@/http/request.ts';
  import { blockGuestWrite } from '@/composables/useGuestGuard';

  const bookmark = bookmarkStore();
  const cloud = cloudSpaceStore();
  const { t } = useI18n();
  const emit = defineEmits<{ uploadFiles: [payload: { files: File[]; folderId: string | null }] }>();
  const folderMenuTriggers: BActionMenuTrigger[] = ['hover', 'contextmenu'];
  const folderUploadInput = ref<HTMLInputElement | null>(null);
  const uploadTargetFolderId = ref<string | null>(null);
  const fileDropTargetId = ref('');
  const draggingFolderId = ref('');
  type FolderDropPosition = CloudFolderDropPosition | 'top-level';
  const folderDropTarget = ref<{ id: string; position: FolderDropPosition } | null>(null);
  const editorVisible = ref(false);
  const editorMode = ref<'create' | 'rename'>('create');
  const editorName = ref('');
  const editorError = ref('');
  const editorSaving = ref(false);
  const editorParent = ref<CloudFolderNode | null>(null);
  const editingFolder = ref<CloudFolderNode | null>(null);
  const moveVisible = ref(false);
  const movingFolder = ref<CloudFolderNode | null>(null);
  const clearVisible = ref(false);
  const clearingFolder = ref<CloudFolderNode | null>(null);

  const expandedIds = computed(() => new Set(cloud.expandedFolderIds));
  const folderTreeMode = computed(() => cloud.folderList.some((folder) => folder.parentId !== null));
  const visibleFolders = computed(() => flattenCloudFolderTree(cloud.folderList, expandedIds.value));
  const folderDropHint = computed(() => {
    const target = folderDropTarget.value;
    if (!target) return { fullText: t('cloudSpace.folderDragHint') };
    if (target.position === 'top-level') {
      return {
        fullText: t('cloudSpace.folderDropTopLevel'),
        action: t('cloudSpace.folderDropActionTopLevel'),
        target: t('cloudSpace.folderDropTargetTopLevel'),
        relation: t('cloudSpace.folderDropRelationTopLevel'),
      };
    }
    const folder = cloud.folderList.find((item) => item.id === target.id);
    if (!folder) return { fullText: t('cloudSpace.folderDragHint') };
    if (target.position === 'before') {
      return {
        fullText: t('cloudSpace.folderDropBefore', { name: folder.name }),
        action: t('cloudSpace.folderDropActionInsert'),
        target: folder.name,
        relation: t('cloudSpace.folderDropRelationBefore'),
      };
    }
    if (target.position === 'after') {
      return {
        fullText: t('cloudSpace.folderDropAfter', { name: folder.name }),
        action: t('cloudSpace.folderDropActionInsert'),
        target: folder.name,
        relation: t('cloudSpace.folderDropRelationAfter'),
      };
    }
    return {
      fullText: t('cloudSpace.folderDropInside', { name: folder.name }),
      action: t('cloudSpace.folderDropActionInside'),
      target: folder.name,
      relation: t('cloudSpace.folderDropRelationInside'),
    };
  });
  const editorTitle = computed(() =>
    t(
      editorMode.value === 'rename'
        ? 'cloudSpace.renameFolder'
        : editorParent.value
          ? 'cloudSpace.newSubfolder'
          : 'cloudSpace.newFolder',
    ),
  );

  function folderMenuItems(folder: CloudFolderNode): BActionMenuItem[] {
    return [
      {
        key: 'new-child',
        label: t('cloudSpace.newSubfolder'),
        icon: icon.common.plus,
        disabled: folder.depth >= cloud.folderMaxDepth,
      },
      { key: 'upload', label: t('cloudSpace.uploadFile'), icon: icon.file_upload },
      { key: 'move', label: t('cloudSpace.moveFolder'), icon: icon.noteTree.move },
      { key: 'rename', label: t('common.reName'), icon: icon.cloudSpace.rename },
      { key: 'folder-actions-divider', divider: true },
      {
        key: 'clear-files',
        label: t('cloudSpace.clearFolderFilesAction'),
        icon: icon.table_delete,
        danger: true,
      },
      { key: 'delete', label: t('common.delete'), icon: icon.table_delete, danger: true },
    ];
  }

  function normalizeFolderId(folderId?: string | null) {
    return folderId && folderId !== 'all' ? String(folderId) : null;
  }

  function clickAllFolder() {
    cloud.folder = { name: t('cloudSpace.allFile'), id: 'all' };
    void cloud.queryFieldList();
  }

  function folderClick(folder: CloudFolderNode) {
    cloud.folder = { id: folder.id, name: folder.name };
    cloud.expandFolderAncestors(folder.id);
    void cloud.queryFieldList();
  }

  function handleFolderMenu(action: string, folder: CloudFolderNode, source: BActionMenuSource = 'contextmenu') {
    recordOperation({ module: '云空间', operation: `${source}:${action}文件夹【${folder.fullPath}】` });
    if (action === 'new-child') openCreateFolder(folder);
    if (action === 'upload') openUploadToFolder(folder.id);
    if (action === 'move') openMoveFolder(folder);
    if (action === 'rename') openRenameFolder(folder);
    if (action === 'clear-files') openClearFolderFiles(folder);
    if (action === 'delete') requestDeleteFolder(folder);
  }

  function openClearFolderFiles(folder: CloudFolderNode) {
    if (blockGuestWrite('delete-file')) return;
    clearingFolder.value = folder;
    clearVisible.value = true;
  }

  function openCreateFolder(parent: CloudFolderNode | null) {
    if (blockGuestWrite('manage-folder')) return;
    if (parent && parent.depth >= cloud.folderMaxDepth) {
      message.warning(t('cloudSpace.folderDepthLimit', { depth: cloud.folderMaxDepth }));
      return;
    }
    editorMode.value = 'create';
    editorParent.value = parent;
    editingFolder.value = null;
    editorName.value = '';
    editorError.value = '';
    editorVisible.value = true;
  }

  function openRenameFolder(folder: CloudFolderNode) {
    if (blockGuestWrite('manage-folder')) return;
    editorMode.value = 'rename';
    editorParent.value = null;
    editingFolder.value = folder;
    editorName.value = folder.name;
    editorError.value = '';
    editorVisible.value = true;
  }

  async function submitFolderEditor() {
    if (editorSaving.value) return;
    const name = editorName.value.trim();
    if (!name) {
      editorError.value = t('cloudSpace.folderNameRequired');
      return;
    }
    editorSaving.value = true;
    editorError.value = '';
    try {
      const isRename = editorMode.value === 'rename' && editingFolder.value;
      const response = isRename
        ? await apiBasePost('/api/file/updateFolder', { id: editingFolder.value?.id, name }, { silent: true })
        : await apiBasePost(
            '/api/file/addFolder',
            { name, parentId: editorParent.value?.id || null },
            { silent: true },
          );
      if (response?.status !== 200) {
        editorError.value =
          response?.msg || t(isRename ? 'cloudSpace.renameFolderFailed' : 'cloudSpace.createFolderFailed');
        return;
      }
      editorVisible.value = false;
      if (isRename) {
        message.success(t('cloudSpace.renameFolderSuccess', { name }));
      } else {
        message.success(t('cloudSpace.createFolderSuccess', { name }));
        if (editorParent.value) cloud.setFolderExpanded(editorParent.value.id, true);
      }
      const createdId = isRename ? editingFolder.value?.id : String(response.data || '');
      await cloud.queryFolder();
      const refreshed = cloud.folderList.find((folder) => folder.id === createdId);
      if (refreshed) folderClick(refreshed);
    } catch {
      editorError.value = t(
        editorMode.value === 'rename' ? 'cloudSpace.renameFolderFailed' : 'cloudSpace.createFolderFailed',
      );
    } finally {
      editorSaving.value = false;
    }
  }

  function openMoveFolder(folder: CloudFolderNode) {
    if (blockGuestWrite('manage-folder')) return;
    movingFolder.value = folder;
    moveVisible.value = true;
  }

  function handleFolderMoved() {
    if (movingFolder.value) cloud.expandFolderAncestors(movingFolder.value.id);
  }

  function requestDeleteFolder(folder: CloudFolderNode) {
    if (blockGuestWrite('delete-folder')) return;
    Alert.alert({
      title: t('cloudSpace.deleteFolderTitle'),
      content: t('cloudSpace.deleteFolderTreeConfirm', { name: folder.name }),
      okText: t('common.delete'),
      okType: 'danger',
      cancelText: t('common.cancel'),
      onOk: () => void deleteFolder(folder),
    });
  }

  async function deleteFolder(folder: CloudFolderNode) {
    const deletedFolderIds = collectCloudFolderDescendantIds(cloud.folderList, folder.id);
    deletedFolderIds.add(folder.id);
    try {
      const response = await apiBasePost(
        '/api/file/deleteFolder',
        { id: folder.id, recursive: true },
        { silent: true },
      );
      if (response?.status !== 200) {
        message.error(response?.msg || t('cloudSpace.deleteFolderFailed'));
        return;
      }
      if (deletedFolderIds.has(String(cloud.folder.id))) {
        cloud.folder = { id: 'all', name: t('cloudSpace.allFile') };
      }
      message.success(t('cloudSpace.deleteFolderSuccess', { name: folder.name }));
      await Promise.all([cloud.queryFolder(), cloud.queryFieldList()]);
    } catch {
      message.error(t('cloudSpace.deleteFolderFailed'));
    }
  }

  function openUploadToFolder(folderId: string) {
    uploadTargetFolderId.value = folderId;
    folderUploadInput.value?.click();
  }

  function onFileSelect(event: Event) {
    const input = event.target as HTMLInputElement;
    const files = Array.from(input.files || []);
    if (files.length) emit('uploadFiles', { files, folderId: uploadTargetFolderId.value });
    input.value = '';
  }

  async function moveSingleFileToFolder(fileId: string, sourceFolderId: string | null, targetFolderId: string | null) {
    if (blockGuestWrite('move-file') || !fileId || sourceFolderId === targetFolderId) return;
    try {
      const response = await apiBasePost('/api/file/associateFile', { folderId: targetFolderId, fileIds: [fileId] });
      if (response.status !== 200) {
        message.error(response.msg || t('cloudSpace.moveFailed'));
        return;
      }
      message.success(t('cloudSpace.moveSuccess'));
      await cloud.refreshAfterFileMutation();
    } catch {
      message.error(t('cloudSpace.moveFailed'));
    }
  }

  function onFileDragOver(event: DragEvent, targetId: string) {
    if (draggingFolderId.value) return;
    fileDropTargetId.value = targetId;
    if (event.dataTransfer) event.dataTransfer.dropEffect = cloud.draggingFile?.id ? 'move' : 'copy';
  }

  function clearFileDropTarget(event: DragEvent, targetId: string) {
    const relatedTarget = event.relatedTarget as Node | null;
    if (relatedTarget && (event.currentTarget as HTMLElement)?.contains(relatedTarget)) return;
    if (fileDropTargetId.value === targetId) fileDropTargetId.value = '';
    if (folderDropTarget.value?.id === targetId) folderDropTarget.value = null;
  }

  function onDropAll(event: DragEvent) {
    if (draggingFolderId.value) {
      void commitFolderTopLevelDrop();
      return;
    }
    fileDropTargetId.value = '';
    const innerFile = cloud.draggingFile;
    if (innerFile?.id) {
      void moveSingleFileToFolder(innerFile.id, normalizeFolderId(innerFile.folderId), null);
      cloud.draggingFile = null;
      return;
    }
    const files = Array.from(event.dataTransfer?.files || []);
    if (files.length) emit('uploadFiles', { files, folderId: null });
  }

  function onDropFolder(event: DragEvent, folder: CloudFolderNode) {
    if (draggingFolderId.value) {
      void commitFolderDrop(folder);
      return;
    }
    fileDropTargetId.value = '';
    const innerFile = cloud.draggingFile;
    if (innerFile?.id) {
      void moveSingleFileToFolder(innerFile.id, normalizeFolderId(innerFile.folderId), folder.id);
      cloud.draggingFile = null;
      return;
    }
    const files = Array.from(event.dataTransfer?.files || []);
    if (files.length) emit('uploadFiles', { files, folderId: folder.id });
  }

  function onFolderDragStart(event: DragEvent, folder: CloudFolderNode) {
    if (bookmark.isTouchDevice || cloud.draggingFile?.id) {
      event.preventDefault();
      return;
    }
    draggingFolderId.value = folder.id;
    folderDropTarget.value = null;
    event.dataTransfer?.setData('text/x-light-note-folder', folder.id);
    if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
  }

  function onFolderDragEnd() {
    draggingFolderId.value = '';
    folderDropTarget.value = null;
  }

  function onFolderRowDragOver(event: DragEvent, folder: CloudFolderNode) {
    if (!draggingFolderId.value) {
      onFileDragOver(event, folder.id);
      return;
    }
    const source = cloud.folderList.find((item) => item.id === draggingFolderId.value);
    if (!source || source.id === folder.id) {
      folderDropTarget.value = null;
      if (event.dataTransfer) event.dataTransfer.dropEffect = 'none';
      return;
    }
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    const pointerRatio = rect.height > 0 ? (event.clientY - rect.top) / rect.height : 0.5;
    const position = resolveCloudFolderDropPosition(source, folder, pointerRatio);
    const parentId = position === 'inside' ? folder.id : folder.parentId;
    const anchorId = position === 'inside' ? null : folder.id;
    const anchorPosition = position === 'inside' ? null : position;
    if (
      cloudFolderDropBlockReason(cloud.folderList, source.id, parentId, cloud.folderMaxDepth, anchorId, anchorPosition)
    ) {
      folderDropTarget.value = null;
      if (event.dataTransfer) event.dataTransfer.dropEffect = 'none';
      return;
    }
    folderDropTarget.value = {
      id: folder.id,
      position,
    };
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
  }

  function onAllDragOver(event: DragEvent) {
    if (!draggingFolderId.value) {
      onFileDragOver(event, 'all');
      return;
    }
    const source = cloud.folderList.find((folder) => folder.id === draggingFolderId.value);
    if (!source || cloudFolderDropBlockReason(cloud.folderList, source.id, null, cloud.folderMaxDepth)) {
      folderDropTarget.value = null;
      if (event.dataTransfer) event.dataTransfer.dropEffect = 'none';
      return;
    }
    folderDropTarget.value = { id: 'all', position: 'top-level' };
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
  }

  async function commitFolderDrop(target: CloudFolderNode) {
    const source = cloud.folderList.find((item) => item.id === draggingFolderId.value);
    const position = folderDropTarget.value?.id === target.id ? folderDropTarget.value.position : null;
    draggingFolderId.value = '';
    folderDropTarget.value = null;
    if (!source || !position || source.id === target.id) return;
    await moveFolderByDrop(source, target, position);
  }

  async function commitFolderTopLevelDrop() {
    const source = cloud.folderList.find((item) => item.id === draggingFolderId.value);
    const canDrop = folderDropTarget.value?.id === 'all' && folderDropTarget.value.position === 'top-level';
    draggingFolderId.value = '';
    folderDropTarget.value = null;
    if (!source || !canDrop) return;
    await moveFolderByDrop(source, null, 'top-level');
  }

  async function moveFolderByDrop(
    source: CloudFolderNode,
    target: CloudFolderNode | null,
    position: FolderDropPosition,
  ) {
    const parentId =
      position === 'top-level' ? null : position === 'inside' ? target?.id || null : target?.parentId || null;
    const anchorId = position === 'before' || position === 'after' ? target?.id || null : null;
    const anchorPosition = position === 'before' || position === 'after' ? position : null;
    if (
      cloudFolderDropBlockReason(cloud.folderList, source.id, parentId, cloud.folderMaxDepth, anchorId, anchorPosition)
    ) {
      return;
    }
    if (blockGuestWrite('manage-folder')) return;
    try {
      const response = await apiBasePost(
        '/api/file/moveFolder',
        { id: source.id, parentId, anchorId, position: anchorPosition },
        { silent: true },
      );
      if (response?.status !== 200) {
        message.error(response?.msg || t('cloudSpace.moveFolderFailed'));
        return;
      }
      recordOperation({ module: '云空间', operation: `拖拽移动文件夹成功【${source.fullPath}】` });
      message.success(t('cloudSpace.moveFolderSuccess', { name: source.name }));
      if (parentId) cloud.setFolderExpanded(parentId, true);
      await cloud.queryFolder();
      if (parentId) cloud.setFolderExpanded(parentId, true);
      cloud.expandFolderAncestors(source.id);
    } catch {
      message.error(t('cloudSpace.moveFolderFailed'));
    }
  }

  watch(
    () => [cloud.folder.id, cloud.folderList.length],
    () => {
      if (cloud.folder.id !== 'all') cloud.expandFolderAncestors(String(cloud.folder.id));
    },
    { immediate: true },
  );

  void cloud.queryFolder();
</script>

<style lang="less" scoped>
  .folder-list {
    position: relative;
    height: 100%;
    width: 300px;
    min-height: 0;
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
    border-right: 1px solid var(--folder-list-border-color);
    padding-right: 10px;
  }

  .cloud-folder-tree {
    min-height: 0;
    overflow-y: auto;
    flex: 1 1 auto;
  }

  .cloud-folder-action-menu {
    display: block;
    width: 100%;
  }

  .cloud-folder-item {
    position: relative;
    width: 100%;
    min-width: 0;
  }

  .cloud-folder-row {
    position: relative;
    width: 100%;
    min-width: 0;
    min-height: 34px;
    height: 34px;
    display: flex;
    align-items: center;
    justify-content: flex-start;
    gap: 7px;
    padding: 0 8px 0 calc(8px + (var(--cloud-folder-depth, 1) - 1) * 16px);
    box-sizing: border-box;
    border: 1px solid transparent;
    border-radius: 8px;
    color: var(--text-color);
    background: transparent;
    cursor: pointer;
    text-align: left;
  }

  .cloud-folder-row--all {
    flex: 0 0 34px;
    padding-left: 8px;
  }

  @media (hover: hover) and (pointer: fine) {
    .cloud-folder-row:hover {
      background: var(--category-item-ba-color);
    }
  }

  .cloud-folder-row:focus-visible {
    outline: 2px solid var(--focus-ring-color, var(--primary-color));
    outline-offset: 1px;
  }

  .cloud-folder-row.is-current {
    border-color: var(--resource-file-color, #ff8a00);
    color: var(--resource-file-color, #ff8a00);
    background: color-mix(in srgb, var(--resource-file-color, #ff8a00) 8%, var(--menu-body-bg-color));
    font-weight: 600;
  }

  .cloud-folder-row.is-file-drop-target {
    border-color: var(--resource-file-color, #ff8a00);
    background: color-mix(in srgb, var(--resource-file-color, #ff8a00) 12%, var(--menu-body-bg-color));
  }

  .cloud-folder-row.is-folder-drop-target {
    border-color: var(--resource-file-color, #ff8a00);
    background: color-mix(in srgb, var(--resource-file-color, #ff8a00) 12%, var(--menu-body-bg-color));
  }

  .cloud-folder-row.is-folder-dragging {
    opacity: 0.58;
  }

  .cloud-folder-row.is-sort-before::before,
  .cloud-folder-row.is-sort-after::after {
    content: '';
    position: absolute;
    left: calc(8px + (var(--cloud-folder-depth, 1) - 1) * 16px);
    right: 6px;
    height: 3px;
    border-radius: 2px;
    background: var(--resource-file-color, #ff8a00);
  }

  .cloud-folder-row.is-sort-before::before {
    top: -1px;
  }

  .cloud-folder-row.is-sort-after::after {
    bottom: -1px;
  }

  .cloud-folder-row__chevron {
    width: 22px;
    min-width: 22px;
    height: 28px;
    flex: 0 0 22px;
    padding: 0;
    border: 0 !important;
    border-radius: 6px;
    color: var(--desc-color);
    background: transparent !important;
  }

  .cloud-folder-row__chevron-placeholder {
    width: 22px;
    min-width: 22px;
    height: 28px;
    flex: 0 0 22px;
  }

  .cloud-folder-row.is-current .cloud-folder-row__chevron {
    color: currentColor;
  }

  @media (hover: hover) and (pointer: fine) {
    .cloud-folder-row__chevron:hover {
      color: var(--resource-file-color, #ff8a00);
      background: transparent !important;
    }
  }

  .cloud-folder-row__chevron:focus-visible {
    outline: 1px solid var(--resource-file-color, #ff8a00);
    outline-offset: 0;
  }

  .cloud-folder-row__chevron-icon {
    display: inline-flex;
    transform: rotate(-90deg);
    transition: transform 0.18s ease;
  }

  .cloud-folder-row__chevron.is-expanded .cloud-folder-row__chevron-icon {
    transform: rotate(0deg);
  }

  .cloud-folder-row__folder-icon {
    flex: 0 0 auto;
    color: var(--resource-file-color, #ff8a00);
  }

  .cloud-folder-row__name {
    min-width: 0;
    overflow: hidden;
    flex: 1 1 auto;
    font-size: 13px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .cloud-folder-row__count {
    min-width: 18px;
    color: var(--desc-color);
    font-size: 10px;
    font-variant-numeric: tabular-nums;
    text-align: right;
  }

  .cloud-folder-row.is-current .cloud-folder-row__count {
    color: currentColor;
  }

  .cloud-folder-create {
    flex: 0 0 40px;
    min-height: 40px;
    gap: 7px;
    color: var(--resource-file-color, #ff8a00);
  }

  .cloud-folder-drop-hint {
    flex: 0 0 40px;
    width: 100%;
    min-width: 0;
    min-height: 40px;
    margin: 0;
    padding: 0 12px;
    overflow: hidden;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    box-sizing: border-box;
    border: 1px solid var(--resource-file-color, #ff8a00);
    border-radius: 9px;
    color: var(--resource-file-color, #ff8a00);
    background: var(--menu-body-bg-color);
    box-shadow: var(--resource-card-shadow);
    font-size: 12px;
    font-weight: 650;
    line-height: 1.35;
    text-align: center;
    pointer-events: none;

    &.is-ready {
      color: #fff;
      background: var(--resource-file-color, #ff8a00);
    }
  }

  .cloud-folder-drop-hint__action,
  .cloud-folder-drop-hint__relation {
    flex: 0 0 auto;
    white-space: nowrap;
  }

  .cloud-folder-drop-hint__action {
    font-weight: 700;
  }

  .cloud-folder-drop-hint__target,
  .cloud-folder-drop-hint__plain {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .cloud-folder-drop-hint__target {
    flex: 1 1 auto;
    text-align: center;
  }

  .cloud-folder-drop-hint__plain {
    flex: 1 1 100%;
    text-align: center;
  }

  .cloud-folder-drop-hint__relation {
    padding: 2px 6px;
    border: 1px solid rgba(255, 255, 255, 0.46);
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.16);
    font-weight: 750;
    line-height: 1.2;
  }

  .cloud-folder-empty {
    margin: 0;
    padding: 24px 8px;
    color: var(--desc-color);
    font-size: 12px;
    line-height: 1.5;
    text-align: center;
  }

  .cloud-folder-editor {
    width: min(360px, 72vw);
    display: grid;
    gap: 10px;
  }

  .cloud-folder-editor__parent {
    margin: 0;
    color: var(--desc-color);
    font-size: 12px;
    line-height: 1.5;
  }

  .cloud-folder-editor__error {
    margin: 0;
    color: var(--danger-color);
    font-size: 12px;
  }

  .cloud-folder-skeleton {
    display: flex;
    flex-direction: column;
    gap: 5px;
    padding-top: 2px;
  }

  .cloud-folder-skeleton__row {
    position: relative;
    height: 34px;
    overflow: hidden;
    border-radius: 8px;
    background: var(--bl-input-noBorder-bg-color);
  }

  .cloud-folder-skeleton__row::after {
    content: '';
    position: absolute;
    inset: 0;
    background: linear-gradient(90deg, transparent, var(--skeleton-body-bg-color), transparent);
    transform: translateX(-100%);
    animation: cloud-folder-skeleton-shine 1.2s infinite;
  }

  @keyframes cloud-folder-skeleton-shine {
    to {
      transform: translateX(100%);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .cloud-folder-skeleton__row::after {
      animation: none;
    }
  }

  html.light-note-mobile-rendering .cloud-folder-row.is-current,
  html.light-note-mobile-rendering .cloud-folder-row.is-file-drop-target,
  html.light-note-mobile-rendering .cloud-folder-row.is-folder-drop-target {
    border-color: var(--resource-file-color, #ff8a00);
    color: var(--resource-file-color, #ff8a00);
  }
</style>
