<template>
  <main ref="pageRef" class="toolbox-tasks-page" data-mobile-resource-scroll @scroll.passive="onScroll">
    <div class="toolbox-tasks-page__inner">
      <ToolboxPageHeader
        :title="t('toolbox.presentation.tasks')"
        :category="t('toolbox.title')"
        :back-label="t('toolbox.back')"
        @back="returnHome"
      />
      <div class="task-filters">
        <BTabs :active-tab="filter" :options="filters" variant="pill" @update:active-tab="changeFilter" />
        <BButton type="text" :loading="refreshing" @click="reload">{{ t('common.refresh') }}</BButton>
      </div>
      <div class="task-list-heading"
        ><strong>{{ t(`toolbox.taskList.filters.${filter}`) }}</strong
        ><span>{{ t('toolbox.taskList.order') }}</span></div
      >
      <BLoading v-if="loading && !items.length" loading :title="t('common.loading')" />
      <div v-else-if="failed && !items.length" class="task-list-state" role="alert">
        <span>{{ t('toolbox.home.loadFailed') }}</span
        ><BButton @click="reload">{{ t('common.retry') }}</BButton>
      </div>
      <div v-else-if="!items.length" class="task-list-state">{{ t('toolbox.taskList.empty') }}</div>
      <div v-else class="task-records">
        <article v-for="job in items" :key="`${job.extraction ? 'extraction' : 'job'}:${job.id}`" class="task-record">
          <span class="task-record__icon"><SvgIcon :src="presentation(job).icon" size="22" /></span>
          <div class="task-record__copy">
            <div class="task-record__title">
              <BButton type="text" class="task-name" @click="open(job)">{{ title(job) }}</BButton>
              <BChip
                :tone="
                  job.extraction?.status === 'paused'
                    ? 'pending'
                    : toolboxJobStatusTone(job.save.status === 'save_failed' ? 'failed' : job.status)
                "
                >{{ toolboxTaskStateLabel(job, t) }}</BChip
              >
            </div>
            <div class="task-record__meta">{{ t(`toolbox.tool.${job.toolId}.name`) }} · {{ date(job.updatedAt) }}</div>
            <p v-if="job.extraction">{{
              t('extraction.progress', { done: job.extraction.processed, total: job.extraction.total })
            }}</p>
            <p v-else-if="job.save.status === 'save_failed'">{{ t('toolbox.taskList.saveFailed') }}</p>
            <p v-else-if="job.status === 'failed'">{{
              t(toolboxErrorMessageKey(job.error, 'toolbox.task.processingFailed'))
            }}</p>
            <small v-if="!job.title && !job.artifact && !job.extraction">{{ t('toolbox.taskList.legacy') }}</small>
          </div>
          <div class="task-record__actions">
            <BButton type="text" @click="open(job)"
              >{{ t(toolboxTaskReady(job) ? 'toolbox.home.viewResultAction' : 'toolbox.taskList.details')
              }}<SvgIcon :src="icon.ai.sourceArrow" size="14"
            /></BButton>
          </div>
        </article>
      </div>
      <div class="task-list-foot" role="status">
        <BLoading v-if="loading && items.length" inline loading :title="t('common.loading')" />
        <template v-else-if="failed && items.length"
          ><span>{{ t(failedAppend ? 'toolbox.taskList.appendFailed' : 'toolbox.taskList.refreshFailed') }}</span
          ><BButton type="text" @click="failedAppend ? loadMore() : reload()">{{
            t('common.retry')
          }}</BButton></template
        >
        <span v-else-if="items.length && !nextCursor">{{ t('toolbox.taskList.end') }}</span>
      </div>
    </div>
  </main>
</template>
<script setup lang="ts">
  import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
  import { useRoute, useRouter } from 'vue-router';
  import { useI18n } from 'vue-i18n';
  import { fetchToolboxTaskPage, type ToolboxJob, type ToolboxTaskFilter } from '@/api/toolbox';
  import { useUserStore } from '@/store';
  import { TOOLBOX_PRESENTATION, toolboxJobStatusTone } from '@/config/toolbox';
  import type { ToolboxToolId } from '@lightnote/shared/toolbox-protocol';
  import icon from '@/config/icon';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BChip from '@/components/base/BasicComponents/BChip.vue';
  import BTabs from '@/components/base/BasicComponents/BTabs.vue';
  import BLoading from '@/components/base/BasicComponents/BLoading.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import ToolboxPageHeader from './components/ToolboxPageHeader.vue';
  import { useMobileTopBar } from '@/composables/useMobileTopBar';
  import { useDensityScrollAnchor } from '@/composables/useDensityScrollAnchor';
  import { useForegroundRefresh } from '@/composables/useForegroundRefresh';
  import { restoreToolboxScrollSnapshot, saveToolboxScrollSnapshot } from '@/utils/toolboxNavigation';
  import { toolboxRecentUseIdentityKey } from '@/utils/toolboxRecentUse';
  import { toolboxTaskReady, toolboxTaskStateLabel, toolboxTaskTitle } from '@/utils/toolboxTaskPresentation';
  import { toolboxErrorMessageKey } from '@/utils/toolboxErrorPresentation';
  const { t, locale } = useI18n();
  const route = useRoute(),
    router = useRouter(),
    user = useUserStore();
  const keys: ToolboxTaskFilter[] = ['all', 'failed', 'active', 'paused', 'ready', 'finished'];
  const filter = computed<ToolboxTaskFilter>(() =>
    keys.includes(route.query.filter as ToolboxTaskFilter) ? (route.query.filter as ToolboxTaskFilter) : 'all',
  );
  const filters = computed(() => keys.map((key) => ({ key, label: t(`toolbox.taskList.filters.${key}`) })));
  const identity = computed(() => toolboxRecentUseIdentityKey(user));
  const pageRef = ref<HTMLElement | null>(null),
    items = ref<ToolboxJob[]>([]),
    nextCursor = ref<string | null>(null);
  const failedAppend = ref(false);
  const loading = ref(false),
    refreshing = ref(false),
    failed = ref(false);
  let generation = 0,
    pages = 0,
    disposed = false;
  useDensityScrollAnchor(pageRef);
  const title = (job: ToolboxJob) => toolboxTaskTitle(job, t, locale.value);
  const presentation = (job: ToolboxJob) =>
    TOOLBOX_PRESENTATION[job.toolId as ToolboxToolId] || TOOLBOX_PRESENTATION.material_to_note;
  const date = (value: string) =>
    Number.isFinite(Date.parse(value))
      ? new Intl.DateTimeFormat(locale.value, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
      : '';
  function returnHome() {
    const back = router.options.history.state.back;
    if (typeof back === 'string' && router.resolve(back).name === 'toolboxHome') router.back();
    else void router.replace({ name: 'toolboxHome' });
  }
  useMobileTopBar(['toolboxTasks'], {
    title: () => t('toolbox.presentation.tasks'),
    onBack: returnHome,
    showNotification: false,
    searchMode: 'icon',
  });
  function changeFilter(value: string | number) {
    if (keys.includes(value as ToolboxTaskFilter)) void router.replace({ query: { ...route.query, filter: value } });
  }
  function remember() {
    saveToolboxScrollSnapshot({ routeFullPath: route.fullPath, identityKey: identity.value, element: pageRef.value });
    window.history.replaceState(
      { ...window.history.state, toolboxTaskPages: { owner: identity.value, filter: filter.value, pages } },
      '',
    );
  }
  function open(job: ToolboxJob) {
    remember();
    void router.push(
      job.extraction
        ? { path: '/toolbox/extraction', query: { id: job.id } }
        : `/toolbox/task/${encodeURIComponent(job.id)}`,
    );
  }
  async function read(sequence: number, append: boolean) {
    if (disposed || sequence !== generation) return;
    loading.value = true;
    failed.value = false;
    try {
      const result = await fetchToolboxTaskPage({
        filter: filter.value,
        ...(append && nextCursor.value ? { cursor: nextCursor.value } : {}),
      });
      if (sequence !== generation || disposed) return;
      const known = new Set(
        (append ? items.value : []).map((job) => `${job.extraction ? 'extraction' : 'job'}:${job.id}`),
      );
      const fresh = result.items.filter((job) => !known.has(`${job.extraction ? 'extraction' : 'job'}:${job.id}`));
      items.value = append ? [...items.value, ...fresh] : fresh;
      nextCursor.value = result.nextCursor;
      pages = append ? pages + 1 : 1;
    } catch {
      if (sequence === generation) {
        failed.value = true;
        failedAppend.value = append;
      }
    } finally {
      if (sequence === generation) loading.value = false;
    }
  }
  async function reload() {
    const sequence = ++generation;
    refreshing.value = Boolean(items.value.length);
    await read(sequence, false);
    if (sequence === generation) {
      refreshing.value = false;
      await nextTick();
      onScroll();
    }
  }
  async function loadMore() {
    if (loading.value || !nextCursor.value) return;
    await read(generation, true);
    await nextTick();
    if (!failed.value) onScroll();
  }
  function onScroll() {
    const el = pageRef.value;
    if (
      el &&
      !loading.value &&
      !failed.value &&
      nextCursor.value &&
      el.scrollHeight - el.scrollTop - el.clientHeight < 180
    )
      void loadMore();
  }
  watch(
    [identity, filter],
    async () => {
      const sequence = ++generation;
      items.value = [];
      nextCursor.value = null;
      pages = 0;
      refreshing.value = false;
      const saved = window.history.state?.toolboxTaskPages;
      const restorePages =
        saved?.owner === identity.value && saved?.filter === filter.value ? Math.max(1, Number(saved.pages) || 1) : 1;
      await read(sequence, false);
      while (sequence === generation && !failed.value && nextCursor.value && pages < restorePages)
        await read(sequence, true);
      if (sequence !== generation) return;
      await nextTick();
      restoreToolboxScrollSnapshot({
        routeFullPath: route.fullPath,
        identityKey: identity.value,
        element: pageRef.value,
      });
      onScroll();
    },
    { immediate: true },
  );
  useForegroundRefresh({ refresh: reload, canRefresh: () => !loading.value });
  onBeforeUnmount(() => {
    disposed = true;
    generation++;
  });
</script>
<style scoped lang="less">
  .toolbox-tasks-page {
    height: 100%;
    min-height: 0;
    overflow: auto;
    color: var(--text-color);
    background: var(--workspace-open-canvas);
  }
  .toolbox-tasks-page__inner {
    max-width: var(--ui-layout-1200, 1200px);
    margin: 0 auto;
    padding: var(--ui-space-24, 24px);
  }
  .task-filters {
    display: flex;
    gap: var(--ui-space-12, 12px);
    align-items: center;
    justify-content: space-between;
    margin: var(--ui-space-24, 24px) 0 var(--ui-space-16, 16px);
    min-width: 0;
  }
  .task-filters :deep(.tab-container) {
    min-width: 0;
    overflow-x: auto;
    flex: 1;
  }
  .task-filters :deep(.tab) {
    flex-shrink: 0;
  }
  .task-filters :deep(.tab.is-active) {
    border-color: var(--primary-color);
  }
  .task-list-heading {
    display: flex;
    justify-content: space-between;
    gap: var(--ui-space-12, 12px);
    margin-bottom: var(--ui-space-12, 12px);
  }
  .task-list-heading span,
  .task-record__meta,
  .task-record small,
  .task-list-foot {
    color: var(--desc-color);
    font-size: var(--ui-font-12, 12px);
  }
  .task-records {
    border: 1px solid var(--workspace-border);
    border-radius: 14px;
    overflow: hidden;
    background: var(--workspace-content);
  }
  .task-record {
    display: flex;
    align-items: flex-start;
    gap: var(--ui-space-14, 14px);
    padding: var(--ui-space-20, 20px);
  }
  .task-record + .task-record {
    border-top: 1px solid var(--workspace-divider);
  }
  .task-record__icon {
    display: grid;
    place-items: center;
    color: var(--primary-color);
    width: var(--ui-layout-36, 36px);
    height: var(--ui-layout-36, 36px);
    flex-shrink: 0;
    background: var(--body-background);
    border-radius: 10px;
  }
  .task-record__copy {
    flex: 1;
    min-width: 0;
  }
  .task-record__title {
    display: flex;
    flex-wrap: wrap;
    gap: var(--ui-space-10, 10px);
    align-items: center;
  }
  .task-name.b_btn {
    color: var(--text-color);
    font-weight: 650;
    font-size: var(--ui-font-15, 15px);
    padding: 0;
    height: auto;
    text-align: left;
    white-space: normal;
    overflow-wrap: anywhere;
  }
  .task-record__meta {
    margin-top: var(--ui-space-6, 6px);
  }
  .task-record p {
    margin: var(--ui-space-8, 8px) 0 0;
    color: var(--text-secondary);
    font-size: var(--ui-font-13, 13px);
  }
  .task-record small {
    display: block;
    margin-top: var(--ui-space-4, 4px);
  }
  .task-record__actions {
    flex-shrink: 0;
  }
  .task-list-foot,
  .task-list-state {
    display: flex;
    justify-content: center;
    align-items: center;
    gap: var(--ui-space-12, 12px);
    padding: var(--ui-space-24, 24px);
  }
  @media (max-width: 767px) {
    .toolbox-tasks-page__inner {
      padding: var(--ui-space-14, 14px);
    }
    .task-filters {
      gap: var(--ui-space-6, 6px);
      margin-top: var(--ui-space-16, 16px);
    }
    .task-record {
      padding: var(--ui-space-14, 14px);
      gap: var(--ui-space-10, 10px);
      flex-wrap: wrap;
    }
    .task-record__title {
      align-items: flex-start;
      flex-direction: column-reverse;
      gap: var(--ui-space-6, 6px);
    }
    .task-record__actions {
      margin-left: auto;
    }
  }
</style>
