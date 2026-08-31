<template>
  <main ref="pageRef" class="workbook-projects">
    <div class="workbook-projects__inner">
      <header class="workbook-projects__hero">
        <BButton class="workbook-projects__back" size="small" @click="returnToToolbox">
          <SvgIcon :src="icon.toolbox.back" size="15" />{{ t('toolbox.back') }}
        </BButton>
        <span class="workbook-projects__eyebrow">
          <SvgIcon :src="icon.toolbox.workbookStudio" size="16" />{{ t('toolboxProject.workbook.list.eyebrow') }}
        </span>
        <div class="workbook-projects__heading">
          <div>
            <h1>{{ t('toolboxProject.workbook.list.title') }}</h1>
            <p>{{ t('toolboxProject.workbook.list.description') }}</p>
          </div>
          <div class="workbook-projects__create-actions">
            <BUpload
              raw-file
              :multiple="false"
              accept=".csv,.tsv,.tab,.json,.xlsx"
              :max-total-size="null"
              :disabled="creatingAny"
              @change="importWorkbook"
            >
              <BButton :loading="importing" :disabled="creatingAny && !importing">
                <SvgIcon :src="icon.toolbox.upload" size="16" />{{ t('toolboxProject.workbook.list.import') }}
              </BButton>
            </BUpload>
            <BButton
              type="primary"
              :loading="creating"
              :disabled="creatingAny && !creating"
              @click="createBlankProject"
            >
              {{ t('toolboxProject.workbook.list.create') }}
            </BButton>
          </div>
        </div>
      </header>

      <section class="workbook-projects__starters" aria-labelledby="workbook-starters-title">
        <header>
          <div>
            <span class="workbook-projects__section-index">01</span>
            <h2 id="workbook-starters-title">{{ t('toolboxProject.workbook.list.startersTitle') }}</h2>
          </div>
          <p>{{ t('toolboxProject.workbook.list.startersDescription') }}</p>
        </header>
        <div class="workbook-projects__starter-grid">
          <BButton
            v-for="starter in localizedStarters"
            :key="starter.id"
            class="workbook-starter-card"
            :loading="creatingStarterId === starter.id"
            :disabled="creatingAny && creatingStarterId !== starter.id"
            :aria-label="t('toolboxProject.workbook.list.createFromTemplate', { title: starter.title })"
            @click="createFromStarter(starter.id)"
          >
            <span class="workbook-starter-card__icon">
              <SvgIcon :src="icon.toolbox.workbookStudio" size="20" />
            </span>
            <span class="workbook-starter-card__copy">
              <strong>{{ starter.title }}</strong>
              <small>{{ starter.description }}</small>
            </span>
            <SvgIcon class="workbook-starter-card__arrow" :src="icon.toolbox.arrow" size="15" />
          </BButton>
        </div>
      </section>

      <section class="workbook-projects__body" :aria-label="t('toolboxProject.workbook.list.title')">
        <header class="workbook-projects__body-heading">
          <span class="workbook-projects__section-index">02</span>
          <h2>{{ t('toolboxProject.workbook.list.projectsTitle') }}</h2>
        </header>
        <div v-if="loading" class="workbook-projects__state">
          <BLoading inline loading :title="t('toolboxProject.workbook.list.loading')" />
        </div>
        <div v-else-if="loadError" class="workbook-projects__state is-error" role="alert">
          <SvgIcon :src="icon.toolbox.task" size="24" />
          <strong>{{ t('toolboxProject.workbook.list.loadFailed') }}</strong>
          <span>{{ t('toolboxProject.workbook.list.loadFailedHint') }}</span>
          <BButton @click="loadProjects()">{{ t('common.retry') }}</BButton>
        </div>
        <div v-else-if="projects.length === 0" class="workbook-projects__state is-empty">
          <span class="workbook-projects__empty-icon">
            <SvgIcon :src="icon.toolbox.workbookStudio" size="28" />
          </span>
          <strong>{{ t('toolboxProject.workbook.list.emptyTitle') }}</strong>
          <span>{{ t('toolboxProject.workbook.list.emptyDescription') }}</span>
          <BButton type="primary" :loading="creating" @click="createBlankProject">
            {{ t('toolboxProject.workbook.list.create') }}
          </BButton>
        </div>
        <template v-else>
          <div class="workbook-projects__grid">
            <BButton
              v-for="project in projects"
              :key="project.id"
              class="workbook-project-card"
              :aria-label="`${t('toolboxProject.workbook.list.open')} ${project.title || t('toolboxProject.workbook.untitled')}`"
              @click="openProject(project.id)"
            >
              <span class="workbook-project-card__icon">
                <SvgIcon :src="icon.toolbox.workbookStudio" size="22" />
              </span>
              <span class="workbook-project-card__copy">
                <strong>{{ project.title || t('toolboxProject.workbook.untitled') }}</strong>
                <small>{{ t('toolboxProject.workbook.list.updated', { time: formatDate(project.updatedAt) }) }}</small>
              </span>
              <SvgIcon class="workbook-project-card__arrow" :src="icon.toolbox.arrow" size="15" />
            </BButton>
          </div>
          <div v-if="projectsCursor" class="workbook-projects__more">
            <BButton :loading="loadingMore" @click="loadMoreProjects">{{ t('common.loadMore') }}</BButton>
          </div>
        </template>
      </section>
    </div>
  </main>
</template>

<script setup lang="ts">
  import { computed, nextTick, onMounted, ref } from 'vue';
  import { useI18n } from 'vue-i18n';
  import { useRoute, useRouter } from 'vue-router';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BLoading from '@/components/base/BasicComponents/BLoading.vue';
  import BUpload from '@/components/base/BasicComponents/BUpload.vue';
  import message from '@/components/base/BasicComponents/BMessage/BMessage';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import icon from '@/config/icon';
  import { useUserStore } from '@/store';
  import {
    productionProjectStarterById,
    productionProjectStarterCopy,
    productionProjectStartersFor,
  } from '@/config/productionProjectStarters';
  import { importProductionWorkbookFile } from '@/utils/productionProjectImports';
  import {
    createEmptyToolboxWorkbookContent,
    createToolboxProject,
    createToolboxProjectClientRequestId,
    fetchToolboxProjectsPage,
    type ToolboxProjectSummary,
  } from '@/api/toolboxProjects';
  import { createWorkbookSheet } from '@/utils/productionWorkbookEditor';
  import {
    restoreToolboxScrollSnapshot,
    returnFromToolboxPage,
    saveToolboxScrollSnapshot,
  } from '@/utils/toolboxNavigation';
  import { toolboxRecentUseIdentityKey } from '@/utils/toolboxRecentUse';

  const { t, locale } = useI18n();
  const route = useRoute();
  const router = useRouter();
  const user = useUserStore();
  const pageRef = ref<HTMLElement | null>(null);
  const loading = ref(true);
  const creating = ref(false);
  const importing = ref(false);
  const creatingStarterId = ref('');
  const loadError = ref(false);
  const loadingMore = ref(false);
  const projectsCursor = ref<string | null>(null);
  const projects = ref<ToolboxProjectSummary[]>([]);
  const localizedStarters = computed(() =>
    productionProjectStartersFor('workbook').map((starter) => ({
      id: starter.id,
      ...productionProjectStarterCopy(starter, locale.value),
    })),
  );
  const creatingAny = computed(() => creating.value || importing.value || Boolean(creatingStarterId.value));

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
        projectType: 'workbook',
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
    if (creatingAny.value) return;
    creating.value = true;
    try {
      const content = createEmptyToolboxWorkbookContent();
      const firstSheet = createWorkbookSheet('sheet-1', t('toolboxProject.workbook.sheetDefault', { number: 1 }));
      const detail = await createToolboxProject({
        clientRequestId: createToolboxProjectClientRequestId('workbook-create'),
        projectType: 'workbook',
        title: t('toolboxProject.workbook.untitled'),
        content: { ...content, sheets: [firstSheet], activeSheetId: firstSheet.id },
      });
      rememberProjectsScroll();
      await router.push({ name: 'toolboxWorkbookProject', params: { projectId: detail.project.id } });
    } catch {
      message.error(t('toolboxProject.workbook.list.createFailed'));
    } finally {
      creating.value = false;
    }
  }

  async function createFromStarter(starterId: string) {
    if (creatingAny.value) return;
    const starter = productionProjectStarterById(starterId);
    if (!starter || starter.projectType !== 'workbook') return;
    creatingStarterId.value = starter.id;
    try {
      const copy = productionProjectStarterCopy(starter, locale.value);
      const detail = await createToolboxProject({
        clientRequestId: createToolboxProjectClientRequestId(`workbook-template-${starter.id}`),
        projectType: 'workbook',
        title: copy.title,
        metadata: { templateId: starter.id },
        content: starter.createContent(locale.value),
      });
      rememberProjectsScroll();
      await router.push({ name: 'toolboxWorkbookProject', params: { projectId: detail.project.id } });
    } catch {
      message.error(t('toolboxProject.workbook.list.createFailed'));
    } finally {
      creatingStarterId.value = '';
    }
  }

  async function importWorkbook(files: File[]) {
    const file = files[0];
    if (!file || creatingAny.value) return;
    importing.value = true;
    try {
      const imported = await importProductionWorkbookFile(file);
      const detail = await createToolboxProject({
        clientRequestId: createToolboxProjectClientRequestId('workbook-import'),
        projectType: 'workbook',
        title: imported.title,
        content: imported.content,
        changeKind: 'import',
      });
      message.success(t('toolboxProject.workbook.list.importSuccess'));
      rememberProjectsScroll();
      await router.push({ name: 'toolboxWorkbookProject', params: { projectId: detail.project.id } });
    } catch (error) {
      const code = error instanceof Error ? error.message : '';
      if (code === 'UNSUPPORTED_WORKBOOK_IMPORT') {
        message.error(t('toolboxProject.workbook.list.importUnsupported'));
      } else if (code === 'WORKBOOK_IMPORT_TOO_LARGE') {
        message.error(t('toolboxProject.workbook.list.importTooLarge'));
      } else {
        message.error(t('toolboxProject.workbook.list.importFailed'));
      }
    } finally {
      importing.value = false;
    }
  }

  function openProject(projectId: string) {
    rememberProjectsScroll();
    router.push({ name: 'toolboxWorkbookProject', params: { projectId } });
  }

  function rememberProjectsScroll() {
    saveToolboxScrollSnapshot({
      routeFullPath: route.fullPath,
      identityKey: toolboxRecentUseIdentityKey(user),
      element: pageRef.value,
    });
  }

  function returnToToolbox() {
    returnFromToolboxPage(router, 'workbench');
  }

  async function initializeProjects() {
    await loadProjects();
    await nextTick();
    window.requestAnimationFrame(() => {
      restoreToolboxScrollSnapshot({
        routeFullPath: route.fullPath,
        identityKey: toolboxRecentUseIdentityKey(user),
        element: pageRef.value,
      });
    });
  }

  onMounted(() => void initializeProjects());
</script>

<style scoped lang="less">
  @import './toolboxPageScroll.less';

  .workbook-projects {
    .toolbox-page-scroll();
    color: var(--text-color);
    background: var(--background-color);
  }

  .workbook-projects__inner {
    width: min(1180px, calc(100% - 48px));
    margin: 0 auto;
    padding: 32px 0 56px;
  }

  .workbook-projects__hero,
  .workbook-projects__starters,
  .workbook-projects__body {
    border: 1px solid var(--surface-border-color);
    border-radius: 20px;
    background: var(--surface-panel-bg, var(--background-color));
  }

  .workbook-projects__hero {
    padding: 28px 32px;
    border-left: 4px solid #16a071;
  }

  .workbook-projects__eyebrow {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    color: #0c8c61;
    font-size: 13px;
    font-weight: 650;
  }

  .workbook-projects__back {
    margin: -8px 0 16px;
    gap: 5px;
  }

  .workbook-projects__heading {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: 24px;
    margin-top: 12px;
  }

  .workbook-projects__create-actions {
    flex: 0 0 auto;
    display: flex;
    align-items: center;
    gap: 9px;
  }

  .workbook-projects__create-actions :deep(.b_btn) {
    gap: 6px;
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

  .workbook-projects__starters,
  .workbook-projects__body {
    min-height: 360px;
    margin-top: 18px;
    padding: 24px;
  }

  .workbook-projects__starters {
    min-height: 0;
  }

  .workbook-projects__starters > header,
  .workbook-projects__body-heading {
    min-width: 0;
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: 24px;
    margin-bottom: 16px;
  }

  .workbook-projects__starters > header > div,
  .workbook-projects__body-heading {
    display: flex;
    align-items: center;
    gap: 9px;
  }

  .workbook-projects__body-heading {
    justify-content: flex-start;
  }

  .workbook-projects__starters h2,
  .workbook-projects__body-heading h2 {
    margin: 0;
    font-size: 20px;
    line-height: 1.3;
  }

  .workbook-projects__starters > header p {
    max-width: 540px;
    margin: 0;
    font-size: 13px;
    text-align: right;
  }

  .workbook-projects__section-index {
    color: #087b55;
    font-size: 12px;
    font-weight: 750;
    letter-spacing: 0.05em;
  }

  .workbook-projects__starter-grid {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 12px;
  }

  .workbook-starter-card {
    width: 100%;
    min-width: 0;
    height: auto;
    min-height: 132px;
    padding: 16px;
    align-items: flex-start;
    justify-content: flex-start;
    gap: 12px;
    color: var(--text-color);
    text-align: left;
    background: var(--surface-panel-bg, var(--background-color));
    border: 1px solid var(--surface-border-color) !important;
    border-radius: 14px;
  }

  .workbook-starter-card:hover,
  .workbook-starter-card:focus-visible {
    border-color: #16a071 !important;
    background: var(--surface-hover-bg, var(--active-background-color));
  }

  .workbook-starter-card__icon {
    flex: 0 0 auto;
    width: 38px;
    height: 38px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    color: #087b55;
    background: var(--success-soft-bg, #edf9f4);
    border: 1px solid var(--success-border-color, #a9dec9);
    border-radius: 11px;
  }

  .workbook-starter-card__copy {
    min-width: 0;
    flex: 1;
    display: grid;
    gap: 6px;
  }

  .workbook-starter-card__copy strong {
    font-size: 14px;
  }

  .workbook-starter-card__copy small {
    display: -webkit-box;
    overflow: hidden;
    color: var(--desc-color);
    font-size: 12px;
    line-height: 1.5;
    white-space: normal;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 3;
  }

  .workbook-starter-card__arrow {
    flex: 0 0 auto;
    margin-top: 10px;
    color: var(--desc-color);
  }

  .workbook-projects__state {
    min-height: 300px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 10px;
    color: var(--desc-color);
    text-align: center;
  }

  .workbook-projects__state strong {
    color: var(--text-color);
    font-size: 18px;
  }

  .workbook-projects__state.is-error > svg {
    color: var(--error-color, #d9363e);
  }

  .workbook-projects__empty-icon,
  .workbook-project-card__icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    color: #0c8c61;
    background: var(--success-soft-bg, #edf9f4);
    border: 1px solid var(--success-border-color, #a9dec9);
    border-radius: 14px;
  }

  .workbook-projects__empty-icon {
    width: 58px;
    height: 58px;
  }

  .workbook-projects__grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 14px;
  }
  .workbook-projects__more {
    display: flex;
    justify-content: center;
    padding-top: 18px;
  }

  .workbook-project-card {
    width: 100%;
    min-width: 0;
    height: auto;
    min-height: 108px;
    padding: 18px;
    justify-content: flex-start;
    gap: 14px;
    text-align: left;
    border: 1px solid var(--surface-border-color) !important;
    border-radius: 15px;
    background: var(--surface-panel-bg, var(--background-color));
    color: var(--text-color);
  }

  .workbook-project-card:hover,
  .workbook-project-card:focus-visible {
    border-color: #16a071 !important;
    background: var(--surface-hover-bg, var(--active-background-color));
  }

  .workbook-project-card__icon {
    flex: 0 0 auto;
    width: 46px;
    height: 46px;
  }

  .workbook-project-card__copy {
    min-width: 0;
    flex: 1;
    display: grid;
    gap: 8px;
  }

  .workbook-project-card__copy strong,
  .workbook-project-card__copy small {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .workbook-project-card__copy small,
  .workbook-project-card__arrow {
    color: var(--desc-color);
    font-size: 12px;
  }

  @media (max-width: 920px) {
    .workbook-projects__starter-grid,
    .workbook-projects__grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }

  @media (max-width: 767px) {
    .workbook-projects__inner {
      width: 100%;
      padding: 12px 12px 96px;
    }
    .workbook-projects__hero,
    .workbook-projects__starters,
    .workbook-projects__body {
      border-radius: 18px;
    }
    .workbook-projects__hero {
      padding: 22px 18px;
    }
    .workbook-projects__heading {
      align-items: stretch;
      flex-direction: column;
      gap: 18px;
    }
    .workbook-projects__create-actions,
    .workbook-projects__create-actions :deep(.b-upload-trigger),
    .workbook-projects__heading :deep(.b_btn) {
      width: 100%;
    }
    .workbook-projects__create-actions {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
    .workbook-projects__starters,
    .workbook-projects__body {
      min-height: 320px;
      margin-top: 12px;
      padding: 12px;
    }
    .workbook-projects__starters {
      min-height: 0;
    }
    .workbook-projects__starters > header {
      align-items: flex-start;
      flex-direction: column;
      gap: 6px;
    }
    .workbook-projects__starters > header p {
      max-width: none;
      text-align: left;
    }
    .workbook-projects__starter-grid,
    .workbook-projects__grid {
      grid-template-columns: 1fr;
      gap: 10px;
    }
    .workbook-starter-card {
      min-height: 108px;
    }
  }

  :global(html.light-note-mobile-rendering .workbook-starter-card:hover),
  :global(html.light-note-mobile-rendering .workbook-project-card:hover) {
    background: var(--surface-panel-bg, var(--background-color));
  }
</style>
