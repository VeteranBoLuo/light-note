<template>
  <main ref="pageRef" class="document-projects">
    <div class="document-projects__inner">
      <nav class="document-projects__breadcrumb" :aria-label="t('toolboxProject.list.navigation')">
        <BButton @click="returnToToolbox">
          <SvgIcon :src="icon.toolbox.back" size="17" />
          {{ t('toolboxProject.list.backToolbox') }}
        </BButton>
      </nav>
      <header class="document-projects__hero">
        <span class="document-projects__eyebrow">
          <SvgIcon :src="icon.toolbox.documentStudio" size="16" />{{ t('toolboxProject.list.eyebrow') }}
        </span>
        <div class="document-projects__heading">
          <div>
            <h1>{{ t('toolboxProject.list.title') }}</h1>
            <p>{{ t('toolboxProject.list.description') }}</p>
          </div>
          <BButton type="primary" @click="openNoteLibrary">{{ t('toolboxProject.list.openNoteLibrary') }}</BButton>
        </div>
      </header>

      <section class="document-projects__body" :aria-label="t('toolboxProject.list.title')">
        <header class="document-projects__body-header">
          <strong>{{ t('toolboxProject.list.myDocuments') }}</strong>
          <small v-if="!loading && !loadError">{{
            t(projectsCursor ? 'toolboxProject.list.loadedProjectCount' : 'toolboxProject.list.projectCount', {
              count: projects.length,
            })
          }}</small>
        </header>
        <div v-if="loading" class="document-projects__state">
          <BLoading inline loading :title="t('toolboxProject.list.loading')" />
        </div>
        <div v-else-if="loadError" class="document-projects__state is-error" role="alert">
          <SvgIcon :src="icon.toolbox.task" size="24" />
          <strong>{{ t('toolboxProject.list.loadFailed') }}</strong>
          <span>{{ t('toolboxProject.list.loadFailedHint') }}</span>
          <BButton @click="loadProjects()">{{ t('common.retry') }}</BButton>
        </div>
        <div v-else-if="projects.length === 0" class="document-projects__state is-empty">
          <span class="document-projects__empty-icon">
            <SvgIcon :src="icon.toolbox.documentStudio" size="28" />
          </span>
          <strong>{{ t('toolboxProject.list.emptyTitle') }}</strong>
          <span>{{ t('toolboxProject.list.emptyDescription') }}</span>
          <BButton type="primary" @click="openNoteLibrary">{{ t('toolboxProject.list.openNoteLibrary') }}</BButton>
        </div>
        <template v-else>
          <div class="document-projects__grid">
            <BButton
              v-for="project in projects"
              :key="project.id"
              class="document-project-card"
              :aria-label="`${t('toolboxProject.list.open')} ${project.title || t('toolboxProject.untitled')}`"
              @click="openProject(project.id)"
            >
              <span class="document-project-card__icon">
                <SvgIcon :src="icon.toolbox.documentStudio" size="22" />
              </span>
              <span class="document-project-card__copy">
                <strong>{{ project.title || t('toolboxProject.untitled') }}</strong>
                <small>{{ t('toolboxProject.list.updated', { time: formatDate(project.updatedAt) }) }}</small>
              </span>
              <SvgIcon class="document-project-card__arrow" :src="icon.toolbox.arrow" size="15" />
            </BButton>
          </div>
          <div v-if="projectsCursor" class="document-projects__more">
            <BButton :loading="loadingMore" @click="loadMoreProjects">{{ t('common.loadMore') }}</BButton>
          </div>
        </template>
      </section>
    </div>
  </main>
</template>

<script setup lang="ts">
  import { nextTick, onMounted, ref } from 'vue';
  import { useI18n } from 'vue-i18n';
  import { useRoute, useRouter } from 'vue-router';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BLoading from '@/components/base/BasicComponents/BLoading.vue';
  import message from '@/components/base/BasicComponents/BMessage/BMessage';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import icon from '@/config/icon';
  import { useUserStore } from '@/store';
  import {
    restoreToolboxScrollSnapshot,
    returnFromToolboxPage,
    saveToolboxScrollSnapshot,
  } from '@/utils/toolboxNavigation';
  import { toolboxRecentUseIdentityKey } from '@/utils/toolboxRecentUse';
  import { fetchToolboxProjectsPage, type ToolboxProjectSummary } from '@/api/toolboxProjects';

  const { t, locale } = useI18n();
  const route = useRoute();
  const router = useRouter();
  const user = useUserStore();
  const pageRef = ref<HTMLElement | null>(null);
  const loading = ref(true);
  const loadError = ref(false);
  const loadingMore = ref(false);
  const projectsCursor = ref<string | null>(null);
  const projects = ref<ToolboxProjectSummary[]>([]);

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
        projectType: 'document',
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

  function openProject(projectId: string) {
    rememberProjectsScroll();
    router.push({ name: 'toolboxDocumentProject', params: { projectId } });
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

  function openNoteLibrary() {
    rememberProjectsScroll();
    void router.push({ name: 'noteLibrary' });
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

  .document-projects {
    .toolbox-page-scroll();
    color: var(--text-color);
    background: var(--background-color);
  }

  .document-projects__inner {
    width: min(1180px, calc(100% - 48px));
    margin: 0 auto;
    padding: 32px 0 56px;
  }

  .document-projects__breadcrumb {
    display: flex;
    margin-bottom: 12px;
  }
  .document-projects__breadcrumb :deep(.b_btn) {
    gap: 7px;
  }

  .document-projects__hero,
  .document-projects__body {
    border: 1px solid var(--surface-border-color);
    border-radius: 20px;
    background: var(--surface-panel-bg, var(--background-color));
  }

  .document-projects__body-header {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 12px;
  }
  .document-projects__body-header strong {
    font-size: 17px;
  }
  .document-projects__body-header small {
    color: var(--desc-color);
  }

  .document-projects__hero {
    padding: 28px 32px;
    border-left: 4px solid var(--primary-color);
    background: var(--surface-panel-bg, var(--background-color));
  }

  .document-projects__eyebrow {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    color: var(--primary-color);
    font-size: 13px;
    font-weight: 650;
  }

  .document-projects__heading {
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

  .document-projects__body {
    min-height: 360px;
    margin-top: 18px;
    padding: 24px;
  }

  .document-projects__state {
    min-height: 300px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 10px;
    color: var(--desc-color);
    text-align: center;
  }

  .document-projects__state strong {
    color: var(--text-color);
    font-size: 18px;
  }
  .document-projects__state.is-error > svg {
    color: var(--error-color, #d9363e);
  }

  .document-projects__empty-icon,
  .document-project-card__icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    color: var(--primary-color);
    background: var(--surface-selected-bg, #f1f0ff);
    border: 1px solid var(--surface-selected-border, #c9c6ff);
    border-radius: 14px;
  }

  .document-projects__empty-icon {
    width: 58px;
    height: 58px;
  }
  .document-projects__grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 14px;
  }
  .document-projects__more {
    display: flex;
    justify-content: center;
    padding-top: 18px;
  }

  .document-project-card {
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

  .document-project-card:hover,
  .document-project-card:focus-visible {
    border-color: var(--primary-color) !important;
    background: var(--surface-hover-bg, var(--active-background-color));
  }

  .document-project-card__icon {
    flex: 0 0 auto;
    width: 46px;
    height: 46px;
  }
  .document-project-card__copy {
    min-width: 0;
    flex: 1;
    display: grid;
    gap: 8px;
  }
  .document-project-card__copy strong,
  .document-project-card__copy small {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .document-project-card__copy strong {
    font-size: 15px;
  }
  .document-project-card__copy small {
    color: var(--desc-color);
    font-size: 12px;
  }
  .document-project-card__arrow {
    flex: 0 0 auto;
    color: var(--desc-color);
  }

  @media (max-width: 920px) {
    .document-projects__grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }

  @media (max-width: 767px) {
    .document-projects__inner {
      width: 100%;
      padding: 12px 12px 96px;
    }
    .document-projects__breadcrumb {
      margin-bottom: 8px;
    }
    .document-projects__hero {
      padding: 22px 18px;
      border-radius: 18px;
    }
    .document-projects__heading {
      align-items: stretch;
      flex-direction: column;
      gap: 18px;
    }
    .document-projects__heading :deep(.b_btn) {
      width: 100%;
    }
    .document-projects__body {
      min-height: 320px;
      margin-top: 12px;
      padding: 12px;
      border-radius: 18px;
    }
    .document-projects__grid {
      grid-template-columns: 1fr;
      gap: 10px;
    }
    .document-project-card {
      min-height: 92px;
    }
  }

  :global(html.light-note-mobile-rendering .document-project-card:hover) {
    background: var(--surface-panel-bg, var(--background-color));
  }
</style>
