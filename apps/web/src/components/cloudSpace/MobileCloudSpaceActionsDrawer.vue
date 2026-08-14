<template>
  <BDrawer
    :open="open"
    :title="drawerTitle"
    placement="bottom"
    height="auto"
    body-padding="0"
    :mobile-centered-header="hasSubView"
    @close="closeDrawer"
  >
    <template #header-leading>
      <BButton
        v-if="hasSubView"
        class="mobile-cloud-actions__back"
        :disabled="isBusy"
        :aria-label="t('common.back')"
        @click="goBack"
      >
        <SvgIcon :src="icon.arrow_left" size="20" aria-hidden="true" />
      </BButton>
    </template>
    <template #header-actions>
      <BButton
        v-if="hasSubView"
        class="mobile-cloud-actions__close"
        :disabled="isBusy"
        :aria-label="t('common.close')"
        @click="closeDrawer"
      >
        <SvgIcon :src="icon.common.close" size="18" aria-hidden="true" />
      </BButton>
    </template>

    <div v-if="!hasSubView" class="mobile-cloud-actions" role="menu" :aria-label="drawerTitle">
      <BButton class="mobile-cloud-actions__item" role="menuitem" @click="openManageFolders">
        <span class="mobile-cloud-actions__icon mobile-cloud-actions__icon--folder" aria-hidden="true">
          <SvgIcon :src="icon.common.folder" size="22" />
        </span>
        <span class="mobile-cloud-actions__copy">
          <strong>{{ t('cloudSpace.manageFolders') }}</strong>
          <small>{{ t('cloudSpace.manageFoldersDescription') }}</small>
        </span>
      </BButton>
      <BButton class="mobile-cloud-actions__item" role="menuitem" @click="selectBatchAction">
        <span class="mobile-cloud-actions__icon" aria-hidden="true">
          <SvgIcon :src="icon.filterPanel.check" size="19" />
        </span>
        <span class="mobile-cloud-actions__copy">
          <strong>{{ t(batchMode ? 'cloudSpace.exitBatch' : 'cloudSpace.batchAction') }}</strong>
          <small>{{ t('cloudSpace.batchActionDescription') }}</small>
        </span>
      </BButton>
    </div>

    <div v-else-if="isManageFoldersView" class="mobile-folder-manager">
      <div class="mobile-folder-manager__create-wrap">
        <BButton class="mobile-folder-manager__create" :disabled="isBusy" @click="openCreateFolderForm">
          <SvgIcon :src="icon.common.plus" size="18" aria-hidden="true" />
          <span>{{ t('cloudSpace.newFolder') }}</span>
        </BButton>
      </div>

      <div v-auto-scrollbar class="mobile-folder-manager__list" role="list" :aria-label="drawerTitle">
        <div v-if="!folders.length" class="mobile-folder-manager__empty" role="status">
          {{ t('cloudSpace.noFoldersToManage') }}
        </div>
        <div
          v-for="folder in folders"
          :key="folder.id"
          class="mobile-folder-manager__row"
          :class="{ 'is-current': String(folder.id) === String(currentFolderId) }"
          role="listitem"
        >
          <span class="mobile-folder-manager__folder-icon" aria-hidden="true">
            <SvgIcon :src="icon.common.folder" size="24" />
          </span>
          <span class="mobile-folder-manager__name" :title="folder.name">{{ folder.name }}</span>
          <span v-if="String(folder.id) === String(currentFolderId)" class="mobile-folder-manager__current">
            {{ t('cloudSpace.currentFolder') }}
          </span>
          <div class="mobile-folder-manager__actions">
            <BButton
              class="mobile-folder-manager__action"
              :disabled="Boolean(folderMutationId)"
              :aria-label="t('cloudSpace.renameFolderAction', { name: folder.name })"
              @click="openRenameFolderForm(folder)"
            >
              <SvgIcon :src="icon.table_edit" size="18" aria-hidden="true" />
            </BButton>
            <BButton
              class="mobile-folder-manager__action mobile-folder-manager__action--danger"
              type="danger"
              :disabled="Boolean(folderMutationId)"
              :aria-label="t('cloudSpace.deleteFolderAction', { name: folder.name })"
              @click="requestDeleteFolder(folder)"
            >
              <SvgIcon :src="icon.table_delete" size="18" aria-hidden="true" />
            </BButton>
          </div>
        </div>
      </div>
    </div>

    <form v-else class="mobile-folder-form" @submit.prevent="submitFolder">
      <div class="mobile-folder-form__field">
        <label class="mobile-folder-form__label" :for="folderInputId">{{ t('cloudSpace.folderName') }}</label>
        <BInput
          :id="folderInputId"
          ref="folderInputRef"
          v-model:value="folderName"
          :class="{ 'is-invalid': folderNameError }"
          height="44px"
          :maxlength="255"
          :placeholder="t('cloudSpace.folderNamePlaceholder')"
          :disabled="formSubmitting"
          autocomplete="off"
          @input="clearFolderError"
        />
        <div class="mobile-folder-form__meta">
          <span v-if="folderNameError" class="mobile-folder-form__error" role="alert">{{ folderNameError }}</span>
          <span v-else class="mobile-folder-form__hint">{{ t('cloudSpace.folderNameHint') }}</span>
          <span class="mobile-folder-form__counter">{{ folderName.length }}/255</span>
        </div>
      </div>

      <div class="mobile-folder-form__actions">
        <BButton class="mobile-folder-form__button" :disabled="formSubmitting" @click="goBack">
          {{ t('common.cancel') }}
        </BButton>
        <BButton class="mobile-folder-form__button" type="primary" native-type="submit" :loading="formSubmitting">
          {{ t(isRenameFolderView ? 'cloudSpace.saveFolderName' : 'cloudSpace.createAndEnterFolder') }}
        </BButton>
      </div>
    </form>
  </BDrawer>
</template>

<script lang="ts" setup>
  import { computed, nextTick, ref, watch } from 'vue';
  import { useI18n } from 'vue-i18n';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BDrawer from '@/components/base/BasicComponents/BDrawer.vue';
  import BInput from '@/components/base/BasicComponents/BInput.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import icon from '@/config/icon';

  type DrawerView = 'actions' | 'create-folder' | 'manage-folders' | 'rename-folder';
  interface FolderItem {
    id?: string;
    name: string;
  }
  type FolderMutationDone = (success: boolean) => void;

  const props = withDefaults(
    defineProps<{
      open: boolean;
      batchMode?: boolean;
      creating?: boolean;
      folders?: FolderItem[];
      currentFolderId?: string;
      folderMutationId?: string;
      beforeOpenCreateFolder?: () => boolean;
      beforeManageFolders?: () => boolean;
    }>(),
    {
      batchMode: false,
      creating: false,
      folders: () => [],
      currentFolderId: '',
      folderMutationId: '',
    },
  );

  const emit = defineEmits<{
    'update:open': [open: boolean];
    batch: [];
    'create-folder': [name: string];
    'rename-folder': [folder: { id: string; name: string }, done: FolderMutationDone];
    'delete-folder': [folder: { id: string; name: string }];
  }>();

  const { t } = useI18n();
  const view = ref<DrawerView>('actions');
  const folderName = ref('');
  const folderNameError = ref('');
  const editingFolder = ref<FolderItem | null>(null);
  const renamePending = ref(false);
  const folderInputRef = ref<InstanceType<typeof BInput> | null>(null);
  const folderInputId = `mobile-cloud-folder-name-${Math.random().toString(36).slice(2)}`;
  const isCreateFolderView = computed(() => view.value === 'create-folder');
  const isManageFoldersView = computed(() => view.value === 'manage-folders');
  const isRenameFolderView = computed(() => view.value === 'rename-folder');
  const hasSubView = computed(() => view.value !== 'actions');
  const formSubmitting = computed(() =>
    isRenameFolderView.value
      ? renamePending.value || String(props.folderMutationId) === String(editingFolder.value?.id || '')
      : props.creating,
  );
  const isBusy = computed(() => formSubmitting.value || Boolean(props.folderMutationId));
  const drawerTitle = computed(() => {
    if (isCreateFolderView.value) return t('cloudSpace.newFolder');
    if (isRenameFolderView.value) return t('cloudSpace.renameFolder');
    if (isManageFoldersView.value) return t('cloudSpace.manageFolders');
    return t('cloudSpace.mobileActionsTitle');
  });

  function resetFolderForm() {
    folderName.value = '';
    folderNameError.value = '';
    editingFolder.value = null;
    renamePending.value = false;
  }

  function resetDrawer() {
    view.value = 'actions';
    resetFolderForm();
  }

  function closeDrawer() {
    if (isBusy.value) return;
    emit('update:open', false);
  }

  function openCreateFolderForm() {
    if (props.beforeOpenCreateFolder && !props.beforeOpenCreateFolder()) return;
    view.value = 'create-folder';
    folderNameError.value = '';
    nextTick(() => folderInputRef.value?.focus());
  }

  function openManageFolders() {
    if (props.beforeManageFolders && !props.beforeManageFolders()) return;
    resetFolderForm();
    view.value = 'manage-folders';
  }

  function openRenameFolderForm(folder: FolderItem) {
    if (!folder.id || props.folderMutationId) return;
    editingFolder.value = { id: String(folder.id), name: folder.name };
    folderName.value = folder.name;
    folderNameError.value = '';
    view.value = 'rename-folder';
    nextTick(() => folderInputRef.value?.focus());
  }

  function goBack() {
    if (isBusy.value) return;
    if (isRenameFolderView.value || isCreateFolderView.value) {
      resetFolderForm();
      view.value = 'manage-folders';
      return;
    }
    resetDrawer();
  }

  function clearFolderError() {
    if (folderNameError.value) folderNameError.value = '';
  }

  function submitFolder() {
    if (formSubmitting.value) return;
    const name = folderName.value.trim();
    if (!name) {
      folderNameError.value = t('cloudSpace.folderNameRequired');
      nextTick(() => folderInputRef.value?.focus());
      return;
    }
    if (isRenameFolderView.value && editingFolder.value?.id) {
      if (name === editingFolder.value.name) {
        goBack();
        return;
      }
      renamePending.value = true;
      emit('rename-folder', { id: String(editingFolder.value.id), name }, (success) => {
        renamePending.value = false;
        if (!success) return;
        resetFolderForm();
        view.value = 'manage-folders';
      });
      return;
    }
    emit('create-folder', name);
  }

  function requestDeleteFolder(folder: FolderItem) {
    if (!folder.id || props.folderMutationId) return;
    emit('delete-folder', { id: String(folder.id), name: folder.name });
  }

  function selectBatchAction() {
    emit('update:open', false);
    emit('batch');
  }

  watch(
    () => props.open,
    (open) => {
      if (!open) resetDrawer();
    },
  );
</script>

<style lang="less" scoped>
  .mobile-cloud-actions {
    display: grid;
    gap: 6px;
    padding: 12px 16px max(18px, env(safe-area-inset-bottom));
  }

  .mobile-cloud-actions__item {
    width: 100%;
    min-height: 64px;
    height: auto;
    justify-content: flex-start;
    gap: 12px;
    padding: 10px 14px;
    border: 1px solid transparent;
    border-radius: var(--mobile-control-radius, 10px);
    background: var(--workspace-panel-bg-color) !important;
  }

  .mobile-cloud-actions__item:active {
    border-color: var(--resource-file-color, #ff8a00);
  }

  .mobile-cloud-actions__icon {
    width: 24px;
    display: inline-flex;
    flex: 0 0 24px;
    justify-content: center;
    color: var(--resource-file-color, #ff8a00);
  }

  .mobile-cloud-actions__icon--folder {
    transform: translateY(-1px);
  }

  .mobile-cloud-actions__copy {
    min-width: 0;
    display: flex;
    flex: 1 1 auto;
    flex-direction: column;
    align-items: flex-start;
    gap: 2px;
    line-height: 1.35;
    text-align: left;
    white-space: normal;
  }

  .mobile-cloud-actions__copy strong {
    color: var(--text-color);
    font-size: 15px;
    font-weight: 600;
  }

  .mobile-cloud-actions__copy small {
    color: var(--desc-color);
    font-size: 12px;
    font-weight: 400;
  }

  .mobile-cloud-actions__back,
  .mobile-cloud-actions__close {
    width: 36px;
    min-width: 36px;
    height: 36px;
    padding: 0;
    border-radius: 10px;
  }

  .mobile-folder-manager {
    max-height: min(58vh, 520px);
    min-height: 180px;
    display: flex;
    flex-direction: column;
  }

  .mobile-folder-manager__create-wrap {
    flex: 0 0 auto;
    padding: 12px 16px 10px;
  }

  .mobile-folder-manager__create {
    width: 100%;
    min-height: 48px;
    height: 48px;
    justify-content: flex-start;
    gap: 9px;
    padding: 0 14px;
    border: 1px solid var(--resource-file-color, #ff8a00);
    border-radius: var(--mobile-control-radius, 10px);
    background: var(--workspace-panel-bg-color) !important;
    color: var(--resource-file-color, #ff8a00);
    font-size: 14px;
    font-weight: 600;
  }

  .mobile-folder-manager__list {
    min-height: 0;
    overflow-y: auto;
    display: grid;
    align-content: start;
    gap: 8px;
    padding: 0 16px max(18px, env(safe-area-inset-bottom));
    scrollbar-gutter: stable;
  }

  .mobile-folder-manager__empty {
    min-height: 104px;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 16px;
    border: 1px dashed var(--card-border-color);
    border-radius: var(--mobile-control-radius, 10px);
    color: var(--desc-color);
    font-size: 13px;
    line-height: 1.5;
    text-align: center;
  }

  .mobile-folder-manager__row {
    min-height: 64px;
    display: grid;
    grid-template-columns: 26px minmax(0, 1fr) auto auto;
    align-items: center;
    gap: 10px;
    padding: 8px 10px 8px 12px;
    box-sizing: border-box;
    border: 1px solid var(--card-border-color);
    border-radius: var(--mobile-control-radius, 10px);
    background: var(--card-background);
  }

  .mobile-folder-manager__row.is-current {
    border-color: var(--resource-file-color, #ff8a00);
  }

  .mobile-folder-manager__folder-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    color: var(--resource-file-color, #ff8a00);
  }

  .mobile-folder-manager__name {
    min-width: 0;
    overflow: hidden;
    color: var(--text-color);
    font-size: 14px;
    font-weight: 600;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .mobile-folder-manager__current {
    padding: 2px 6px;
    border: 1px solid var(--resource-file-color, #ff8a00);
    border-radius: 999px;
    color: var(--resource-file-color, #ff8a00);
    font-size: 10px;
    line-height: 16px;
    white-space: nowrap;
  }

  .mobile-folder-manager__actions {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .mobile-folder-manager__action {
    width: 40px;
    min-width: 40px;
    height: 40px;
    padding: 0;
    border: 1px solid var(--card-border-color);
    border-radius: 10px;
  }

  .mobile-folder-manager__action--danger {
    border-color: var(--danger-color);
  }

  .mobile-folder-form {
    display: grid;
    gap: 22px;
    padding: 18px 18px max(20px, env(safe-area-inset-bottom));
  }

  .mobile-folder-form__field {
    display: grid;
    gap: 8px;
  }

  .mobile-folder-form__label {
    color: var(--text-color);
    font-size: 14px;
    font-weight: 600;
  }

  .mobile-folder-form :deep(.b-input) {
    border: 1px solid var(--card-border-color) !important;
    border-radius: var(--mobile-control-radius, 10px);
    background: var(--card-background) !important;
    font-size: 16px;
  }

  .mobile-folder-form :deep(.b-input:focus-visible) {
    border-color: var(--resource-file-color, #ff8a00) !important;
    outline: 2px solid color-mix(in srgb, var(--resource-file-color, #ff8a00) 18%, transparent);
    outline-offset: 1px;
  }

  .mobile-folder-form .is-invalid :deep(.b-input) {
    border-color: var(--danger-color) !important;
  }

  .mobile-folder-form__meta {
    min-height: 18px;
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
    color: var(--desc-color);
    font-size: 12px;
    line-height: 18px;
  }

  .mobile-folder-form__error {
    color: var(--danger-color);
  }

  .mobile-folder-form__hint {
    min-width: 0;
  }

  .mobile-folder-form__counter {
    flex: 0 0 auto;
    font-variant-numeric: tabular-nums;
  }

  .mobile-folder-form__actions {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1.6fr);
    gap: 10px;
  }

  .mobile-folder-form__button {
    width: 100%;
    min-height: 44px;
    height: 44px;
    border-radius: var(--mobile-control-radius, 10px);
  }

  html.light-note-mobile-rendering .mobile-cloud-actions__item:active,
  html.light-note-mobile-rendering .mobile-folder-form :deep(.b-input:focus-visible) {
    border-color: var(--resource-file-color, #ff8a00) !important;
  }
</style>
