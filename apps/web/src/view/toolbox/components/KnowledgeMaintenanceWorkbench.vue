<template>
  <section class="knowledge-maintenance" :aria-label="t(`toolbox.tool.${toolId}.name`)">
    <section v-if="user.role === 'visitor'" class="maintenance-state">
      <SvgIcon :src="icon.toolbox.audit" size="30" />
      <h2>{{ t('toolbox.maintenance.guestTitle') }}</h2
      ><p>{{ t('toolbox.maintenance.guestDescription') }}</p>
      <BButton type="primary" @click="router.push({ name: 'login' })">{{ t('toolbox.maintenance.login') }}</BButton>
    </section>
    <template v-else>
      <div class="maintenance-toolbar">
        <div class="maintenance-scope">
          <label id="maintenance-scope-label">{{ t('toolbox.maintenance.scope') }}</label>
          <BSelect
            v-model:value="rootId"
            :options="scopeOptions"
            :disabled="loading || exporting"
            aria-labelledby="maintenance-scope-label"
            show-search
          />
        </div>
        <BButton :loading="loading" :disabled="exporting" @click="loadOverview(false)"
          ><SvgIcon :src="icon.toolbox.rotate" size="15" />{{ t('toolbox.maintenance.recheck') }}</BButton
        >
        <BButton :disabled="!overview || loading || !totalIssues" :loading="exporting" @click="exportReport"
          ><SvgIcon :src="icon.toolbox.download" size="15" />{{ t('toolbox.maintenance.exportReport') }}</BButton
        >
      </div>
      <p class="maintenance-hint">{{ t('toolbox.maintenance.readOnlyDescription') }}</p>
      <div v-if="loadError" class="maintenance-error" role="alert"
        ><span>{{ t('toolbox.maintenance.errorDescription') }}</span
        ><BButton size="small" @click="loadOverview(failedAppend)">{{ t('common.retry') }}</BButton></div
      >
      <section v-if="loading && !overview" class="maintenance-state"
        ><BLoading inline loading :title="t('toolbox.maintenance.loading')"
      /></section>
      <template v-else-if="overview">
        <div class="maintenance-summary" role="status">
          <SvgIcon :src="icon.toolbox.audit" size="22" />
          <div class="maintenance-summary__copy"
            ><strong>{{
              t('toolbox.maintenance.checkedSummary', { notes: overview.summary.total, issues: totalIssues })
            }}</strong
            ><small>{{ t('toolbox.maintenance.scannedAt', { time: formatDateTime(overview.scannedAt) }) }}</small></div
          >
          <BChip v-if="highPriorityCount" tone="danger">{{
            t('toolbox.maintenance.priorityCount', { count: highPriorityCount })
          }}</BChip
          ><BChip v-else tone="success">{{ t('toolbox.maintenance.audit.completed') }}</BChip>
        </div>
        <div class="maintenance-filters"
          ><BChip
            tone="neutral"
            v-for="option in issueFilters"
            :key="option.value"
            interactive
            :selected="activeIssueKind === option.value"
            :disabled="exporting"
            @click="activeIssueKind = option.value"
            >{{ option.label }} · {{ option.count }}</BChip
          ></div
        >
        <BCheckbox v-model:checked="includeOptional" :disabled="exporting">{{
          t('toolbox.maintenance.optionalSuggestions')
        }}</BCheckbox>
        <div v-if="overview.issues.length" class="audit-issue-list" :aria-busy="loading">
          <article v-for="item in overview.issues" :key="`${item.kind}:${item.noteId}`" :class="`is-${item.severity}`">
            <span class="audit-issue-list__signal" aria-hidden="true"></span>
            <div class="audit-issue-list__body"
              ><div class="audit-issue-list__title"
                ><BChip :tone="issueTone(item.severity)">{{ t(`toolbox.maintenance.issue.${item.kind}.label`) }}</BChip
                ><strong>{{ item.title }}</strong></div
              ><p>{{ t(`toolbox.maintenance.issue.${item.kind}.description`) }}</p
              ><small>{{ item.path }}</small></div
            >
            <BButton size="small" @click="openNote(item.noteId)">{{ t('toolbox.maintenance.openNote') }}</BButton>
          </article>
        </div>
        <div v-else class="maintenance-state is-empty"
          ><SvgIcon :src="icon.toolbox.audit" size="26" /><strong>{{ t('toolbox.maintenance.audit.noIssues') }}</strong
          ><p>{{ t('toolbox.maintenance.recheckHint') }}</p></div
        >
        <div v-if="hasMore" ref="loadMoreRef" class="maintenance-more"
          ><BButton :loading="loading" :disabled="exporting" @click="loadOverview(true)">{{
            t('toolbox.maintenance.audit.loadMore', { count: totalIssues - overview.issues.length })
          }}</BButton></div
        >
        <p v-if="overview.issues.length" class="maintenance-hint">{{ t('toolbox.maintenance.recheckHint') }}</p>
      </template>
    </template>
  </section>
</template>
<script setup lang="ts">
  import { computed, onBeforeUnmount, ref, watch } from 'vue';
  import { useI18n } from 'vue-i18n';
  import { useRoute, useRouter } from 'vue-router';
  import type { ToolboxToolId } from '@lightnote/shared/toolbox-protocol';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BCheckbox from '@/components/base/BasicComponents/BCheckbox.vue';
  import BChip from '@/components/base/BasicComponents/BChip.vue';
  import BLoading from '@/components/base/BasicComponents/BLoading.vue';
  import BSelect from '@/components/base/BasicComponents/BSelect.vue';
  import message from '@/components/base/BasicComponents/BMessage/BMessage';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import {
    fetchToolboxKnowledgeOverview,
    type ToolboxKnowledgeIssue,
    type ToolboxKnowledgeOverview,
  } from '@/api/toolbox';
  import { buildNoteDetailRequestScope } from '@/api/noteDetailPrefetch';
  import { downloadToolboxBlob } from '@/utils/toolboxLocal';
  import icon from '@/config/icon';
  import { useUserStore } from '@/store';
  defineProps<{ toolId: ToolboxToolId }>();
  const { t, locale } = useI18n();
  const route = useRoute(),
    router = useRouter(),
    user = useUserStore();
  const loading = ref(false),
    exporting = ref(false),
    loadError = ref(false),
    failedAppend = ref(false);
  const overview = ref<ToolboxKnowledgeOverview | null>(null);
  const rootId = ref('$all'),
    activeIssueKind = ref('all'),
    includeOptional = ref(false);
  const directories = ref<Array<{ id: string; path: string }>>([]);
  let requestVersion = 0;
  const loadMoreRef = ref<HTMLElement | null>(null);
  let observer: IntersectionObserver | null = null;
  const issueKindOrder = ['empty', 'invalid_parent', 'duplicate_title', 'untitled', 'deep', 'untagged', 'stale'];
  const selectedKinds = computed(() =>
    issueKindOrder.filter((kind) => includeOptional.value || !['untagged', 'stale'].includes(kind)),
  );
  const scopeOptions = computed(() => [
    { value: '$all', label: t('toolbox.maintenance.allNotes') },
    ...directories.value.map((item) => ({ value: item.id, label: item.path })),
  ]);
  const allIssueCount = computed(() =>
    selectedKinds.value.reduce((sum, kind) => sum + Number(overview.value?.issueCounts[kind] || 0), 0),
  );
  const totalIssues = computed(
    () =>
      overview.value?.selectedIssueTotal ??
      (activeIssueKind.value === 'all'
        ? allIssueCount.value
        : Number(overview.value?.issueCounts[activeIssueKind.value] || 0)),
  );
  const highPriorityCount = computed(
    () =>
      overview.value?.selectedSeverityCounts?.high ??
      overview.value?.issues.filter((item) => item.severity === 'high').length ??
      0,
  );
  const hasMore = computed(() => Boolean(overview.value && overview.value.issues.length < totalIssues.value));
  const issueFilters = computed(() => [
    { value: 'all', label: t('toolbox.maintenance.issue.all'), count: allIssueCount.value },
    ...selectedKinds.value
      .filter((kind) => Number(overview.value?.issueCounts[kind]) > 0)
      .map((kind) => ({
        value: kind,
        label: t(`toolbox.maintenance.issue.${kind}.label`),
        count: Number(overview.value?.issueCounts[kind] || 0),
      })),
  ]);
  const params = () => ({
    rootId: rootId.value === '$all' ? '' : rootId.value,
    issueKind: activeIssueKind.value,
    includeOptional: includeOptional.value,
  });
  function issueTone(severity: ToolboxKnowledgeIssue['severity']) {
    return severity === 'high' ? 'danger' : severity === 'medium' ? 'pending' : 'neutral';
  }
  function formatDateTime(value: string) {
    const date = new Date(value);
    return Number.isNaN(date.getTime())
      ? '—'
      : new Intl.DateTimeFormat(locale.value, { dateStyle: 'medium', timeStyle: 'short' }).format(date);
  }
  function openNote(noteId: string) {
    window.open(
      router.resolve({ path: `/noteLibrary/${encodeURIComponent(noteId)}`, query: { from: route.fullPath } }).href,
      '_blank',
      'noopener,noreferrer',
    );
  }
  async function loadOverview(append = false) {
    if (user.role === 'visitor' || (append && (loading.value || !hasMore.value))) return;
    const version = ++requestVersion;
    loading.value = true;
    loadError.value = false;
    failedAppend.value = append;
    const previous = overview.value;
    try {
      const result = await fetchToolboxKnowledgeOverview({
        ...params(),
        snapshot: append ? previous?.snapshotVersion : undefined,
        offset: append ? previous?.issues.length || 0 : 0,
        limit: 50,
      });
      if (version !== requestVersion) return;
      result.issues = result.issues.filter(
        (item) =>
          selectedKinds.value.includes(item.kind) &&
          (activeIssueKind.value === 'all' || item.kind === activeIssueKind.value),
      );
      if (append && previous) {
        const known = new Set(previous.issues.map((item) => `${item.kind}:${item.noteId}`));
        result.issues = [
          ...previous.issues,
          ...result.issues.filter((item) => !known.has(`${item.kind}:${item.noteId}`)),
        ];
        // Stop paging if concurrent edits shifted the result set; recheck starts a fresh list.
        if (result.issues.length === previous.issues.length) {
          loadError.value = true;
          return;
        }
      }
      overview.value = result;
      if (result.scopeOptions) directories.value = result.scopeOptions;
    } catch {
      if (version === requestVersion) loadError.value = true;
    } finally {
      if (version === requestVersion) loading.value = false;
    }
  }
  async function exportReport() {
    if (exporting.value || !overview.value) return;
    exporting.value = true;
    const version = requestVersion,
      query = params();
    const issues: ToolboxKnowledgeIssue[] = [];
    try {
      let result: ToolboxKnowledgeOverview;
      let snapshot: string | undefined;
      do {
        result = await fetchToolboxKnowledgeOverview({ ...query, snapshot, offset: issues.length, limit: 500 });
        snapshot = result.snapshotVersion;
        if (version !== requestVersion) return;
        if (!result.issues.length) break;
        issues.push(...result.issues);
      } while (issues.length < (result.selectedIssueTotal ?? result.issueTotal) && issues.length < 140000);
      const content = JSON.stringify(
        {
          scannedAt: result!.scannedAt,
          scope: scopeOptions.value.find((item) => item.value === rootId.value)?.label,
          issueKind: query.issueKind,
          includeOptional: query.includeOptional,
          issues,
        },
        null,
        2,
      );
      downloadToolboxBlob(
        new Blob([content], { type: 'application/json;charset=utf-8' }),
        'lightnote-structure-report.json',
      );
    } catch {
      message.error(t('toolbox.maintenance.exportFailed'));
    } finally {
      exporting.value = false;
    }
  }
  watch([rootId, activeIssueKind, includeOptional], () => {
    if (activeIssueKind.value !== 'all' && !selectedKinds.value.includes(activeIssueKind.value))
      activeIssueKind.value = 'all';
    overview.value = null;
    void loadOverview();
  });
  watch(
    () => buildNoteDetailRequestScope(user),
    () => {
      requestVersion++;
      overview.value = null;
      directories.value = [];
      rootId.value = '$all';
      loading.value = false;
      void loadOverview();
    },
    { immediate: true },
  );
  watch(loadMoreRef, (element) => {
    observer?.disconnect();
    if (!element || typeof IntersectionObserver === 'undefined') return;
    observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting) && !loadError.value && !exporting.value)
        void loadOverview(true);
    });
    observer.observe(element);
  });
  onBeforeUnmount(() => {
    requestVersion++;
    observer?.disconnect();
  });
</script>
<style scoped lang="less">
  .knowledge-maintenance {
    display: grid;
    gap: var(--ui-space-14, 14px);
  }
  .maintenance-toolbar {
    display: flex;
    align-items: end;
    gap: var(--ui-space-8, 8px);
    flex-wrap: wrap;
  }
  .maintenance-scope {
    display: grid;
    gap: var(--ui-space-6, 6px);
    flex: 1;
    min-width: var(--ui-layout-180, 180px);
    max-width: var(--ui-layout-440, 440px);
  }
  .maintenance-scope label,
  .maintenance-hint {
    color: var(--desc-color);
    font-size: var(--ui-font-12, 12px);
  }
  .maintenance-hint {
    margin: 0;
    line-height: 1.6;
  }
  .maintenance-toolbar :deep(.b_btn) {
    gap: var(--ui-space-6, 6px);
  }
  .maintenance-summary {
    display: flex;
    align-items: center;
    gap: var(--ui-space-12, 12px);
    padding: var(--ui-space-14, 14px);
    border: 1px solid var(--surface-border-color);
    border-radius: 12px;
    background: var(--workspace-panel-bg-color);
  }
  .maintenance-summary__copy {
    flex: 1;
    display: grid;
    gap: var(--ui-space-5, 5px);
  }
  .maintenance-summary strong {
    font-size: var(--ui-font-15, 15px);
  }
  .maintenance-summary small,
  .audit-issue-list small {
    color: var(--desc-color);
    font-size: var(--ui-font-12, 12px);
    overflow-wrap: anywhere;
  }
  .maintenance-filters {
    display: flex;
    flex-wrap: wrap;
    gap: var(--ui-space-8, 8px);
  }
  .audit-issue-list {
    border: 1px solid var(--surface-border-color);
    border-radius: 12px;
    overflow: hidden;
  }
  .audit-issue-list article {
    display: flex;
    align-items: center;
    gap: var(--ui-space-12, 12px);
    padding: var(--ui-space-14, 14px);
    background: var(--card-background);
  }
  .audit-issue-list article + article {
    border-top: 1px solid var(--surface-border-color);
  }
  .audit-issue-list__signal {
    flex: 0 0 var(--ui-space-6, 6px);
    height: var(--ui-space-6, 6px);
    border-radius: 50%;
    background: var(--desc-color);
  }
  .is-high .audit-issue-list__signal {
    background: var(--danger-color);
  }
  .is-medium .audit-issue-list__signal {
    background: var(--warning-color);
  }
  .audit-issue-list__body {
    flex: 1;
    min-width: 0;
  }
  .audit-issue-list__title {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: var(--ui-space-8, 8px);
  }
  .audit-issue-list__title strong {
    font-size: var(--ui-font-14, 14px);
    overflow-wrap: anywhere;
  }
  .audit-issue-list p {
    margin: var(--ui-space-7, 7px) 0;
    font-size: var(--ui-font-13, 13px);
    color: var(--desc-color);
    line-height: 1.5;
  }
  .maintenance-state {
    min-height: var(--ui-layout-240, 240px);
    display: flex;
    flex-direction: column;
    gap: var(--ui-space-12, 12px);
    align-items: center;
    justify-content: center;
    text-align: center;
    padding: var(--ui-space-20, 20px);
  }
  .maintenance-state h2,
  .maintenance-state p {
    margin: 0;
  }
  .maintenance-error {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--ui-space-10, 10px);
    color: var(--danger-color);
  }
  .maintenance-more {
    display: flex;
    justify-content: center;
  }
  @media (max-width: 767px) {
    .maintenance-scope {
      max-width: none;
      flex-basis: 100%;
    }
    .maintenance-toolbar > :deep(.b_btn) {
      flex: 1;
    }
    .maintenance-summary {
      flex-wrap: wrap;
    }
    .maintenance-summary__copy {
      min-width: 70%;
    }
    .audit-issue-list article {
      flex-wrap: wrap;
      gap: var(--ui-space-10, 10px);
    }
    .audit-issue-list__body {
      flex-basis: calc(100% - var(--ui-space-16, 16px));
    }
    .audit-issue-list article > :deep(.b_btn) {
      margin-left: var(--ui-space-16, 16px);
    }
  }
</style>
