<template>
  <main class="document-project-editor">
    <BLoading
      v-if="loading"
      class="document-project-editor__center"
      inline
      loading
      :title="t('toolboxProject.editor.loading')"
    />
    <section v-else-if="loadError" class="document-project-editor__center is-error" role="alert">
      <SvgIcon :src="icon.toolbox.task" size="28" />
      <strong>{{ t('toolboxProject.editor.loadFailed') }}</strong>
      <span>{{ t('toolboxProject.editor.loadFailedHint') }}</span>
      <div class="document-project-editor__error-actions">
        <BButton @click="router.push({ name: 'toolboxDocumentProjects' })">{{ t('toolboxProject.back') }}</BButton>
        <BButton type="primary" @click="loadProject">{{ t('common.retry') }}</BButton>
      </div>
    </section>
    <template v-else-if="project">
      <header class="project-editor-toolbar">
        <BButton class="project-editor-toolbar__back" :aria-label="t('toolboxProject.back')" @click="goBack">
          <SvgIcon :src="icon.toolbox.back" size="18" />
        </BButton>
        <BInput
          v-model:value="draftTitle"
          class="project-editor-toolbar__title"
          :maxlength="120"
          :placeholder="t('toolboxProject.untitled')"
        />
        <BChip :tone="saveTone" class="project-editor-toolbar__state">{{ saveLabel }}</BChip>
        <div class="project-editor-toolbar__actions">
          <BButton v-if="saveState === 'conflict'" size="small" @click="confirmReloadLatest">
            {{ t('toolboxProject.editor.reloadLatest') }}
          </BButton>
          <BButton v-else-if="saveState === 'failed'" size="small" @click="saveNow">
            {{ t('common.retry') }}
          </BButton>
          <BPopover
            v-model:open="exportOpen"
            trigger="click"
            placement="bottom-right"
            overlay-class-name="document-project-export-menu"
          >
            <BButton size="small" :loading="exportingFormat !== null">
              <SvgIcon :src="icon.noteDetail.exportLine" size="15" />{{ t('toolboxProject.export.button') }}
            </BButton>
            <template #content>
              <div class="document-project-export-menu__list" role="menu">
                <BButton
                  v-for="format in exportFormats"
                  :key="format"
                  class="document-project-export-menu__item"
                  :loading="exportingFormat === format"
                  :disabled="exportingFormat !== null"
                  role="menuitem"
                  @click="exportDocument(format)"
                >
                  <strong>{{ t(`toolboxProject.export.formats.${format}`) }}</strong>
                  <small>{{ t(`toolboxProject.export.hints.${format}`) }}</small>
                </BButton>
              </div>
            </template>
          </BPopover>
          <BButton v-if="isMobileLayout" size="small" @click="outlineOpen = true">
            {{ t('toolboxProject.outline.title') }}
          </BButton>
          <BButton v-if="isMobileLayout" size="small" @click="versionsOpen = true">
            <SvgIcon :src="icon.noteDetail.history" size="15" />{{ t('toolboxProject.versions.title') }}
          </BButton>
          <BButton
            type="primary"
            size="small"
            :loading="saveState === 'saving'"
            :disabled="saveState === 'conflict'"
            @click="saveNow"
          >
            <SvgIcon :src="icon.noteDetail.saveLine" size="15" />{{ t('toolboxProject.editor.save') }}
          </BButton>
        </div>
      </header>

      <section class="project-editor-legacy-notice" role="status">
        <SvgIcon :src="icon.toolbox.materialNote" size="18" />
        <span>
          <strong>{{ t('toolboxProject.editor.legacyTitle') }}</strong>
          <small>{{ t('toolboxProject.editor.legacyDescription') }}</small>
        </span>
        <BButton size="small" @click="router.push({ name: 'noteLibrary' })">
          {{ t('toolboxProject.list.openNoteLibrary') }}
        </BButton>
      </section>

      <div class="project-editor-layout">
        <aside v-if="!isMobileLayout" class="project-editor-outline">
          <header>
            <strong>{{ t('toolboxProject.outline.title') }}</strong>
            <small>{{ outlineItems.length }}</small>
          </header>
          <ToolboxDocumentOutline :items="outlineItems" :active-id="activeOutlineId" @select="selectOutline" />
        </aside>
        <section
          class="project-editor-canvas"
          :class="{ 'has-draft-warning': !localDraftProtected }"
          :aria-label="t('toolboxProject.editor.bodyLabel')"
        >
          <div v-if="!localDraftProtected" class="project-editor-draft-warning" role="alert">
            <div>
              <strong>{{ t('toolboxProject.editor.draftUnprotectedTitle') }}</strong>
              <span>{{ t('toolboxProject.editor.draftUnprotectedDescription') }}</span>
            </div>
            <BButton size="small" @click="exportOpen = true">
              <SvgIcon :src="icon.noteDetail.exportLine" size="15" />
              {{ t('toolboxProject.editor.exportDraft') }}
            </BButton>
          </div>
          <MarkdownCodeMirror
            ref="markdownEditorRef"
            v-model="draftContent"
            class="project-editor-markdown"
            :mobile="isMobileLayout"
            :locale="locale"
            :placeholder="t('toolboxProject.editor.placeholder')"
          />
          <footer class="project-editor-footer">
            <span>{{ t('toolboxProject.editor.autosaveHint') }}</span>
            <span>{{ t('toolboxProject.editor.characters', { count: draftContent.length }) }}</span>
          </footer>
        </section>

        <aside v-if="!isMobileLayout" class="project-editor-versions">
          <header>
            <SvgIcon :src="icon.noteDetail.history" size="18" />
            <strong>{{ t('toolboxProject.versions.title') }}</strong>
          </header>
          <ToolboxProjectVersions
            :items="revisions"
            :loading="versionsLoading"
            :has-more="Boolean(versionsCursor)"
            :loading-more="versionsLoadingMore"
            :error="versionsError"
            :naming="namingVersion"
            :current-revision="project.currentRevision"
            :restoring-revision="restoringRevision"
            @retry="loadVersions()"
            @load-more="loadMoreVersions"
            @name="createNamedVersion"
            @restore="confirmRestore"
          />
        </aside>
      </div>

      <BDrawer
        v-if="isMobileLayout"
        :open="outlineOpen"
        :title="t('toolboxProject.outline.title')"
        width="100%"
        mobile-full-screen
        mobile-centered-header
        body-padding="16px"
        @close="outlineOpen = false"
      >
        <ToolboxDocumentOutline
          :items="outlineItems"
          :active-id="activeOutlineId"
          :contained-scroll="false"
          @select="selectOutline"
        />
      </BDrawer>

      <BDrawer
        v-if="isMobileLayout"
        :open="versionsOpen"
        :title="t('toolboxProject.versions.title')"
        width="100%"
        mobile-full-screen
        mobile-centered-header
        body-padding="16px"
        @close="versionsOpen = false"
      >
        <ToolboxProjectVersions
          :items="revisions"
          :loading="versionsLoading"
          :has-more="Boolean(versionsCursor)"
          :loading-more="versionsLoadingMore"
          :error="versionsError"
          :naming="namingVersion"
          :current-revision="project.currentRevision"
          :restoring-revision="restoringRevision"
          @retry="loadVersions()"
          @load-more="loadMoreVersions"
          @name="createNamedVersion"
          @restore="confirmRestore"
        />
      </BDrawer>
    </template>
  </main>
</template>

<script setup lang="ts">
  import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
  import { onBeforeRouteLeave, useRoute, useRouter } from 'vue-router';
  import { useI18n } from 'vue-i18n';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BChip from '@/components/base/BasicComponents/BChip.vue';
  import BDrawer from '@/components/base/BasicComponents/BDrawer.vue';
  import BInput from '@/components/base/BasicComponents/BInput.vue';
  import BLoading from '@/components/base/BasicComponents/BLoading.vue';
  import BPopover from '@/components/base/BasicComponents/BPopover.vue';
  import message from '@/components/base/BasicComponents/BMessage/BMessage';
  import Alert from '@/components/base/BasicComponents/BModal/Alert';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import MarkdownCodeMirror, {
    type MarkdownCodeMirrorExpose,
  } from '@/components/noteLibrary/detail/MarkdownCodeMirror.vue';
  import { useMobileLayout } from '@/composables/useMobileLayout';
  import { useUserStore } from '@/store';
  import icon from '@/config/icon';
  import { downloadToolboxBlob } from '@/utils/toolboxLocal';
  import {
    exportProductionDocumentDocx,
    exportProductionDocumentHtml,
    exportProductionDocumentMarkdown,
    exportProductionDocumentPdf,
  } from '@/utils/productionProjectDocumentExport';
  import {
    buildProductionDocumentOutline,
    type ProductionDocumentOutlineItem,
  } from '@/utils/productionDocumentOutline';
  import ToolboxDocumentOutline from './components/ToolboxDocumentOutline.vue';
  import ToolboxProjectVersions from './components/ToolboxProjectVersions.vue';
  import {
    readProductionProjectDraft,
    removeProductionProjectDraft,
    replaceProductionProjectWithLatest,
    shouldOfferProductionProjectDraftRecovery,
    writeProductionProjectDraft,
    type ProductionProjectLocalDraft,
  } from '@/utils/productionProjectDraftRecovery';
  import {
    createToolboxProjectClientRequestId,
    createToolboxDocumentContent,
    fetchToolboxProject,
    fetchToolboxProjectRevisionsPage,
    isToolboxProjectConflict,
    openToolboxProject,
    restoreToolboxProjectRevision,
    saveToolboxProjectRevision,
    updateToolboxProject,
    type ToolboxDocumentContent,
    type ToolboxProjectDetail,
    type ToolboxProjectRevisionSummary,
    type ToolboxProjectSummary,
  } from '@/api/toolboxProjects';

  type SaveState = 'idle' | 'dirty' | 'saving' | 'saved' | 'failed' | 'conflict';
  type DocumentExportFormat = 'markdown' | 'html' | 'docx' | 'pdf';

  const { t, locale } = useI18n();
  const route = useRoute();
  const router = useRouter();
  const user = useUserStore();
  const isMobileLayout = useMobileLayout();
  const loading = ref(true);
  const loadError = ref(false);
  const project = ref<ToolboxProjectSummary | null>(null);
  const draftTitle = ref('');
  const draftContent = ref('');
  const savedTitle = ref('');
  const savedContent = ref('');
  const hydrated = ref(false);
  const saveState = ref<SaveState>('idle');
  const revisions = ref<ToolboxProjectRevisionSummary[]>([]);
  const versionsLoading = ref(false);
  const versionsLoadingMore = ref(false);
  const versionsCursor = ref<string | null>(null);
  const versionsError = ref(false);
  const versionsOpen = ref(false);
  const outlineOpen = ref(false);
  const activeOutlineId = ref('');
  const markdownEditorRef = ref<MarkdownCodeMirrorExpose | null>(null);
  const namingVersion = ref(false);
  const restoringRevision = ref<number | null>(null);
  const exportOpen = ref(false);
  const exportingFormat = ref<DocumentExportFormat | null>(null);
  const draftRecoveryPending = ref(false);
  const localDraftProtected = ref(true);
  const localDraftBaseVersion = ref<number | null>(null);
  const exportFormats: DocumentExportFormat[] = ['markdown', 'html', 'docx', 'pdf'];
  let autosaveTimer: number | null = null;
  let activeSave: Promise<boolean> | null = null;

  const projectId = computed(() => String(route.params.projectId || ''));
  const draftOwnerId = computed(() => String(user.id || '').trim());
  const dirty = computed(() => draftTitle.value !== savedTitle.value || draftContent.value !== savedContent.value);
  const hasUnsavedDraft = computed(() => dirty.value || saveState.value === 'failed' || saveState.value === 'conflict');
  const outlineItems = computed(() => buildProductionDocumentOutline(draftContent.value));
  const saveTone = computed(() => {
    if (saveState.value === 'failed' || saveState.value === 'conflict') return 'danger' as const;
    if (saveState.value === 'saved') return 'success' as const;
    if (saveState.value === 'saving' || saveState.value === 'dirty') return 'pending' as const;
    return 'neutral' as const;
  });
  const saveLabel = computed(() => t(`toolboxProject.editor.state.${saveState.value}`));

  function documentValue(detail: ToolboxProjectDetail) {
    const content = detail.revision.content as ToolboxDocumentContent;
    return content?.type === 'document' && content.body?.format === 'markdown' ? content.body.value : '';
  }

  function clearAutosave() {
    if (autosaveTimer === null) return;
    window.clearTimeout(autosaveTimer);
    autosaveTimer = null;
  }

  function readLocalDraft() {
    return readProductionProjectDraft<ToolboxDocumentContent>(
      window.localStorage,
      draftOwnerId.value,
      'document',
      projectId.value,
    );
  }

  function persistLocalDraft() {
    if (!hydrated.value || draftRecoveryPending.value || !project.value) return localDraftProtected.value;
    const protectedSuccessfully = writeProductionProjectDraft(window.localStorage, draftOwnerId.value, {
      projectType: 'document',
      projectId: projectId.value,
      title: draftTitle.value,
      content: createToolboxDocumentContent(draftContent.value),
      baseVersion: localDraftBaseVersion.value ?? project.value.version,
      serverUpdatedAt: project.value.updatedAt,
      updatedAt: Date.now(),
    });
    localDraftProtected.value = protectedSuccessfully;
    return protectedSuccessfully;
  }

  function clearLocalDraft() {
    removeProductionProjectDraft(window.localStorage, draftOwnerId.value, 'document', projectId.value);
    localDraftProtected.value = true;
    localDraftBaseVersion.value = null;
  }

  function offerLocalDraftRecovery(localDraft: ProductionProjectLocalDraft<ToolboxDocumentContent>) {
    draftRecoveryPending.value = true;
    Alert.alert({
      title: t('toolboxProject.editor.recoveryTitle'),
      content: t('toolboxProject.editor.recoveryDescription'),
      okText: t('toolboxProject.editor.recoverDraft'),
      cancelText: t('toolboxProject.editor.ignoreDraft'),
      onOk: () => {
        localDraftBaseVersion.value = localDraft.baseVersion;
        saveState.value = localDraft.baseVersion === project.value?.version ? 'dirty' : 'conflict';
        draftTitle.value = localDraft.title;
        draftContent.value = localDraft.content.body.value;
        draftRecoveryPending.value = false;
        persistLocalDraft();
        if (saveState.value !== 'conflict') scheduleAutosave();
      },
      onCancel: () => {
        clearLocalDraft();
        draftRecoveryPending.value = false;
      },
    });
  }

  function scheduleAutosave() {
    clearAutosave();
    if (!hydrated.value || draftRecoveryPending.value || !dirty.value || saveState.value === 'conflict') return;
    saveState.value = 'dirty';
    autosaveTimer = window.setTimeout(() => {
      autosaveTimer = null;
      void persistRevision('autosave');
    }, 1500);
  }

  function applyProject(detail: ToolboxProjectDetail, replaceDraft: boolean) {
    project.value = detail.project;
    const content = documentValue(detail);
    if (replaceDraft) {
      draftTitle.value = detail.project.title || t('toolboxProject.untitled');
      draftContent.value = content;
    }
    savedTitle.value = replaceDraft ? draftTitle.value : savedTitle.value;
    savedContent.value = replaceDraft ? draftContent.value : savedContent.value;
  }

  async function loadProject() {
    clearAutosave();
    loading.value = true;
    loadError.value = false;
    hydrated.value = false;
    try {
      const detail = await fetchToolboxProject(projectId.value);
      applyProject(detail, true);
      saveState.value = 'saved';
      hydrated.value = true;
      const localDraft = readLocalDraft();
      if (
        shouldOfferProductionProjectDraftRecovery(localDraft, {
          projectType: 'document',
          title: draftTitle.value,
          content: createToolboxDocumentContent(draftContent.value),
          version: detail.project.version,
          updatedAt: detail.project.updatedAt,
        })
      ) {
        offerLocalDraftRecovery(localDraft!);
      } else if (localDraft) {
        clearLocalDraft();
      }
      void openToolboxProject(projectId.value).catch(() => undefined);
      void loadVersions();
    } catch {
      loadError.value = true;
    } finally {
      loading.value = false;
    }
  }

  async function persistRevision(changeKind: 'autosave' | 'named', name?: string): Promise<boolean> {
    clearAutosave();
    if (!project.value) return false;
    if (activeSave) {
      await activeSave;
      if (saveState.value === 'conflict') return false;
    }
    const title = draftTitle.value.trim() || t('toolboxProject.untitled');
    const content = draftContent.value;
    let baseProject = project.value;
    saveState.value = 'saving';
    const titleChanged = title !== savedTitle.value;
    const contentChanged = content !== savedContent.value;
    const request = (async () => {
      if (titleChanged) {
        baseProject = await updateToolboxProject(projectId.value, {
          expectedVersion: baseProject.version,
          title,
        });
        project.value = baseProject;
        savedTitle.value = title;
      }
      if (!contentChanged && changeKind !== 'named') return null;
      return saveToolboxProjectRevision(projectId.value, {
        clientRequestId: createToolboxProjectClientRequestId(
          changeKind === 'named' ? 'document-version' : 'document-save',
        ),
        expectedVersion: baseProject.version,
        expectedRevision: baseProject.currentRevision,
        changeKind,
        label: name,
        content: createToolboxDocumentContent(content),
      });
    })();
    activeSave = request
      .then((detail) => {
        if (detail) {
          project.value = detail.project;
          void loadVersions();
        }
        savedTitle.value = title;
        savedContent.value = content;
        if (draftTitle.value === title && draftContent.value === content) clearLocalDraft();
        else {
          localDraftBaseVersion.value = null;
          persistLocalDraft();
        }
        saveState.value = 'saved';
        return true;
      })
      .catch((error: unknown) => {
        localDraftBaseVersion.value = baseProject.version;
        saveState.value = isToolboxProjectConflict(error) ? 'conflict' : 'failed';
        persistLocalDraft();
        return false;
      })
      .finally(() => {
        activeSave = null;
      });
    const succeeded = await activeSave;
    if (succeeded && dirty.value) scheduleAutosave();
    return succeeded;
  }

  async function saveNow() {
    await persistRevision('autosave');
  }

  function confirmReloadLatest() {
    Alert.alert({
      title: t('toolboxProject.editor.reloadTitle'),
      content: t('toolboxProject.editor.reloadDescription'),
      okText: t('toolboxProject.editor.reloadLatest'),
      cancelText: t('common.cancel'),
      onOk: () => void reloadLatest(),
    });
  }

  async function reloadLatest() {
    const previousSaveState = saveState.value;
    clearAutosave();
    try {
      await replaceProductionProjectWithLatest(
        () => fetchToolboxProject(projectId.value),
        (detail) => applyProject(detail, true),
        clearLocalDraft,
      );
      hydrated.value = true;
      saveState.value = 'saved';
      await loadVersions();
    } catch {
      saveState.value = previousSaveState === 'conflict' ? 'conflict' : 'failed';
      persistLocalDraft();
      message.error(t('toolboxProject.editor.reloadFailed'));
    }
  }

  async function loadVersions({ append = false }: { append?: boolean } = {}) {
    if (append) {
      if (!versionsCursor.value || versionsLoadingMore.value) return;
      versionsLoadingMore.value = true;
    } else {
      versionsLoading.value = true;
      versionsError.value = false;
    }
    try {
      const page = await fetchToolboxProjectRevisionsPage(projectId.value, {
        limit: 30,
        cursor: append ? versionsCursor.value : null,
      });
      if (append) {
        const merged = new Map(revisions.value.map((revision) => [revision.id, revision]));
        page.items.forEach((revision) => merged.set(revision.id, revision));
        revisions.value = [...merged.values()];
      } else {
        revisions.value = page.items;
      }
      versionsCursor.value = page.nextCursor;
    } catch {
      if (append) message.error(t('toolboxProject.versions.loadMoreFailed'));
      else versionsError.value = true;
    } finally {
      if (append) versionsLoadingMore.value = false;
      else versionsLoading.value = false;
    }
  }

  function loadMoreVersions() {
    void loadVersions({ append: true });
  }

  async function createNamedVersion(name: string) {
    namingVersion.value = true;
    const succeeded = await persistRevision('named', name);
    if (succeeded) await loadVersions();
    namingVersion.value = false;
  }

  function confirmRestore(revision: ToolboxProjectRevisionSummary) {
    const createCheckpoint = hasUnsavedDraft.value;
    Alert.alert({
      title: t('toolboxProject.versions.restoreTitle'),
      content: t(
        createCheckpoint ? 'toolboxProject.editor.restoreDirtyDescription' : 'toolboxProject.editor.restoreDescription',
        { number: revision.revision },
      ),
      okText: t('toolboxProject.versions.restore'),
      cancelText: t('common.cancel'),
      onOk: () => void restoreRevision(revision, createCheckpoint),
    });
  }

  async function restoreRevision(revision: ToolboxProjectRevisionSummary, createCheckpoint = false) {
    if (!project.value) return;
    restoringRevision.value = revision.revision;
    clearAutosave();
    try {
      if (createCheckpoint) {
        const checkpointSaved = await persistRevision('named', t('toolboxProject.editor.restoreCheckpointLabel'));
        if (!checkpointSaved) {
          message.error(t('toolboxProject.editor.restoreCheckpointFailed'));
          return;
        }
      }
      const detail = await restoreToolboxProjectRevision(projectId.value, revision.revision, {
        clientRequestId: createToolboxProjectClientRequestId('document-restore'),
        expectedVersion: project.value.version,
        expectedRevision: project.value.currentRevision,
        sourceRevisionId: revision.id,
      });
      applyProject(detail, true);
      clearAutosave();
      saveState.value = 'saved';
      clearLocalDraft();
      await loadVersions();
      versionsOpen.value = false;
    } catch (error) {
      saveState.value = isToolboxProjectConflict(error) ? 'conflict' : 'failed';
      persistLocalDraft();
    } finally {
      restoringRevision.value = null;
    }
  }

  async function exportDocument(format: DocumentExportFormat) {
    if (exportingFormat.value) return;
    exportingFormat.value = format;
    try {
      const content = createToolboxDocumentContent(draftContent.value);
      const title = draftTitle.value || t('toolboxProject.untitled');
      const result =
        format === 'markdown'
          ? await exportProductionDocumentMarkdown(content, title)
          : format === 'html'
            ? await exportProductionDocumentHtml(content, title, locale.value)
            : format === 'docx'
              ? await exportProductionDocumentDocx(content, title)
              : await exportProductionDocumentPdf(content, title, { lang: locale.value });
      downloadToolboxBlob(result.blob, result.fileName);
      exportOpen.value = false;
      message.success(t('toolboxProject.export.success', { format: t(`toolboxProject.export.formats.${format}`) }));
    } catch {
      message.error(t('toolboxProject.export.failed'));
    } finally {
      exportingFormat.value = null;
    }
  }

  function selectOutline(item: ProductionDocumentOutlineItem) {
    activeOutlineId.value = item.id;
    markdownEditorRef.value?.scrollToPosition(item.position, item.selectionEnd);
    outlineOpen.value = false;
  }

  async function goBack() {
    const historyBack = router.options.history.state.back;
    if (typeof historyBack === 'string' && router.resolve(historyBack).name === 'toolboxDocumentProjects') {
      router.back();
      return;
    }
    await router.replace({ name: 'toolboxDocumentProjects' });
  }

  function onBeforeUnload(event: BeforeUnloadEvent) {
    if (!dirty.value && saveState.value !== 'failed' && saveState.value !== 'conflict') return;
    event.preventDefault();
    event.returnValue = '';
  }

  function confirmUnsafeLeave() {
    const draftIsProtected = localDraftProtected.value;
    return new Promise<boolean>((resolve) => {
      Alert.alert({
        title: t('toolboxProject.editor.leaveTitle'),
        content: t(
          draftIsProtected
            ? 'toolboxProject.editor.leaveDescription'
            : 'toolboxProject.editor.leaveUnprotectedDescription',
        ),
        okText: t(
          draftIsProtected ? 'toolboxProject.editor.leaveAnyway' : 'toolboxProject.editor.leaveUnprotectedAnyway',
        ),
        cancelText: t('toolboxProject.editor.keepEditing'),
        onOk: () => resolve(true),
        onCancel: () => resolve(false),
      });
    });
  }

  watch(
    [draftTitle, draftContent],
    () => {
      persistLocalDraft();
      scheduleAutosave();
    },
    { flush: 'sync' },
  );
  watch(outlineItems, (items) => {
    if (activeOutlineId.value && !items.some((item) => item.id === activeOutlineId.value)) {
      activeOutlineId.value = '';
    }
  });
  onMounted(loadProject);
  onMounted(() => window.addEventListener('beforeunload', onBeforeUnload));
  onBeforeUnmount(() => {
    clearAutosave();
    window.removeEventListener('beforeunload', onBeforeUnload);
  });
  onBeforeRouteLeave(async () => {
    clearAutosave();
    if (dirty.value && saveState.value !== 'conflict') await persistRevision('autosave');
    if (dirty.value || saveState.value === 'failed' || saveState.value === 'conflict') {
      persistLocalDraft();
      return confirmUnsafeLeave();
    }
    return true;
  });
</script>

<style scoped lang="less">
  .document-project-editor {
    width: 100%;
    height: 100%;
    min-width: 0;
    min-height: 0;
    display: grid;
    grid-template-rows: auto auto minmax(0, 1fr);
    overflow: hidden;
    color: var(--text-color);
    background: var(--background-color);
  }

  .document-project-editor__center {
    grid-row: 1 / -1;
    align-self: center;
    justify-self: center;
    min-height: 240px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 12px;
    color: var(--desc-color);
    text-align: center;
  }
  .document-project-editor__center strong {
    color: var(--text-color);
    font-size: 18px;
  }
  .document-project-editor__center.is-error > svg {
    color: var(--error-color, #d9363e);
  }
  .document-project-editor__error-actions {
    display: flex;
    gap: 8px;
  }

  .project-editor-toolbar {
    min-width: 0;
    display: grid;
    grid-template-columns: auto minmax(180px, 1fr) auto auto;
    align-items: center;
    gap: 10px;
    padding: 12px 20px;
    border-bottom: 1px solid var(--surface-border-color);
    background: var(--surface-panel-bg, var(--background-color));
  }
  .project-editor-toolbar__back {
    width: 34px;
    padding: 0;
  }
  .project-editor-toolbar__title {
    min-width: 0;
    max-width: 640px;
  }
  .project-editor-toolbar__title :deep(.input-container),
  .project-editor-toolbar__title :deep(.b-input) {
    width: 100%;
  }
  .project-editor-toolbar__actions {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 8px;
  }
  .project-editor-toolbar__actions :deep(.b_btn) {
    gap: 6px;
  }

  .project-editor-legacy-notice {
    min-width: 0;
    padding: 7px 20px;
    display: grid;
    grid-template-columns: 20px minmax(0, 1fr) auto;
    align-items: center;
    gap: 9px;
    border-bottom: 1px solid var(--surface-border-color);
    color: var(--primary-color);
    background: color-mix(in srgb, var(--primary-color) 5%, var(--card-background));
  }
  .project-editor-legacy-notice > span {
    min-width: 0;
    display: flex;
    align-items: baseline;
    gap: 8px;
  }
  .project-editor-legacy-notice strong {
    color: var(--text-color);
    font-size: 12px;
  }
  .project-editor-legacy-notice small {
    overflow: hidden;
    color: var(--desc-color);
    font-size: 10.5px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .project-editor-layout {
    width: min(1440px, 100%);
    min-width: 0;
    min-height: 0;
    margin: 0 auto;
    padding: 18px;
    box-sizing: border-box;
    display: grid;
    grid-template-columns: 220px minmax(0, 1fr) minmax(280px, 340px);
    gap: 16px;
    overflow: hidden;
  }
  .project-editor-outline,
  .project-editor-canvas,
  .project-editor-versions {
    min-width: 0;
    min-height: 0;
    border: 1px solid var(--surface-border-color);
    border-radius: 16px;
    background: var(--surface-panel-bg, var(--background-color));
  }
  .project-editor-outline {
    display: grid;
    grid-template-rows: auto minmax(0, 1fr);
    padding: 14px;
    overflow: hidden;
  }
  .project-editor-outline > header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 2px 2px 12px;
  }
  .project-editor-outline > header small {
    color: var(--desc-color);
  }
  .project-editor-canvas {
    display: grid;
    grid-template-rows: minmax(0, 1fr) auto;
    overflow: hidden;
  }
  .project-editor-canvas.has-draft-warning {
    grid-template-rows: auto minmax(0, 1fr) auto;
  }
  .project-editor-draft-warning {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 10px 12px;
    border-bottom: 1px solid var(--warning-color, #d98600);
    background: var(--warning-background-color, #fff8e8);
    color: var(--text-color);
  }
  .project-editor-draft-warning > div {
    min-width: 0;
    display: grid;
    gap: 2px;
  }
  .project-editor-draft-warning strong {
    color: var(--warning-color, #b86f00);
    font-size: 12px;
  }
  .project-editor-draft-warning span {
    color: var(--desc-color);
    font-size: 11px;
    line-height: 1.45;
  }
  .project-editor-draft-warning :deep(.b_btn) {
    flex: 0 0 auto;
    gap: 5px;
  }
  .project-editor-markdown {
    min-height: 0;
  }
  .project-editor-footer {
    display: flex;
    justify-content: space-between;
    gap: 16px;
    padding: 9px 14px;
    border-top: 1px solid var(--surface-border-color);
    color: var(--desc-color);
    font-size: 11px;
  }
  .project-editor-versions {
    display: grid;
    grid-template-rows: auto minmax(0, 1fr);
    padding: 16px;
    overflow: hidden;
  }
  .project-editor-versions > header {
    display: flex;
    align-items: center;
    gap: 8px;
    padding-bottom: 14px;
  }

  @media (max-width: 767px) {
    .project-editor-legacy-notice {
      padding: 7px 10px;
    }
    .project-editor-legacy-notice small {
      display: none;
    }
    .project-editor-legacy-notice > span {
      display: block;
    }
    .document-project-editor :deep(.b_btn.small_btn) {
      height: 44px;
      min-height: 44px;
      line-height: 44px;
    }
    .project-editor-toolbar {
      grid-template-columns: auto minmax(0, 1fr) auto;
      gap: 8px;
      padding: 8px 10px;
    }
    .project-editor-toolbar__state {
      justify-self: end;
    }
    .project-editor-toolbar__actions {
      grid-column: 1 / -1;
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
    }
    .project-editor-toolbar__actions :deep(.b_btn) {
      width: 100%;
      padding-inline: 8px;
    }
    .project-editor-layout {
      display: block;
      padding: 8px;
    }
    .project-editor-canvas {
      height: 100%;
      border-radius: 14px;
    }
    .project-editor-footer {
      padding: 8px 10px;
    }
    .project-editor-draft-warning {
      align-items: stretch;
      flex-direction: column;
      padding: 9px 10px;
    }
    .project-editor-draft-warning :deep(.b_btn) {
      width: 100%;
    }
  }

  :global(html.light-note-mobile-rendering .document-project-editor) {
    background: var(--background-color);
  }
  :global(html.light-note-mobile-rendering .project-editor-legacy-notice) {
    border-color: var(--surface-border-color);
    background: var(--workspace-panel-bg-color);
  }
</style>

<style lang="less">
  .document-project-export-menu {
    width: min(280px, calc(100vw - 24px));
    padding: 8px;
  }
  .document-project-export-menu__list {
    display: grid;
    gap: 4px;
  }
  .document-project-export-menu .document-project-export-menu__item.b_btn {
    width: 100%;
    min-height: 52px;
    height: auto;
    justify-content: flex-start;
    align-items: flex-start;
    flex-direction: column;
    gap: 2px;
    padding-block: 8px;
    line-height: 1.35;
    text-align: left;
    background: transparent;
    transition:
      background-color 0.16s ease,
      color 0.16s ease;
  }
  .document-project-export-menu .document-project-export-menu__item.b_btn:hover,
  .document-project-export-menu .document-project-export-menu__item.b_btn:focus-visible {
    background: var(--primary-btn-bg-color);
  }
  .document-project-export-menu__item small {
    color: var(--desc-color);
    font-size: 12px;
  }
</style>
