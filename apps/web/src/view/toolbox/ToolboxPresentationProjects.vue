<template>
  <main class="presentation-projects">
    <div class="presentation-projects__inner">
      <header class="presentation-projects__hero">
        <BButton class="presentation-projects__back" size="small" @click="backToToolbox">
          <SvgIcon :src="icon.toolbox.back" size="15" />
          {{ t('toolboxProject.presentation.list.backToolbox') }}
        </BButton>
        <span class="presentation-projects__eyebrow">
          <SvgIcon :src="icon.toolbox.presentationStudio" size="16" />
          {{ t('toolboxProject.presentation.list.eyebrow') }}
        </span>
        <div class="presentation-projects__heading">
          <div>
            <h1>{{ t('toolboxProject.presentation.list.title') }}</h1>
            <p>{{ t('toolboxProject.presentation.list.description') }}</p>
          </div>
          <BButton
            class="presentation-projects__primary-action"
            type="primary"
            :loading="creatingKey === 'blank'"
            :disabled="Boolean(creatingKey)"
            @click="createBlankProject"
          >
            <SvgIcon :src="icon.common.plus" size="16" />
            {{ t('toolboxProject.presentation.list.create') }}
          </BButton>
        </div>
      </header>

      <section class="presentation-projects__start" :aria-label="t('toolboxProject.presentation.list.startTitle')">
        <header class="presentation-projects__section-heading">
          <div>
            <span>01</span>
            <h2>{{ t('toolboxProject.presentation.list.startTitle') }}</h2>
          </div>
          <p>{{ t('toolboxProject.presentation.list.startDescription') }}</p>
        </header>
        <div class="presentation-starters">
          <BButton
            class="presentation-starter-card is-blank"
            :loading="creatingKey === 'blank'"
            :disabled="Boolean(creatingKey)"
            @click="createBlankProject"
          >
            <span class="presentation-starter-card__icon">
              <SvgIcon :src="icon.common.plus" size="20" />
            </span>
            <span class="presentation-starter-card__copy">
              <strong>{{ t('toolboxProject.presentation.list.blankTitle') }}</strong>
              <small>{{ t('toolboxProject.presentation.list.blankDescription') }}</small>
            </span>
            <span class="presentation-starter-card__action">
              {{ t('toolboxProject.presentation.list.blankAction') }}
              <SvgIcon :src="icon.toolbox.arrow" size="14" />
            </span>
          </BButton>

          <BButton
            class="presentation-starter-card is-template"
            :disabled="Boolean(creatingKey)"
            @click="templateOpen = true"
          >
            <span class="presentation-starter-card__icon">
              <SvgIcon :src="icon.toolbox.presentationStudio" size="20" />
            </span>
            <span class="presentation-starter-card__copy">
              <strong>{{ t('toolboxProject.presentation.list.templateTitle') }}</strong>
              <small>{{
                t('toolboxProject.presentation.list.templateDescription', { count: starterCards.length })
              }}</small>
            </span>
            <span class="presentation-starter-card__action">
              {{ t('toolboxProject.presentation.list.chooseTemplate') }}
              <SvgIcon :src="icon.toolbox.arrow" size="14" />
            </span>
          </BButton>

          <BButton
            class="presentation-starter-card is-import"
            :loading="creatingKey === 'import'"
            :disabled="Boolean(creatingKey)"
            @click="outlineOpen = true"
          >
            <span class="presentation-starter-card__icon">
              <SvgIcon :src="icon.file_upload" size="20" />
            </span>
            <span class="presentation-starter-card__copy">
              <strong>{{ t('toolboxProject.presentation.list.importTitle') }}</strong>
              <small>{{ t('toolboxProject.presentation.list.importDescription') }}</small>
            </span>
            <span class="presentation-starter-card__action">
              {{ t('toolboxProject.presentation.list.importAction') }}
              <SvgIcon :src="icon.toolbox.arrow" size="14" />
            </span>
          </BButton>

          <BButton
            class="presentation-starter-card is-document"
            :loading="creatingKey.startsWith('document:')"
            :disabled="Boolean(creatingKey)"
            @click="openDocumentPicker"
          >
            <span class="presentation-starter-card__icon">
              <SvgIcon :src="icon.toolbox.documentStudio" size="20" />
            </span>
            <span class="presentation-starter-card__copy">
              <strong>{{ t('toolboxProject.presentation.list.fromDocumentTitle') }}</strong>
              <small>{{ t('toolboxProject.presentation.list.fromDocumentDescription') }}</small>
            </span>
            <span class="presentation-starter-card__action">
              {{ t('toolboxProject.presentation.list.chooseDocument') }}
              <SvgIcon :src="icon.toolbox.arrow" size="14" />
            </span>
          </BButton>
        </div>
      </section>

      <section class="presentation-projects__body" :aria-label="t('toolboxProject.presentation.list.title')">
        <header class="presentation-projects__section-heading">
          <div>
            <span>02</span>
            <h2>{{ t('toolboxProject.presentation.list.myProjects') }}</h2>
          </div>
          <p v-if="!loading && !loadError">
            {{
              t(
                projectsCursor
                  ? 'toolboxProject.presentation.list.loadedProjectCount'
                  : 'toolboxProject.presentation.list.projectCount',
                { count: projects.length },
              )
            }}
          </p>
        </header>
        <div v-if="loading" class="presentation-projects__state">
          <BLoading inline loading :title="t('toolboxProject.presentation.list.loading')" />
        </div>
        <div v-else-if="loadError" class="presentation-projects__state is-error" role="alert">
          <SvgIcon :src="icon.toolbox.task" size="25" />
          <strong>{{ t('toolboxProject.presentation.list.loadFailed') }}</strong>
          <span>{{ t('toolboxProject.presentation.list.loadFailedHint') }}</span>
          <BButton @click="loadProjects()">{{ t('common.retry') }}</BButton>
        </div>
        <div v-else-if="projects.length === 0" class="presentation-projects__state is-empty">
          <span class="presentation-projects__empty-icon">
            <SvgIcon :src="icon.toolbox.presentationStudio" size="30" />
          </span>
          <strong>{{ t('toolboxProject.presentation.list.emptyTitle') }}</strong>
          <span>{{ t('toolboxProject.presentation.list.emptyDescription') }}</span>
          <BButton
            class="presentation-projects__primary-action"
            type="primary"
            :loading="creatingKey === 'blank'"
            :disabled="Boolean(creatingKey)"
            @click="createBlankProject"
          >
            {{ t('toolboxProject.presentation.list.create') }}
          </BButton>
        </div>
        <template v-else>
          <div class="presentation-projects__grid">
            <BButton
              v-for="projectItem in projects"
              :key="projectItem.id"
              class="presentation-project-card"
              :aria-label="`${t('toolboxProject.presentation.list.open')} ${projectItem.title || t('toolboxProject.presentation.untitled')}`"
              @click="openProject(projectItem.id)"
            >
              <span class="presentation-project-card__preview"> <span></span><span></span><span></span> </span>
              <span class="presentation-project-card__copy">
                <strong>{{ projectItem.title || t('toolboxProject.presentation.untitled') }}</strong>
                <small>{{
                  t('toolboxProject.presentation.list.updated', { time: formatDate(projectItem.updatedAt) })
                }}</small>
              </span>
              <SvgIcon class="presentation-project-card__arrow" :src="icon.toolbox.arrow" size="15" />
            </BButton>
          </div>
          <div v-if="projectsCursor" class="presentation-projects__more">
            <BButton :loading="loadingMore" @click="loadMoreProjects">{{ t('common.loadMore') }}</BButton>
          </div>
        </template>
      </section>

      <BModal
        v-model:visible="templateOpen"
        :title="t('toolboxProject.presentation.list.templateDialogTitle')"
        width="760px"
        :show-footer="false"
        fullscreen-mobile
        :close-disabled="Boolean(creatingKey)"
      >
        <div class="presentation-template-grid">
          <BButton
            v-for="item in starterCards"
            :key="item.starter.id"
            class="presentation-template-card"
            :loading="creatingKey === item.starter.id"
            :disabled="Boolean(creatingKey) && creatingKey !== item.starter.id"
            @click="createFromStarter(item.starter)"
          >
            <span class="presentation-starter-card__icon">
              <SvgIcon :src="icon.toolbox.presentationStudio" size="20" />
            </span>
            <span class="presentation-starter-card__copy">
              <strong>{{ item.copy.title }}</strong>
              <small>{{ item.copy.description }}</small>
            </span>
            <span class="presentation-starter-card__action">
              {{ t('toolboxProject.presentation.list.templateAction') }}
              <SvgIcon :src="icon.toolbox.arrow" size="14" />
            </span>
          </BButton>
        </div>
      </BModal>

      <BModal
        v-model:visible="outlineOpen"
        :title="t('toolboxProject.presentation.list.outlineDialogTitle')"
        width="680px"
        :show-footer="false"
        fullscreen-mobile
        :close-disabled="creatingKey === 'import'"
      >
        <div class="presentation-outline-dialog">
          <p>{{ t('toolboxProject.presentation.list.outlineDialogDescription') }}</p>
          <BInput
            v-model:value="outlineSource"
            type="textarea"
            :rows="12"
            :maxlength="100000"
            :placeholder="t('toolboxProject.presentation.list.outlinePlaceholder')"
          />
          <span class="presentation-outline-dialog__hint">
            {{ t('toolboxProject.presentation.list.importNoPptx') }}
          </span>
          <div class="presentation-outline-dialog__actions">
            <BUpload
              accept=".md,.markdown,.txt,.outline,.ppt-outline,text/markdown,text/plain"
              :multiple="false"
              :max-total-size="2 * 1024 * 1024"
              raw-file
              :disabled="Boolean(creatingKey)"
              :aria-label="t('toolboxProject.presentation.list.chooseOutlineFile')"
              @change="importOutline"
            >
              <BButton :disabled="Boolean(creatingKey)">
                <SvgIcon :src="icon.file_upload" size="15" />
                {{ t('toolboxProject.presentation.list.chooseOutlineFile') }}
              </BButton>
            </BUpload>
            <BButton
              class="presentation-projects__primary-action"
              type="primary"
              :loading="creatingKey === 'import'"
              :disabled="!outlineSource.trim() || Boolean(creatingKey)"
              @click="importPastedOutline"
            >
              {{ t('toolboxProject.presentation.list.createFromOutline') }}
            </BButton>
          </div>
        </div>
      </BModal>

      <BModal
        v-model:visible="documentPickerOpen"
        :title="t('toolboxProject.presentation.list.documentDialogTitle')"
        width="720px"
        :show-footer="false"
        fullscreen-mobile
        :close-disabled="creatingKey.startsWith('document:')"
      >
        <div v-if="documentsLoading" class="presentation-picker-state">
          <BLoading inline loading :title="t('toolboxProject.presentation.list.loadingDocuments')" />
        </div>
        <div v-else-if="documentsError" class="presentation-picker-state is-error" role="alert">
          <strong>{{ t('toolboxProject.presentation.list.documentsFailed') }}</strong>
          <BButton @click="loadSourceDocuments()">{{ t('common.retry') }}</BButton>
        </div>
        <div v-else-if="documents.length === 0" class="presentation-picker-state">
          <span class="presentation-projects__empty-icon">
            <SvgIcon :src="icon.toolbox.documentStudio" size="28" />
          </span>
          <strong>{{ t('toolboxProject.presentation.list.noDocuments') }}</strong>
          <span>{{ t('toolboxProject.presentation.list.noDocumentsHint') }}</span>
        </div>
        <div v-else class="presentation-document-list">
          <p>{{ t('toolboxProject.presentation.list.documentDialogDescription') }}</p>
          <BButton
            v-for="documentItem in documents"
            :key="documentItem.id"
            class="presentation-document-card"
            :loading="creatingKey === `document:${documentItem.id}`"
            :disabled="Boolean(creatingKey) && creatingKey !== `document:${documentItem.id}`"
            @click="createFromDocument(documentItem)"
          >
            <span class="presentation-starter-card__icon">
              <SvgIcon :src="icon.toolbox.documentStudio" size="18" />
            </span>
            <span class="presentation-starter-card__copy">
              <strong>{{ documentItem.title || t('toolboxProject.untitled') }}</strong>
              <small>{{
                t('toolboxProject.presentation.list.updated', { time: formatDate(documentItem.updatedAt) })
              }}</small>
            </span>
            <SvgIcon :src="icon.toolbox.arrow" size="14" />
          </BButton>
          <div v-if="documentsCursor" class="presentation-document-list__more">
            <BButton :loading="documentsLoadingMore" @click="loadMoreSourceDocuments">
              {{ t('common.loadMore') }}
            </BButton>
          </div>
        </div>
      </BModal>
    </div>
  </main>
</template>

<script setup lang="ts">
  import type { ProductionProjectStarter } from '@/config/productionProjectStarters';
  import { computed, onMounted, ref } from 'vue';
  import { useI18n } from 'vue-i18n';
  import { useRouter } from 'vue-router';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BInput from '@/components/base/BasicComponents/BInput.vue';
  import BLoading from '@/components/base/BasicComponents/BLoading.vue';
  import BModal from '@/components/base/BasicComponents/BModal/BModal.vue';
  import BUpload from '@/components/base/BasicComponents/BUpload.vue';
  import message from '@/components/base/BasicComponents/BMessage/BMessage';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import icon from '@/config/icon';
  import {
    productionProjectStarterCopy,
    productionProjectStartersFor,
    productionStarterLocale,
  } from '@/config/productionProjectStarters';
  import { returnFromToolboxPage } from '@/utils/toolboxNavigation';
  import {
    createProductionPresentationFromOutline,
    importProductionPresentationOutline,
    isProductionPresentationOutlineSlideLimitError,
  } from '@/utils/productionProjectImports';
  import {
    createToolboxProject,
    createToolboxProjectClientRequestId,
    fetchToolboxProject,
    fetchToolboxProjectsPage,
    type ToolboxProjectSummary,
  } from '@/api/toolboxProjects';
  import { createPresentationContent } from './presentationProjectState';

  const { t, locale } = useI18n();
  const router = useRouter();
  const loading = ref(true);
  const creatingKey = ref('');
  const loadError = ref(false);
  const loadingMore = ref(false);
  const projectsCursor = ref<string | null>(null);
  const projects = ref<ToolboxProjectSummary[]>([]);
  const documents = ref<ToolboxProjectSummary[]>([]);
  const documentsLoading = ref(false);
  const documentsLoadingMore = ref(false);
  const documentsCursor = ref<string | null>(null);
  const documentsError = ref(false);
  const templateOpen = ref(false);
  const outlineOpen = ref(false);
  const documentPickerOpen = ref(false);
  const outlineSource = ref('');
  const presentationStarters = productionProjectStartersFor('presentation');
  const starterCards = computed(() =>
    presentationStarters.map((starter) => ({ starter, copy: productionProjectStarterCopy(starter, locale.value) })),
  );

  function formatDate(value: string | null) {
    if (!value) return '—';
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString(locale.value);
  }

  async function loadProjects({ append = false }: { append?: boolean } = {}) {
    if (append) {
      if (!projectsCursor.value || loadingMore.value) return;
      loadingMore.value = true;
    } else {
      loading.value = true;
      loadError.value = false;
    }
    try {
      const page = await fetchToolboxProjectsPage({
        projectType: 'presentation',
        status: 'active',
        limit: 24,
        cursor: append ? projectsCursor.value : null,
      });
      if (append) {
        const merged = new Map(projects.value.map((project) => [project.id, project]));
        page.items.forEach((project) => merged.set(project.id, project));
        projects.value = [...merged.values()];
      } else {
        projects.value = page.items;
      }
      projectsCursor.value = page.nextCursor;
    } catch {
      if (append) message.error(t('toolboxProject.list.loadMoreFailed'));
      else loadError.value = true;
    } finally {
      if (append) loadingMore.value = false;
      else loading.value = false;
    }
  }

  function loadMoreProjects() {
    void loadProjects({ append: true });
  }

  async function createBlankProject() {
    if (creatingKey.value) return;
    creatingKey.value = 'blank';
    try {
      const detail = await createToolboxProject({
        clientRequestId: createToolboxProjectClientRequestId('presentation-create'),
        projectType: 'presentation',
        title: t('toolboxProject.presentation.untitled'),
        metadata: { locale: productionStarterLocale(locale.value) },
        content: createPresentationContent(),
        changeKind: 'create',
      });
      await router.push({ name: 'toolboxPresentationProject', params: { projectId: detail.project.id } });
    } catch {
      message.error(t('toolboxProject.presentation.list.createFailed'));
    } finally {
      creatingKey.value = '';
    }
  }

  async function createFromStarter(starter: ProductionProjectStarter) {
    if (creatingKey.value || starter.projectType !== 'presentation') return;
    creatingKey.value = starter.id;
    const copy = productionProjectStarterCopy(starter, locale.value);
    try {
      const detail = await createToolboxProject({
        clientRequestId: createToolboxProjectClientRequestId(`presentation-template-${starter.id}`),
        projectType: 'presentation',
        title: copy.title,
        metadata: {
          locale: productionStarterLocale(locale.value),
          templateId: starter.id,
        },
        content: starter.createContent(locale.value),
        changeKind: 'create',
      });
      await router.push({ name: 'toolboxPresentationProject', params: { projectId: detail.project.id } });
    } catch {
      message.error(t('toolboxProject.presentation.list.createFailed'));
    } finally {
      creatingKey.value = '';
    }
  }

  async function createImportedProject(options: {
    title: string;
    content: ReturnType<typeof createProductionPresentationFromOutline>;
    sourceProjectId?: string;
    sourceRevisionId?: string;
  }) {
    return await createToolboxProject({
      clientRequestId: createToolboxProjectClientRequestId('presentation-import'),
      projectType: 'presentation',
      title: options.title,
      metadata: {
        locale: productionStarterLocale(locale.value),
        extensions:
          options.sourceProjectId && options.sourceRevisionId
            ? { sourceProjectId: options.sourceProjectId, sourceRevisionId: options.sourceRevisionId }
            : {},
      },
      content: options.content,
      changeKind: 'import',
    });
  }

  async function importPastedOutline() {
    const source = outlineSource.value.trim();
    if (!source || creatingKey.value) return;
    creatingKey.value = 'import';
    try {
      const content = createProductionPresentationFromOutline(source, t('toolboxProject.presentation.untitled'));
      const title = content.slides[0]?.title || t('toolboxProject.presentation.untitled');
      const detail = await createImportedProject({ title, content });
      outlineOpen.value = false;
      await router.push({ name: 'toolboxPresentationProject', params: { projectId: detail.project.id } });
    } catch (error) {
      showOutlineImportError(error);
    } finally {
      creatingKey.value = '';
    }
  }

  async function importOutline(files: unknown[]) {
    const file = files.find((item): item is File => item instanceof File);
    if (!file || creatingKey.value) return;
    creatingKey.value = 'import';
    try {
      const imported = await importProductionPresentationOutline(file);
      const detail = await createImportedProject({ title: imported.title, content: imported.content });
      outlineOpen.value = false;
      await router.push({ name: 'toolboxPresentationProject', params: { projectId: detail.project.id } });
    } catch (error) {
      if (isProductionPresentationOutlineSlideLimitError(error)) {
        showOutlineImportError(error);
        return;
      }
      const code = error instanceof Error ? error.message : '';
      message.error(
        t(
          code === 'PRESENTATION_OUTLINE_TOO_LARGE'
            ? 'toolboxProject.presentation.list.importTooLarge'
            : 'toolboxProject.presentation.list.importFailed',
        ),
      );
    } finally {
      creatingKey.value = '';
    }
  }

  function showOutlineImportError(error: unknown, fallbackKey = 'toolboxProject.presentation.list.importFailed') {
    if (isProductionPresentationOutlineSlideLimitError(error)) {
      message.error(
        t('toolboxProject.presentation.list.importSlideLimit', {
          count: error.slideCount,
          max: error.maxSlides,
        }),
      );
      return;
    }
    message.error(t(fallbackKey));
  }

  async function loadSourceDocuments({ append = false }: { append?: boolean } = {}) {
    if (append) {
      if (!documentsCursor.value || documentsLoadingMore.value) return;
      documentsLoadingMore.value = true;
    } else {
      documentsLoading.value = true;
      documentsError.value = false;
    }
    try {
      const page = await fetchToolboxProjectsPage({
        projectType: 'document',
        status: 'active',
        limit: 24,
        cursor: append ? documentsCursor.value : null,
      });
      if (append) {
        const merged = new Map(documents.value.map((project) => [project.id, project]));
        page.items.forEach((project) => merged.set(project.id, project));
        documents.value = [...merged.values()];
      } else {
        documents.value = page.items;
      }
      documentsCursor.value = page.nextCursor;
    } catch {
      if (append) message.error(t('toolboxProject.list.loadMoreFailed'));
      else documentsError.value = true;
    } finally {
      if (append) documentsLoadingMore.value = false;
      else documentsLoading.value = false;
    }
  }

  function loadMoreSourceDocuments() {
    void loadSourceDocuments({ append: true });
  }

  function openDocumentPicker() {
    documentPickerOpen.value = true;
    if (!documents.value.length && !documentsLoading.value) void loadSourceDocuments();
  }

  async function createFromDocument(documentItem: ToolboxProjectSummary) {
    if (creatingKey.value) return;
    creatingKey.value = `document:${documentItem.id}`;
    try {
      const source = await fetchToolboxProject(documentItem.id);
      if (source.revision.content.type !== 'document') throw new Error('INVALID_DOCUMENT_PROJECT');
      const content = createProductionPresentationFromOutline(
        source.revision.content.body.value,
        source.project.title || t('toolboxProject.presentation.untitled'),
      );
      const detail = await createImportedProject({
        title: t('toolboxProject.presentation.list.fromDocumentProjectTitle', {
          title: source.project.title || t('toolboxProject.untitled'),
        }),
        content,
        sourceProjectId: source.project.id,
        sourceRevisionId: source.revision.id,
      });
      documentPickerOpen.value = false;
      await router.push({ name: 'toolboxPresentationProject', params: { projectId: detail.project.id } });
    } catch (error) {
      showOutlineImportError(error, 'toolboxProject.presentation.list.documentCreateFailed');
    } finally {
      creatingKey.value = '';
    }
  }

  function openProject(projectId: string) {
    router.push({ name: 'toolboxPresentationProject', params: { projectId } });
  }

  function backToToolbox() {
    returnFromToolboxPage(router, 'workbench');
  }

  onMounted(loadProjects);
</script>

<style scoped lang="less">
  @import './toolboxPageScroll.less';

  .presentation-projects {
    .toolbox-page-scroll();
    color: var(--text-color);
    background: var(--background-color);
  }
  .presentation-projects__inner {
    width: min(1240px, calc(100% - 48px));
    margin: 0 auto;
    padding: 32px 0 56px;
  }
  .presentation-projects__hero,
  .presentation-projects__start,
  .presentation-projects__body {
    border: 1px solid var(--surface-border-color);
    border-radius: 20px;
    background: var(--surface-panel-bg, var(--background-color));
  }
  .presentation-projects__hero {
    padding: 30px 32px;
    border-left: 4px solid #3175cc;
    background:
      radial-gradient(circle at 88% 18%, rgba(49, 117, 204, 0.1), transparent 25%),
      var(--surface-panel-bg, var(--background-color));
  }
  .presentation-projects__back {
    margin-bottom: 18px;
    gap: 5px;
  }
  .presentation-projects__eyebrow {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    color: #3175cc;
    font-size: 13px;
    font-weight: 650;
  }
  .presentation-projects__heading {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: 24px;
    margin-top: 12px;
  }
  h1 {
    margin: 0;
    font-size: clamp(28px, 3vw, 42px);
    line-height: 1.15;
  }
  p {
    margin: 10px 0 0;
    color: var(--desc-color);
    line-height: 1.65;
  }
  .presentation-projects__primary-action {
    background: #3175cc;
  }
  .presentation-projects__start,
  .presentation-projects__body {
    margin-top: 18px;
    padding: 24px;
  }
  .presentation-projects__section-heading {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: 18px;
    margin-bottom: 18px;
  }
  .presentation-projects__section-heading > div {
    display: flex;
    align-items: baseline;
    gap: 10px;
  }
  .presentation-projects__section-heading > div > span {
    color: #3175cc;
    font-size: 12px;
    font-weight: 750;
  }
  .presentation-projects__section-heading h2 {
    margin: 0;
    font-size: 22px;
  }
  .presentation-projects__section-heading p {
    margin: 0;
    font-size: 12px;
  }
  .presentation-starters {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 12px;
  }
  .presentation-starter-card {
    width: 100%;
    height: auto;
    min-width: 0;
    min-height: 154px;
    padding: 16px;
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    grid-template-rows: 1fr auto;
    align-items: start;
    gap: 12px;
    color: var(--text-color);
    text-align: left;
    white-space: normal;
    border: 1px solid var(--surface-border-color) !important;
    border-radius: 16px;
    background: var(--surface-panel-bg, var(--background-color));
  }
  .presentation-starter-card:hover,
  .presentation-starter-card:focus-visible {
    border-color: #3175cc !important;
    background: var(--surface-hover-bg, var(--active-background-color));
  }
  .presentation-starter-card__icon {
    width: 40px;
    height: 40px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    color: #3175cc;
    border: 1px solid rgba(49, 117, 204, 0.28);
    border-radius: 12px;
    background: rgba(49, 117, 204, 0.09);
  }
  .presentation-starter-card__copy {
    min-width: 0;
    display: grid;
    gap: 6px;
  }
  .presentation-starter-card__copy strong {
    font-size: 16px;
  }
  .presentation-starter-card__copy small,
  .presentation-starter-card__copy em {
    color: var(--desc-color);
    font-size: 12px;
    font-style: normal;
    line-height: 1.5;
  }
  .presentation-starter-card__copy em {
    color: #8d6421;
    font-size: 11px;
  }
  .presentation-starter-card__action {
    grid-column: 1 / -1;
    display: inline-flex;
    align-items: center;
    justify-content: flex-end;
    gap: 5px;
    color: #3175cc;
    font-size: 12px;
    font-weight: 650;
  }
  .presentation-template-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 12px;
  }
  .presentation-template-card {
    width: 100%;
    height: auto;
    min-height: 180px;
    min-width: 0;
    padding: 16px;
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    grid-template-rows: 1fr auto;
    align-items: start;
    gap: 12px;
    color: var(--text-color);
    text-align: left;
    white-space: normal;
    border: 1px solid var(--surface-border-color) !important;
    border-radius: 15px;
    background: var(--surface-page-bg, var(--background-color));
  }
  .presentation-template-card:hover,
  .presentation-template-card:focus-visible {
    border-color: #3175cc !important;
  }
  .presentation-outline-dialog {
    display: grid;
    gap: 12px;
  }
  .presentation-outline-dialog > p,
  .presentation-document-list > p {
    margin: 0;
    color: var(--desc-color);
    font-size: 13px;
  }
  .presentation-outline-dialog :deep(.b-textarea) {
    min-height: 280px;
    line-height: 1.6;
  }
  .presentation-outline-dialog__hint {
    color: #8d6421;
    font-size: 12px;
  }
  .presentation-outline-dialog__actions {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 10px;
  }
  .presentation-picker-state {
    min-height: 260px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 10px;
    color: var(--desc-color);
    text-align: center;
  }
  .presentation-document-list {
    display: grid;
    gap: 10px;
  }
  .presentation-document-list__more,
  .presentation-projects__more {
    display: flex;
    justify-content: center;
  }
  .presentation-document-list__more {
    padding-top: 4px;
  }
  .presentation-document-card {
    width: 100%;
    height: auto;
    min-height: 72px;
    padding: 12px;
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: center;
    gap: 12px;
    color: var(--text-color);
    text-align: left;
    border: 1px solid var(--surface-border-color) !important;
    border-radius: 13px;
    background: var(--surface-page-bg, var(--background-color));
  }
  .presentation-document-card:hover,
  .presentation-document-card:focus-visible {
    border-color: #3175cc !important;
  }
  .presentation-projects__state {
    min-height: 210px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 10px;
    color: var(--desc-color);
    text-align: center;
  }
  .presentation-projects__state strong {
    color: var(--text-color);
    font-size: 18px;
  }
  .presentation-projects__state.is-error > svg {
    color: var(--error-color, #d9363e);
  }
  .presentation-projects__empty-icon {
    width: 60px;
    height: 60px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    color: #3175cc;
    border: 1px solid rgba(49, 117, 204, 0.34);
    border-radius: 16px;
    background: rgba(49, 117, 204, 0.08);
  }
  .presentation-projects__grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 14px;
  }
  .presentation-projects__more {
    padding-top: 18px;
  }
  .presentation-project-card {
    width: 100%;
    height: auto;
    min-height: 150px;
    min-width: 0;
    padding: 16px;
    display: grid;
    grid-template-columns: 98px minmax(0, 1fr) auto;
    align-items: center;
    gap: 14px;
    text-align: left;
    color: var(--text-color);
    border: 1px solid var(--surface-border-color) !important;
    border-radius: 16px;
    background: var(--surface-panel-bg, var(--background-color));
  }
  .presentation-project-card:hover,
  .presentation-project-card:focus-visible {
    border-color: #3175cc !important;
    background: var(--surface-hover-bg, var(--active-background-color));
  }
  .presentation-project-card__preview {
    aspect-ratio: 16 / 9;
    display: grid;
    align-content: center;
    gap: 7px;
    padding: 12px;
    border-radius: 8px;
    background: linear-gradient(135deg, #fff 0 78%, #dceafe 78%);
    box-shadow: inset 0 0 0 1px rgba(49, 117, 204, 0.25);
  }
  .presentation-project-card__preview span {
    height: 4px;
    border-radius: 999px;
    background: #3175cc;
  }
  .presentation-project-card__preview span:nth-child(2) {
    width: 75%;
    background: #8c91a1;
  }
  .presentation-project-card__preview span:nth-child(3) {
    width: 55%;
    background: #b5b8c1;
  }
  .presentation-project-card__copy {
    min-width: 0;
    display: grid;
    gap: 8px;
  }
  .presentation-project-card__copy strong,
  .presentation-project-card__copy small {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .presentation-project-card__copy small {
    color: var(--desc-color);
    font-size: 11px;
  }
  .presentation-project-card__arrow {
    color: var(--desc-color);
  }
  @media (max-width: 980px) {
    .presentation-template-grid,
    .presentation-starters,
    .presentation-projects__grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }
  @media (max-width: 600px) {
    .presentation-projects__inner {
      width: calc(100% - 20px);
      padding: 12px 0 28px;
    }
    .presentation-projects__hero,
    .presentation-projects__start,
    .presentation-projects__body {
      border-radius: 16px;
    }
    .presentation-projects__hero,
    .presentation-projects__start,
    .presentation-projects__body {
      padding: 18px;
    }
    .presentation-projects__heading {
      align-items: stretch;
      flex-direction: column;
    }
    .presentation-projects__heading :deep(.b_btn) {
      width: 100%;
    }
    .presentation-projects__section-heading {
      align-items: flex-start;
      flex-direction: column;
      gap: 5px;
    }
    .presentation-starters,
    .presentation-projects__grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
    .presentation-starter-card {
      min-height: 122px;
      padding: 12px;
    }
    .presentation-starter-card__copy small {
      font-size: 11px;
    }
    .presentation-starter-card__action {
      font-size: 11px;
    }
    .presentation-template-grid {
      grid-template-columns: 1fr;
    }
    .presentation-template-card {
      min-height: 132px;
    }
    .presentation-outline-dialog__actions {
      align-items: stretch;
      flex-direction: column;
    }
    .presentation-outline-dialog__actions :deep(.b-upload-trigger),
    .presentation-outline-dialog__actions :deep(.b_btn) {
      width: 100%;
    }
    .presentation-projects__grid {
      grid-template-columns: 1fr;
    }
    .presentation-project-card {
      grid-template-columns: 88px minmax(0, 1fr) auto;
      min-height: 126px;
    }
  }
  :global(html.light-note-mobile-rendering .presentation-projects) {
    background: var(--background-color);
  }
</style>
