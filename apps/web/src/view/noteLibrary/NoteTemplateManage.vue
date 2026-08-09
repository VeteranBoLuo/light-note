<template>
  <ResourcePageShell
    :title="t('note.templateManager.title')"
    :subtitle="t('note.templateManager.subtitle')"
    accent="note"
    layout="workspace"
    show-back
    compact-mobile-heading
    :show-header="!bookmark.isMobile"
    @back="goBack"
  >
    <template #meta>
      <BChip tone="note">{{
        t('note.templateManager.count', { count: templates.length, limit: NOTE_TEMPLATE_LIMIT })
      }}</BChip>
    </template>
    <template #actions>
      <BButton type="primary" :disabled="limitReached" @click="openCreateDialog">
        <SvgIcon :src="icon.common.add" size="16" aria-hidden="true" />
        {{ t('note.templateManager.create') }}
      </BButton>
    </template>

    <div class="note-template-manager" :class="{ 'is-mobile': bookmark.isMobile }">
      <NoteTemplateList
        v-if="!bookmark.isMobile || mobilePane === 'list'"
        :templates="templates"
        :active-id="activeId"
        :loading="listLoading"
        :error="listError"
        :mobile="bookmark.isMobile"
        @select="selectTemplate"
        @retry="loadTemplates(activeId)"
      />

      <main v-if="!bookmark.isMobile || mobilePane !== 'list'" class="note-template-manager__main">
        <template v-if="editing">
          <NoteTemplateEdit
            ref="editorRef"
            :key="editKey"
            :template="editingNew ? null : activeTemplate"
            :initial-type="newTemplateType"
            :saving="saving"
            :mobile="bookmark.isMobile"
            @save="saveTemplate"
            @cancel="cancelEditing"
            @dirty-change="editDirty = $event"
          />
        </template>
        <template v-else>
          <div v-if="activeTemplate && !detailLoading && !detailError" class="note-template-manager__action-bar">
            <div class="note-template-manager__action-copy">
              <strong>{{ activeTemplate.name }}</strong>
              <span>{{ t('note.templateManager.usage') }}</span>
            </div>
            <div v-if="!bookmark.isMobile" class="note-template-manager__desktop-actions">
              <BButton @click="startEdit">
                <SvgIcon :src="icon.card_edit" size="15" aria-hidden="true" />
                {{ t('common.edit') }}
              </BButton>
              <BButton :loading="duplicating" :disabled="limitReached" @click="duplicateActive">
                <SvgIcon :src="icon.noteDetail.toolbar.copy" size="15" aria-hidden="true" />
                {{ t('note.templateManager.duplicate') }}
              </BButton>
              <BButton type="danger" @click="confirmDeleteActive">
                <SvgIcon :src="icon.noteDetail.delete" size="15" aria-hidden="true" />
                {{ t('common.delete') }}
              </BButton>
              <BButton type="primary" @click="useActiveTemplate">{{ t('note.templateManager.use') }}</BButton>
            </div>
          </div>
          <NoteTemplatePreview
            v-if="activeId"
            :template="activeTemplate"
            :loading="detailLoading"
            :error="detailError"
            @retry="loadTemplateDetail(activeId)"
          />
          <div v-else class="note-template-manager__empty">
            <span class="note-template-manager__empty-icon">
              <SvgIcon :src="icon.noteDetail.template" size="28" aria-hidden="true" />
            </span>
            <strong>{{ t('note.templateManager.emptyTitle') }}</strong>
            <p>{{ t('note.templateManager.emptyHint') }}</p>
            <BButton type="primary" :disabled="limitReached" @click="openCreateDialog">
              {{ t('note.templateManager.create') }}
            </BButton>
          </div>
          <MobileStickyActionBar v-if="bookmark.isMobile && activeTemplate && !detailLoading" :above-navigation="false">
            <BButton @click="mobileActionsOpen = true">
              <SvgIcon :src="icon.common.more" size="16" aria-hidden="true" />
              {{ t('common.more') }}
            </BButton>
            <BButton type="primary" @click="useActiveTemplate">{{ t('note.templateManager.use') }}</BButton>
          </MobileStickyActionBar>
        </template>
      </main>
    </div>

    <BModal
      v-model:visible="createDialogVisible"
      :title="t('note.templateManager.createTitle')"
      :show-footer="false"
      width="min(500px, calc(100vw - 24px))"
    >
      <div class="note-template-create-dialog">
        <p>{{ t('note.templateManager.createHint') }}</p>
        <div>
          <BButton class="note-template-create-dialog__choice" @click="createTemplate('html')">
            <span><SvgIcon :src="icon.resource.noteHtml" size="22" aria-hidden="true" /></span>
            <strong>{{ t('note.templateManager.createHtml') }}</strong>
            <small>{{ t('note.htmlCompactDesc') }}</small>
          </BButton>
          <BButton class="note-template-create-dialog__choice" @click="createTemplate('markdown')">
            <span><SvgIcon :src="icon.resource.noteMarkdown" size="22" aria-hidden="true" /></span>
            <strong>{{ t('note.templateManager.createMarkdown') }}</strong>
            <small>{{ t('note.mdCompactDesc') }}</small>
          </BButton>
        </div>
      </div>
    </BModal>

    <BModal
      v-model:visible="conflictVisible"
      :title="t('note.templateManager.conflictTitle')"
      :show-footer="false"
      :mask-closable="false"
      width="min(520px, calc(100vw - 24px))"
    >
      <div class="note-template-conflict">
        <p>{{ t('note.templateManager.conflictDescription') }}</p>
        <div>
          <BButton @click="conflictVisible = false">{{ t('common.cancel') }}</BButton>
          <BButton @click="loadLatestAfterConflict">{{ t('note.templateManager.loadLatest') }}</BButton>
          <BButton type="primary" :loading="savingCopy" :disabled="limitReached" @click="saveConflictCopy">
            {{ t('note.templateManager.saveCopy') }}
          </BButton>
        </div>
      </div>
    </BModal>

    <MobilePageActionsDrawer
      v-if="bookmark.isMobile"
      v-model:open="mobileActionsOpen"
      :object-title="activeTemplate?.name || t('common.more')"
      :actions="mobileActions"
      @action="handleMobileAction"
    />
  </ResourcePageShell>
</template>

<script setup lang="ts">
  import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
  import { onBeforeRouteLeave, useRoute, useRouter, type RouteLocationNormalized } from 'vue-router';
  import { useI18n } from 'vue-i18n';
  import Alert from '@/components/base/BasicComponents/BModal/Alert';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BChip from '@/components/base/BasicComponents/BChip.vue';
  import BModal from '@/components/base/BasicComponents/BModal/BModal.vue';
  import message from '@/components/base/BasicComponents/BMessage/BMessage';
  import ResourcePageShell from '@/components/base/ResourcePageShell.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import MobilePageActionsDrawer, { type MobilePageActionItem } from '@/components/mobile/MobilePageActionsDrawer.vue';
  import MobileStickyActionBar from '@/components/mobile/MobileStickyActionBar.vue';
  import NoteTemplateEdit from '@/components/noteLibrary/template/NoteTemplateEdit.vue';
  import NoteTemplateList from '@/components/noteLibrary/template/NoteTemplateList.vue';
  import NoteTemplatePreview from '@/components/noteLibrary/template/NoteTemplatePreview.vue';
  import {
    addNoteTemplate,
    deleteNoteTemplate,
    duplicateNoteTemplate,
    getNoteTemplateDetail,
    queryNoteTemplates,
    updateNoteTemplate,
  } from '@/api/noteTemplate';
  import { useMobileTopBar } from '@/composables/useMobileTopBar';
  import { blockGuestWrite } from '@/composables/useGuestGuard';
  import icon from '@/config/icon';
  import { bookmarkStore } from '@/store';
  import {
    NOTE_TEMPLATE_LIMIT,
    type NoteTemplateDetail,
    type NoteTemplateSummary,
    type NoteTemplateType,
    type NoteTemplateWritePayload,
  } from '@/types/noteTemplate';

  const { t } = useI18n();
  const route = useRoute();
  const router = useRouter();
  const bookmark = bookmarkStore();
  const templates = ref<NoteTemplateSummary[]>([]);
  const listLoading = ref(false);
  const listError = ref(false);
  const activeId = ref('');
  const activeTemplate = ref<NoteTemplateDetail | null>(null);
  const detailLoading = ref(false);
  const detailError = ref(false);
  const editing = ref(false);
  const editingNew = ref(false);
  const editDirty = ref(false);
  const editKey = ref(0);
  const newTemplateType = ref<NoteTemplateType>('html');
  const saving = ref(false);
  const duplicating = ref(false);
  const savingCopy = ref(false);
  const createDialogVisible = ref(false);
  const conflictVisible = ref(false);
  const conflictDraft = ref<NoteTemplateWritePayload | null>(null);
  const mobileActionsOpen = ref(false);
  const mobilePane = ref<'list' | 'detail'>('list');
  const editorRef = ref<{ resetBaseline: () => void } | null>(null);
  const limitReached = computed(() => templates.value.length >= NOTE_TEMPLATE_LIMIT);
  const mobileActions = computed<MobilePageActionItem[]>(() => [
    { key: 'edit', label: t('common.edit'), icon: icon.card_edit },
    {
      key: 'duplicate',
      label: t('note.templateManager.duplicate'),
      icon: icon.noteDetail.toolbar.copy,
      disabled: limitReached.value,
      loading: duplicating.value,
    },
    { key: 'delete', label: t('common.delete'), icon: icon.noteDetail.delete, danger: true, dividerBefore: true },
  ]);
  let listRequest = 0;
  let detailRequest = 0;
  let allowRouteLeave = false;

  function queryTemplateId() {
    const value = route.query.template;
    return Array.isArray(value) ? String(value[0] || '') : String(value || '');
  }
  function syncRouteTemplate(id: string) {
    const nextQuery = { ...route.query };
    if (id) nextQuery.template = id;
    else delete nextQuery.template;
    void router.replace({ path: route.path, query: nextQuery });
  }
  async function loadTemplates(preferredId = '') {
    const request = ++listRequest;
    listLoading.value = true;
    listError.value = false;
    try {
      const result = await queryNoteTemplates();
      if (request !== listRequest) return;
      if (result.status !== 200 || !Array.isArray(result.data)) {
        listError.value = true;
        return;
      }
      templates.value = result.data;
      const routeId = queryTemplateId();
      const nextId = [preferredId, routeId, activeId.value, !bookmark.isMobile ? result.data[0]?.id : ''].find(
        (id) => id && result.data.some((item) => item.id === id),
      );
      if (nextId) await selectTemplate(String(nextId), false);
      else if (activeId.value && !result.data.some((item) => item.id === activeId.value)) clearSelection();
    } catch {
      if (request === listRequest) listError.value = true;
    } finally {
      if (request === listRequest) listLoading.value = false;
    }
  }
  async function loadTemplateDetail(id: string) {
    if (!id) return;
    const request = ++detailRequest;
    detailLoading.value = true;
    detailError.value = false;
    activeTemplate.value = null;
    try {
      const result = await getNoteTemplateDetail(id);
      if (request !== detailRequest) return;
      if (result.status !== 200 || !result.data) {
        detailError.value = true;
        return;
      }
      activeTemplate.value = result.data;
    } catch {
      if (request === detailRequest) detailError.value = true;
    } finally {
      if (request === detailRequest) detailLoading.value = false;
    }
  }
  function clearSelection() {
    activeId.value = '';
    activeTemplate.value = null;
    detailError.value = false;
    syncRouteTemplate('');
    if (bookmark.isMobile) mobilePane.value = 'list';
  }
  async function performSelectTemplate(id: string, syncRoute = true) {
    editing.value = false;
    editingNew.value = false;
    editDirty.value = false;
    activeId.value = id;
    if (syncRoute) syncRouteTemplate(id);
    if (bookmark.isMobile) mobilePane.value = 'detail';
    await loadTemplateDetail(id);
  }
  async function selectTemplate(id: string, syncRoute = true) {
    if (!id || (id === activeId.value && activeTemplate.value && !editing.value)) {
      if (bookmark.isMobile && id) mobilePane.value = 'detail';
      return;
    }
    if (editing.value && editDirty.value) {
      confirmDiscard(() => void performSelectTemplate(id, syncRoute));
      return;
    }
    await performSelectTemplate(id, syncRoute);
  }
  function openCreateDialog() {
    if (blockGuestWrite('add-note-template')) return;
    if (limitReached.value) return void message.warning(t('note.templateManager.limitReached'));
    createDialogVisible.value = true;
  }
  function createTemplate(type: NoteTemplateType) {
    createDialogVisible.value = false;
    newTemplateType.value = type;
    editingNew.value = true;
    editing.value = true;
    activeId.value = '';
    activeTemplate.value = null;
    editDirty.value = false;
    editKey.value += 1;
    syncRouteTemplate('');
    if (bookmark.isMobile) mobilePane.value = 'detail';
  }
  function startEdit() {
    if (!activeTemplate.value || blockGuestWrite('update-note-template')) return;
    editingNew.value = false;
    editing.value = true;
    editDirty.value = false;
    editKey.value += 1;
  }
  function cancelEditing() {
    const finish = () => {
      editing.value = false;
      editDirty.value = false;
      if (editingNew.value) {
        editingNew.value = false;
        if (bookmark.isMobile) mobilePane.value = 'list';
        if (!bookmark.isMobile && templates.value[0]) void selectTemplate(templates.value[0].id);
      }
    };
    if (editDirty.value) confirmDiscard(finish);
    else finish();
  }
  async function saveTemplate(payload: NoteTemplateWritePayload) {
    if (saving.value || blockGuestWrite(editingNew.value ? 'add-note-template' : 'update-note-template')) return;
    saving.value = true;
    try {
      if (editingNew.value) {
        const result = await addNoteTemplate(payload);
        if (result.status !== 200 || !result.data?.id)
          return void message.error(result.msg || t('common.requestFailed'));
        const createdId = result.data.id;
        message.success(t('note.templateManager.saved'));
        editingNew.value = false;
        activeId.value = createdId;
        syncRouteTemplate(createdId);
        await loadTemplates(createdId);
        editing.value = true;
        editKey.value += 1;
        editDirty.value = false;
        return;
      }
      if (!activeTemplate.value) return;
      const result = await updateNoteTemplate(activeTemplate.value.id, activeTemplate.value.revision, payload);
      if (result.status === 409 && result.data?.code === 'NOTE_TEMPLATE_VERSION_CONFLICT') {
        conflictDraft.value = payload;
        conflictVisible.value = true;
        return;
      }
      if (result.status !== 200 || !result.data) return void message.error(result.msg || t('common.requestFailed'));
      activeTemplate.value = { ...activeTemplate.value, ...result.data };
      templates.value = templates.value.map((item) =>
        item.id === result.data.id ? { ...item, ...result.data } : item,
      );
      editorRef.value?.resetBaseline();
      editDirty.value = false;
      message.success(t('note.templateManager.savedRevision', { revision: result.data.revision }));
    } catch {
      message.error(t('note.templateManager.updateFailed'));
    } finally {
      saving.value = false;
    }
  }
  async function duplicateActive() {
    const id = activeTemplate.value?.id;
    if (!id || duplicating.value || blockGuestWrite('duplicate-note-template')) return;
    if (limitReached.value) return void message.warning(t('note.templateManager.limitReached'));
    duplicating.value = true;
    try {
      const result = await duplicateNoteTemplate(id);
      if (result.status !== 200 || !result.data?.id) return void message.error(result.msg || t('common.requestFailed'));
      message.success(t('note.templateManager.duplicated'));
      await loadTemplates(result.data.id);
      if (bookmark.isMobile) mobilePane.value = 'detail';
    } catch {
      message.error(t('note.templateManager.duplicateFailed'));
    } finally {
      duplicating.value = false;
    }
  }
  function confirmDeleteActive() {
    const template = activeTemplate.value;
    if (!template || blockGuestWrite('delete-note-template')) return;
    Alert.alert({
      title: t('note.templateManager.deleteTitle'),
      okText: t('common.delete'),
      okType: 'danger',
      content: t('note.templateManager.deleteConfirm', { name: template.name }),
      onOk: () => void deleteActive(template.id),
    });
  }
  async function deleteActive(id: string) {
    try {
      const index = templates.value.findIndex((item) => item.id === id);
      const result = await deleteNoteTemplate(id);
      if (result.status !== 200) return void message.error(result.msg || t('common.requestFailed'));
      message.success(t('note.templateManager.deleted'));
      const nextId = templates.value[index + 1]?.id || templates.value[index - 1]?.id || '';
      templates.value = templates.value.filter((item) => item.id !== id);
      if (nextId && !bookmark.isMobile) await selectTemplate(nextId);
      else clearSelection();
    } catch {
      message.error(t('note.templateManager.deleteFailed'));
    }
  }
  function useActiveTemplate() {
    const template = activeTemplate.value;
    if (!template || blockGuestWrite('add-note')) return;
    allowRouteLeave = true;
    void router.push({ path: '/noteLibrary/add', query: { type: template.type, templateId: template.id } });
  }
  function loadLatestAfterConflict() {
    conflictVisible.value = false;
    conflictDraft.value = null;
    editing.value = false;
    editDirty.value = false;
    if (activeId.value) void loadTemplateDetail(activeId.value);
  }
  async function saveConflictCopy() {
    const payload = conflictDraft.value;
    if (!payload || savingCopy.value || limitReached.value) return;
    savingCopy.value = true;
    try {
      const suffix = t('note.templateManager.copySuffix');
      const name = `${payload.name.slice(0, Math.max(1, 60 - suffix.length))}${suffix}`;
      const result = await addNoteTemplate({ ...payload, name });
      if (result.status !== 200 || !result.data?.id) return void message.error(result.msg || t('common.requestFailed'));
      conflictVisible.value = false;
      conflictDraft.value = null;
      editing.value = false;
      editDirty.value = false;
      message.success(t('note.templateManager.copySaved'));
      await loadTemplates(result.data.id);
    } catch {
      message.error(t('note.templateManager.createFailed'));
    } finally {
      savingCopy.value = false;
    }
  }
  function confirmDiscard(action: () => void) {
    Alert.alert({
      title: t('note.templateManager.discardTitle'),
      okText: t('note.templateManager.discard'),
      okType: 'danger',
      content: t('note.templateManager.discardDescription'),
      onOk: action,
    });
  }
  function goBack() {
    if (bookmark.isMobile && mobilePane.value === 'detail') {
      if (editing.value) return cancelEditing();
      mobilePane.value = 'list';
      activeId.value = '';
      activeTemplate.value = null;
      syncRouteTemplate('');
      return;
    }
    allowRouteLeave = true;
    void router.push('/noteLibrary');
  }
  function handleMobileAction(action: MobilePageActionItem) {
    if (action.key === 'edit') startEdit();
    if (action.key === 'duplicate') void duplicateActive();
    if (action.key === 'delete') confirmDeleteActive();
  }
  function beforeUnload(event: BeforeUnloadEvent) {
    if (!editing.value || !editDirty.value) return;
    event.preventDefault();
    event.returnValue = '';
  }
  function resumeNavigation(to: RouteLocationNormalized) {
    allowRouteLeave = true;
    void router.push(to.fullPath);
  }

  useMobileTopBar(['noteTemplateManage'], {
    title: () => t('note.templateManager.title'),
    onBack: goBack,
    searchMode: 'icon',
    onAdd: openCreateDialog,
    addLabel: () => t('note.templateManager.create'),
    showNotification: false,
  });
  onBeforeRouteLeave((to) => {
    if (allowRouteLeave || !editing.value || !editDirty.value) return true;
    confirmDiscard(() => resumeNavigation(to));
    return false;
  });
  watch(
    () => route.query.template,
    () => {
      const id = queryTemplateId();
      if (id && id !== activeId.value && templates.value.some((item) => item.id === id)) void selectTemplate(id, false);
    },
  );
  onMounted(() => {
    window.addEventListener('beforeunload', beforeUnload);
    void loadTemplates(queryTemplateId());
  });
  onBeforeUnmount(() => window.removeEventListener('beforeunload', beforeUnload));
</script>

<style scoped lang="less">
  .note-template-manager {
    width: 100%;
    min-height: 0;
    height: 100%;
    display: flex;
    overflow: hidden;
    border: 1px solid var(--surface-border-color);
    border-radius: 16px;
    background: var(--workspace-panel-bg-color);
    box-shadow: var(--surface-card-shadow);
  }
  .note-template-manager__main {
    min-width: 0;
    min-height: 0;
    position: relative;
    display: flex;
    flex: 1 1 auto;
    flex-direction: column;
    overflow: hidden;
  }
  .note-template-manager__action-bar {
    min-height: 58px;
    box-sizing: border-box;
    display: flex;
    flex: 0 0 auto;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    padding: 9px 16px;
    border-bottom: 1px solid var(--surface-border-color);
    background: var(--card-background);
  }
  .note-template-manager__action-copy {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .note-template-manager__action-copy strong {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .note-template-manager__action-copy span {
    color: var(--desc-color);
    font-size: 11px;
  }
  .note-template-manager__desktop-actions {
    display: flex;
    flex: 0 0 auto;
    align-items: center;
    gap: 8px;
  }
  .note-template-manager__desktop-actions :deep(.b_btn) {
    gap: 6px;
  }
  .note-template-manager__empty {
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-direction: column;
    gap: 10px;
    padding: 24px;
    color: var(--desc-color);
    text-align: center;
  }
  .note-template-manager__empty strong {
    color: var(--text-color);
    font-size: 17px;
  }
  .note-template-manager__empty p {
    max-width: 400px;
    margin: 0 0 6px;
    line-height: 1.6;
  }
  .note-template-manager__empty-icon {
    width: 52px;
    height: 52px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border: 1px solid var(--resource-note-color);
    border-radius: 15px;
    color: var(--resource-note-color);
    background: var(--mobile-selected-bg);
  }
  .note-template-create-dialog > p,
  .note-template-conflict > p {
    margin: 0 0 16px;
    color: var(--desc-color);
    line-height: 1.6;
  }
  .note-template-create-dialog > div {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
  }
  .note-template-create-dialog__choice {
    width: 100%;
    height: auto;
    min-height: 130px;
    display: flex;
    flex-direction: column;
    gap: 7px;
    padding: 16px;
    border: 1px solid var(--surface-border-color) !important;
    background: var(--card-background);
    white-space: normal;
  }
  .note-template-create-dialog__choice > span {
    width: 42px;
    height: 42px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border: 1px solid var(--resource-note-color);
    border-radius: 12px;
    color: var(--resource-note-color);
  }
  .note-template-create-dialog__choice small {
    color: var(--desc-color);
    line-height: 1.5;
  }
  .note-template-conflict > div {
    display: flex;
    justify-content: flex-end;
    gap: 9px;
  }
  @media (max-width: 767px) {
    .note-template-manager {
      border: 0;
      border-radius: 0;
      background: transparent;
      box-shadow: none;
    }
    .note-template-manager__action-bar {
      min-height: 52px;
      padding-inline: var(--mobile-page-gutter, 14px);
    }
    .note-template-manager__main {
      width: 100%;
    }
    .note-template-create-dialog > div {
      grid-template-columns: 1fr;
    }
    .note-template-create-dialog__choice {
      min-height: 100px;
    }
    .note-template-conflict > div {
      flex-wrap: wrap;
    }
  }
</style>
