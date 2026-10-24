<template>
  <ResourcePageShell
    class="publications-page"
    :class="{ 'is-mobile': bookmark.isMobile }"
    :title="t('publicResources.title')"
    accent="neutral"
    layout="workspace"
    show-back
    @back="router.push('/search')"
  >
    <div v-if="!scope.eligible" class="publications-message" role="status">{{ t('publicResources.unavailable') }}</div>
    <div v-else class="publications-workspace">
      <p class="publications-intro">{{
        t('publicResources.workspace.intro', { scope: t('publicResources.include') })
      }}</p>
      <p v-if="scope.loaded && !scope.caps.submissionsEnabled" class="publications-notice" role="status">{{
        t('publicResources.batch.submissionsClosed')
      }}</p>
      <div
        v-if="selection.error.value || withdrawal.error.value || error"
        class="publications-notice is-warning"
        role="alert"
      >
        {{ t(publicResourceErrorKey(selection.error.value || withdrawal.error.value || error)) }}
        <BButton v-if="error" type="text" :disabled="operationLocked" @click="load()">{{
          t('publicResources.retry')
        }}</BButton>
      </div>
      <BTabs
        v-model:active-tab="status"
        class="publications-status"
        variant="pill"
        :options="statusOptions"
        :inert="operationLocked || undefined"
        :aria-disabled="operationLocked || undefined"
        @change="reload"
      />
      <div class="publications-layout">
        <BCard class="publications-list" padding="0">
          <header class="publications-list-heading"
            ><h2>{{ t('publicResources.workspace.myResources') }}</h2
            ><span v-if="!error && (!loading || items.length)">{{
              t('publicResources.flow.candidateCount', { count: failureOnly ? displayItems.length : total })
            }}</span></header
          >
          <div class="publications-filters">
            <BInput
              v-model:value="keyword"
              :placeholder="t('publicResources.workspace.search')"
              clearable
              :disabled="operationLocked"
              @enter="reload"
            />
            <BSelect v-model:value="kind" :options="kindOptions" :disabled="operationLocked" @change="reload" />
            <BButton :disabled="operationLocked" @click="reload">{{ t('common.search') }}</BButton>
          </div>
          <div class="publications-loaded">
            <BCheckbox
              controlled
              :checked="allPage"
              :indeterminate="somePage && !allPage"
              :disabled="operationLocked || unresolved || loading || !!error || !selectablePage.length"
              @change="toggleLoaded"
              >{{ selectLabel }}</BCheckbox
            >
            <small>{{ t('publicResources.batch.limitHint', { count: batchLimit }) }}</small>
          </div>
          <BLoading v-if="loading && !items.length" inline loading :title="t('publicResources.loading')" />
          <BVirtualList
            v-if="displayItems.length"
            ref="listRef"
            class="publications-scroll"
            :items="displayItems"
            item-key="key"
            :item-height="80"
            :gap="8"
            dynamic-height
            :has-more="hasMore && !failureOnly && !moreError && !error"
            :loading="loading || loadingMore"
            :loading-text="t('publicResources.loading')"
            @load-more="load(true)"
          >
            <template #default="{ item }">
              <div
                class="publication-row-shell"
                :class="{
                  'is-disabled': operationLocked,
                  'is-selected': chosen.has(item.key),
                  'is-current': selected && publicationKey(selected) === item.key,
                  'range-selection-anchor': range.isAnchor(item.key),
                }"
              >
                <div v-range-selection="{ controller: range, key: item.key }" class="publication-check">
                  <BCheckbox
                    controlled
                    :checked="chosen.has(item.key)"
                    :disabled="operationLocked || unresolved || (!chosen.has(item.key) && !canSelectPublication(item))"
                    :aria-label="t('publicResources.batch.selectResource', { title: item.title })"
                    @change="toggleItem(item)"
                  />
                </div>
                <BButton
                  class="publication-row"
                  :class="{ 'is-unavailable': item.sourceUnavailable || item.publication?.status === 'removed' }"
                  :disabled="operationLocked"
                  @click="rowAction(item, $event)"
                >
                  <span class="publication-row__icon" :class="'is-' + item.kind"
                    ><SvgIcon :src="icon.resource[item.kind]" size="24"
                  /></span>
                  <span class="publication-row__copy"
                    ><strong>{{ item.title }}</strong
                    ><span>
                      <small>{{ t('publicResources.' + item.kind) }} · {{ formatTime(item.updatedAt) }}</small>
                      <small
                        v-if="selected && publicationKey(selected) === item.key"
                        class="publication-preview-label"
                        >{{ t('publicResources.flow.previewing') }}</small
                      >
                      <BChip v-if="changed.get(item.key)" tone="pending" size="small">{{
                        t('publicResources.changed')
                      }}</BChip>
                      <BChip v-if="item.publication?.oldVersionPublic" tone="neutral" size="small">{{
                        t('publicResources.oldPublic')
                      }}</BChip> </span
                    ><small v-if="failures.get(item.key)" class="publication-row-error">{{
                      t(publicResourceErrorKey(failures.get(item.key)!))
                    }}</small></span
                  >
                  <BChip :tone="tone(item)" size="small">{{
                    t('publicResources.' + (item.publication?.status || 'workspace.unpublished'))
                  }}</BChip>
                </BButton>
              </div>
            </template>
          </BVirtualList>
          <div v-else-if="!loading && !error" class="publications-message"
            ><h3>{{ t('publicResources.workspace.empty') }}</h3
            ><p>{{ t('publicResources.workspace.emptyHint') }}</p></div
          >
          <div v-if="moreError" class="publications-message" role="alert"
            ><p>{{ t('publicResources.error') }}</p
            ><BButton @click="retryMore">{{ t('publicResources.retry') }}</BButton></div
          >
          <p class="publications-list-hint">{{ t('publicResources.flow.candidateHint') }}</p>
        </BCard>
        <BCard v-if="!bookmark.isMobile" class="publications-panel" padding="0"><ReadingPane /></BCard>
      </div>
      <p v-if="bookmark.isMobile && range.selecting" class="publications-range-guide" role="status">{{
        t(range.hintKey)
      }}</p>
      <BCard v-else-if="bookmark.isMobile && selected && !detailVisible" class="publications-peek" padding="0"
        ><ReadingPane compact
      /></BCard>
      <footer
        v-if="!detailVisible"
        class="publications-actions"
        role="toolbar"
        :aria-label="t('publicResources.batch.actions')"
      >
        <RangeSelectionHint :controller="range" />
        <div
          class="publications-actions-copy"
          :class="{
            'is-success': completed && !failed.length && !unresolved && !reusedOnly,
            'is-warning': failed.length || unresolved,
          }"
          role="status"
          aria-live="polite"
        >
          <strong>{{ summaryTitle }}</strong
          ><small v-if="!operationLocked && !lastOperation" class="publications-selection-hint">{{
            t('publicResources.flow.selectionHint')
          }}</small>
          <small v-else-if="operationLocked">{{
            t(submission.preparing.value ? 'publicResources.flow.confirmNext' : 'publicResources.flow.resultHere')
          }}</small>
          <BButton v-else-if="failed.length" type="text" @click="viewFailures">{{
            t(failureOnly ? 'publicResources.flow.backResources' : 'publicResources.flow.viewFailures')
          }}</BButton>
          <small v-else-if="!unresolved">{{
            t(
              lastOperation === 'withdraw'
                ? 'publicResources.batch.withdrawResultHint'
                : reusedOnly
                  ? 'publicResources.unchangedSubmission'
                  : 'publicResources.flow.reviewWaiting',
            )
          }}</small>
        </div>
        <RangeSelectionToggle v-if="bookmark.isMobile" :controller="range" />
        <BButton
          v-if="!bookmark.isMobile"
          type="text"
          :disabled="operationLocked || unresolved || !chosen.size"
          @click="clearSelection"
          >{{ t('publicResources.batch.clear') }}</BButton
        >
        <div v-if="unresolved" class="publications-actions-buttons">
          <BButton :disabled="operationLocked" @click="reconcile">{{
            t('publicResources.batch.checkResults', { count: unknownCount })
          }}</BButton>
          <BButton v-if="retryableUnknown" type="primary" :disabled="operationLocked" @click="retryUnconfirmed">{{
            t('publicResources.batch.retryUnconfirmed', { count: retryableUnknown })
          }}</BButton>
        </div>
        <div v-else class="publications-actions-buttons">
          <BButton
            class="publications-withdraw"
            :disabled="operationLocked || !selection.withdrawalTargets.value.length"
            @click="prepareWithdraw()"
            >{{
              t('publicResources.workspace.cancelCount', { count: selection.withdrawalTargets.value.length })
            }}</BButton
          >
          <BButton
            type="primary"
            :loading="submission.locked.value"
            :disabled="operationLocked || !chosen.size || !scope.caps.submissionsEnabled"
            @click="requestSubmission()"
            >{{ t('publicResources.workspace.submitCount', { count: chosen.size }) }}</BButton
          >
        </div>
      </footer>
    </div>
    <BDrawer
      :open="bookmark.isMobile && detailVisible"
      :title="t('publicResources.content')"
      mobile-full-screen
      mobile-centered-header
      body-padding="0"
      :close-disabled="operationLocked"
      @close="detailVisible = false"
    >
      <template #header-leading
        ><BButton
          icon-only
          :disabled="operationLocked"
          :aria-label="t('publicResources.backList')"
          @click="detailVisible = false"
          ><SvgIcon :src="icon.noteDetail.back" size="20" /></BButton
      ></template>
      <template #header-actions
        ><BButton icon-only :disabled="operationLocked" :aria-label="t('common.close')" @click="detailVisible = false"
          ><SvgIcon :src="icon.common.close" size="18" /></BButton
      ></template>
      <ReadingPane v-if="detailVisible" />
    </BDrawer>
  </ResourcePageShell>
</template>
<script setup lang="ts">
  import { computed, defineComponent, h, nextTick, onBeforeUnmount, ref, watch } from 'vue';
  import { onBeforeRouteLeave, useRouter } from 'vue-router';
  import { useI18n } from 'vue-i18n';
  import {
    PUBLIC_RESOURCE_LIMITS,
    type PublicationWorkspaceItem,
    type PublicationOwnState,
  } from '@lightnote/shared/public-resources';
  import { publicGet, type PublicPage } from '@/api/publicResources';
  import { bookmarkStore } from '@/store';
  import { usePublicResourceScope } from '@/store/publicResourceScope';
  import { usePublicationSelection, publicationKey, canSelectPublication } from '@/composables/usePublicationSelection';
  import { usePublicationSubmission } from '@/composables/usePublicationSubmission';
  import { usePublicationWithdrawal } from '@/composables/usePublicationWithdrawal';
  import { useRangeSelection } from '@/composables/useRangeSelection';
  import { vRangeSelect as vRangeSelection } from '@/directives/rangeSelection';
  import type { PublicBatchRow } from '@/composables/usePublicResourceBatch';
  import { useForegroundRefresh } from '@/composables/useForegroundRefresh';
  import { useMobileTopBar } from '@/composables/useMobileTopBar';
  import type { ResourceListScrollAnchor } from '@/utils/resourceListScroll';
  import { publicResourceErrorKey } from '@/utils/publicResourceErrors';
  import { escapeHtml } from '@/utils/globalSearchHighlight';
  import ResourcePageShell from '@/components/base/ResourcePageShell.vue';
  import PublicationReadingPane from '@/components/publicResources/PublicationReadingPane.vue';
  import RangeSelectionHint from '@/components/resourceActions/RangeSelectionHint.vue';
  import RangeSelectionToggle from '@/components/resourceActions/RangeSelectionToggle.vue';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BCard from '@/components/base/BasicComponents/BCard.vue';
  import BInput from '@/components/base/BasicComponents/BInput.vue';
  import BSelect from '@/components/base/BasicComponents/BSelect.vue';
  import BTabs from '@/components/base/BasicComponents/BTabs.vue';
  import BChip from '@/components/base/BasicComponents/BChip.vue';
  import BCheckbox from '@/components/base/BasicComponents/BCheckbox.vue';
  import BDrawer from '@/components/base/BasicComponents/BDrawer.vue';
  import BLoading from '@/components/base/BasicComponents/BLoading.vue';
  import BVirtualList from '@/components/base/BasicComponents/BVirtualList.vue';
  import Alert from '@/components/base/BasicComponents/BModal/Alert';
  import message from '@/components/base/BasicComponents/BMessage/BMessage';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import icon from '@/config/icon';
  const { t, locale } = useI18n(),
    router = useRouter(),
    bookmark = bookmarkStore(),
    scope = usePublicResourceScope();
  const selection = usePublicationSelection(),
    chosen = selection.items,
    selected = selection.active,
    batchLimit = PUBLIC_RESOURCE_LIMITS.selection;
  const items = ref<PublicationWorkspaceItem[]>([]),
    totals = ref<Record<string, number>>({}),
    total = ref(0),
    page = ref(1),
    keyword = ref(''),
    kind = ref('all'),
    status = ref('all'),
    loading = ref(false),
    error = ref(''),
    loadingMore = ref(false),
    moreError = ref(false),
    hasMore = ref(false);
  const readerEpoch = ref(0);
  const knownMaterials = new Map<string, string>();
  const detailVisible = ref(false),
    changed = ref(new Map<string, boolean | null>()),
    confirming = ref(false),
    failureOnly = ref(false),
    lastOperation = ref<'' | 'submit' | 'withdraw'>('');
  const listRef = ref<InstanceType<typeof BVirtualList> | null>(null);
  const submission = usePublicationSubmission(async (rows) => {
    removeCompleted(rows, false);
    await load();
  });
  const withdrawal = usePublicationWithdrawal(async (rows) => {
    removeCompleted(rows, true);
    await load();
  }, updateChecked);
  const operationLocked = computed(() => confirming.value || submission.locked.value || withdrawal.locked.value);
  const unknownCount = computed(() => submission.unknown.value.length + withdrawal.unknown.value.length);
  const unresolved = computed(() => unknownCount.value > 0);
  const retryableUnknown = computed(
    () => [...submission.unknown.value, ...withdrawal.unknown.value].filter((r) => r.checkedNotFound).length,
  );
  const resultRows = computed(() =>
    lastOperation.value === 'withdraw'
      ? withdrawal.batch.rows.value
      : lastOperation.value === 'submit'
        ? submission.rows.value
        : [],
  );
  const failed = computed(() => resultRows.value.filter((r) => r.state === 'failed'));
  const completed = computed(() => resultRows.value.filter((r) => ['success', 'reused'].includes(r.state)).length);
  const reusedCount = computed(() => resultRows.value.filter((r) => r.state === 'reused').length);
  const reusedOnly = computed(() => completed.value > 0 && reusedCount.value === resultRows.value.length);
  const failures = computed(
    () =>
      new Map(
        failed.value.map((row) => {
          const item =
            lastOperation.value === 'withdraw'
              ? [...chosen.value.values()].find((item) => item.publication?.publicId === row.key)
              : null;
          return [item ? publicationKey(item) : row.key, row.code];
        }),
      ),
  );
  const displayItems = computed(() =>
    (failureOnly.value
      ? [...chosen.value.values()].filter((item) => failures.value.has(publicationKey(item)))
      : items.value
    ).map((item) => ({ ...item, key: publicationKey(item) })),
  );
  const selectableItems = computed(() => displayItems.value.filter(canSelectPublication));
  const selectablePage = computed(() => selectableItems.value.slice(0, batchLimit));
  const allPage = computed(
    () => !!selectablePage.value.length && selectablePage.value.every((item) => chosen.value.has(item.key)),
  );
  const somePage = computed(() => selectablePage.value.some((item) => chosen.value.has(item.key)));
  const selectLabel = computed(() =>
    t(
      selectableItems.value.length > batchLimit ? 'publicResources.flow.selectFirst' : 'publicResources.flow.selectAll',
      { count: selectablePage.value.length },
    ),
  );
  const range = useRangeSelection({
    active: () => scope.eligible,
    mobile: () => bookmark.isMobile,
    blocked: () => operationLocked.value || loading.value || unresolved.value || !!error.value,
    groups: () => [{ id: 'default', keys: selectableItems.value.map((item) => item.key) }],
    scope: () => `${scope.identity}:${status.value}:${kind.value}:${keyword.value}:${failureOnly.value}`,
    apply: (keys) => {
      const targets = keys.map((key) => selectableItems.value.find((item) => item.key === key)!).filter(Boolean);
      if (!selection.add(targets)) return false;
      if (targets.length) selection.focus(targets[targets.length - 1]);
      return true;
    },
  });
  const summaryTitle = computed(() =>
    submission.preparing.value
      ? t('publicResources.flow.preparing')
      : confirming.value || (operationLocked.value && !lastOperation.value)
        ? t('publicResources.batch.selected', { count: chosen.value.size })
        : operationLocked.value
          ? t(
              lastOperation.value === 'withdraw'
                ? 'publicResources.flow.withdrawing'
                : 'publicResources.flow.submitting',
            )
          : unresolved.value
            ? t('publicResources.batch.unknownSummary', { count: unknownCount.value })
            : failed.value.length
              ? t('publicResources.flow.partial', { done: completed.value, failed: failed.value.length })
              : completed.value && reusedCount.value && !reusedOnly.value && lastOperation.value === 'submit'
                ? t('publicResources.flow.mixedSubmitted', {
                    count: completed.value - reusedCount.value,
                    kept: reusedCount.value,
                  })
                : completed.value
                  ? t(
                      reusedOnly.value && lastOperation.value === 'submit'
                        ? 'publicResources.flow.unchanged'
                        : lastOperation.value === 'withdraw'
                          ? 'publicResources.batch.withdrawSummary'
                          : 'publicResources.batch.submitSummary',
                      { count: completed.value },
                    )
                  : t('publicResources.batch.selected', { count: chosen.value.size }),
  );
  const kindOptions = computed(() =>
    ['all', 'note', 'bookmark'].map((value) => ({ value, label: t('publicResources.' + value) })),
  );
  const statusOptions = computed(() =>
    ['all', 'unpublished', 'published', 'reviewing', 'rejected', 'withdrawn', 'removed'].map((key) => ({
      key,
      label: `${t('publicResources.' + (key === 'unpublished' ? 'workspace.unpublished' : key))} ${totals.value[key] ?? '—'}`,
    })),
  );
  const formatTime = (value: string) => (value ? new Date(value).toLocaleDateString(locale.value) : '');
  const tone = (item: PublicationWorkspaceItem) =>
    item.publication?.status === 'published'
      ? ('success' as const)
      : ['removed', 'rejected'].includes(item.publication?.status || '')
        ? ('danger' as const)
        : ('neutral' as const);
  let generation = 0,
    alertOpen = false;
  let failureAnchor: ResourceListScrollAnchor | null = null;
  useMobileTopBar(['publications'], {
    ownTopBar: true,
    title: () => t('publicResources.title'),
    onBack: () => {
      void router.push('/search');
    },
  });
  function removeCompleted(rows: PublicBatchRow[], byPublication: boolean) {
    const done = new Set(rows.filter((row) => ['success', 'reused'].includes(row.state)).map((row) => row.key));
    for (const [key, item] of chosen.value)
      if (done.has(byPublication ? item.publication?.publicId || '' : key)) chosen.value.delete(key);
  }
  function updateChecked(ids: string[], states: PublicationOwnState[]) {
    const byId = new Map(states.map((item) => [item.publicId, item]));
    for (const [key, item] of chosen.value) {
      if (!item.publication || !ids.includes(item.publication.publicId)) continue;
      const current = byId.get(item.publication.publicId);
      if (!current) chosen.value.delete(key);
      else chosen.value.set(key, { ...item, publication: { ...item.publication, ...current } });
    }
  }
  let appliedFilters = { kind: 'all', status: 'all', q: '' };
  async function load(append = false) {
    if (
      !scope.eligible ||
      (append &&
        (operationLocked.value ||
          loading.value ||
          loadingMore.value ||
          !hasMore.value ||
          !!error.value ||
          moreError.value))
    )
      return;
    const current = append ? generation : ++generation,
      identity = scope.identity;
    if (append) loadingMore.value = true;
    else {
      loading.value = true;
      loadingMore.value = false;
      moreError.value = false;
      error.value = '';
      appliedFilters = { kind: kind.value, status: status.value, q: keyword.value.trim() };
    }
    const lastPage = append ? page.value + 1 : page.value;
    try {
      const collected: PublicationWorkspaceItem[] = [];
      let latest: (PublicPage<PublicationWorkspaceItem> & { totals: Record<string, number> }) | null = null;
      for (let nextPage = append ? lastPage : 1; nextPage <= lastPage; nextPage++) {
        const data = await publicGet<PublicPage<PublicationWorkspaceItem> & { totals: Record<string, number> }>(
          'workspace',
          { page: nextPage, pageSize: PUBLIC_RESOURCE_LIMITS.workspace, ...appliedFilters },
        );
        if (current !== generation || identity !== scope.identity) return;
        collected.push(...data.items);
        latest = data;
        if (!data.hasMore) break;
      }
      if (!latest) return;
      totals.value = latest.totals;
      total.value = latest.total;
      hasMore.value = latest.hasMore;
      page.value = latest.page;
      items.value = append
        ? [...new Map([...items.value, ...collected].map((item) => [publicationKey(item), item])).values()]
        : collected;
      for (const item of collected)
        if (chosen.value.has(publicationKey(item))) {
          if (canSelectPublication(item)) chosen.value.set(publicationKey(item), item);
          else chosen.value.delete(publicationKey(item));
        }
      const target = items.value.find(
        (item) => selected.value && publicationKey(item) === publicationKey(selected.value),
      );
      if (target) selected.value = target;
    } catch (e) {
      if (current === generation) {
        if (append) moreError.value = true;
        else error.value = (e as { code?: string }).code || 'PUBLIC_RESOURCE_UNAVAILABLE';
      }
    } finally {
      if (current === generation) {
        loading.value = false;
        loadingMore.value = false;
      }
    }
  }
  function retryMore() {
    moreError.value = false;
    void load(true);
  }
  function reload() {
    if (operationLocked.value) return;
    page.value = 1;
    failureOnly.value = false;
    range.reset();
    listRef.value?.scrollToTop();
    void load();
  }
  function rowAction(item: PublicationWorkspaceItem, event?: MouseEvent) {
    if (operationLocked.value) return;
    if ((event?.shiftKey || range.selecting) && range.activate(publicationKey(item), 'default', !!event?.shiftKey))
      return;
    selection.focus(item);
  }
  function toggleItem(item: PublicationWorkspaceItem) {
    if (!operationLocked.value) selection.toggle(item);
  }
  function toggleLoaded() {
    if (operationLocked.value || unresolved.value || loading.value || error.value || !selectablePage.value.length)
      return;
    if (selection.togglePage(selectablePage.value) && chosen.value.size && !selected.value)
      selection.focus(selectablePage.value[0]);
  }
  async function clearSelection() {
    if (operationLocked.value || unresolved.value) return;
    selection.clear();
    range.reset();
    lastOperation.value = '';
    failureOnly.value = false;
    await nextTick();
    if (failureAnchor) listRef.value?.restoreScrollAnchor(failureAnchor);
    failureAnchor = null;
  }
  async function viewFailures() {
    const open = !failureOnly.value;
    if (open) failureAnchor = listRef.value?.captureScrollAnchor() || null;
    failureOnly.value = open;
    range.reset();
    if (open && displayItems.value.length) selection.focus(displayItems.value[0]);
    await nextTick();
    if (open) listRef.value?.scrollToTop();
    else if (failureAnchor) listRef.value?.restoreScrollAnchor(failureAnchor);
  }
  async function requestSubmission() {
    if (operationLocked.value || unresolved.value || !chosen.value.size || !scope.caps.submissionsEnabled) return;
    const snapshot = [...chosen.value.values()].map((item) => ({ ...item })),
      identity = scope.identity;
    if (!submission.start(snapshot, knownMaterials)) return;
    lastOperation.value = 'submit';
    const ready = await submission.prepare();
    if (identity !== scope.identity) return;
    if (
      selected.value &&
      submission.failed.value.some(
        (row) => row.key === publicationKey(selected.value!) && row.code === 'PUBLIC_RESOURCE_MATERIAL_CHANGED',
      )
    )
      readerEpoch.value++;
    if (!ready) return;
    const count = submission.preparedCount.value,
      excluded = snapshot.length - count;
    confirming.value = true;
    alertOpen = true;
    Alert.alert({
      title: t('publicResources.workspace.submitConfirm', { count }),
      content: `<div class="b-alert-rich-content"><p>${escapeHtml(t('publicResources.flow.confirmHint'))}</p><p>${escapeHtml(t('publicResources.flow.privacyHint'))}</p>${excluded ? '<p>' + escapeHtml(t('publicResources.flow.excluded', { count: excluded })) + '</p>' : ''}</div>`,
      okText: t('publicResources.workspace.confirmSubmit', { count }),
      cancelText: t('publicResources.cancel'),
      onCancel: () => {
        alertOpen = false;
        confirming.value = false;
        lastOperation.value = '';
        submission.reset();
      },
      onOk: async () => {
        alertOpen = false;
        confirming.value = false;
        if (identity !== scope.identity) return;
        lastOperation.value = 'submit';
        failureOnly.value = false;
        await submission.submit();
        if (identity === scope.identity && lastOperation.value === 'submit' && reusedOnly.value)
          message.info(t('publicResources.flow.unchangedNotice'), 6);
      },
    });
  }
  async function prepareWithdraw() {
    if (operationLocked.value || unresolved.value) return;
    const identity = scope.identity,
      intent = await withdrawal.prepare(selection.withdrawalTargets.value);
    if (!intent) return;
    alertOpen = true;
    Alert.alert({
      title: t('publicResources.workspace.cancelConfirm', { count: intent.count }),
      content: escapeHtml(t('publicResources.batch.withdrawConfirm')),
      okType: 'danger',
      okText: t('publicResources.batch.confirmWithdraw', { count: intent.count }),
      cancelText: t('publicResources.cancel'),
      onCancel: () => {
        alertOpen = false;
        intent.cancel();
      },
      onOk: () => {
        alertOpen = false;
        if (identity !== scope.identity) {
          intent.cancel();
          return;
        }
        lastOperation.value = 'withdraw';
        failureOnly.value = false;
        void intent.run();
      },
    });
  }
  async function reconcile() {
    await (lastOperation.value === 'withdraw' ? withdrawal : submission).reconcile();
  }
  async function retryUnconfirmed() {
    await (lastOperation.value === 'withdraw' ? withdrawal : submission).retryUnconfirmed();
  }
  function openSource() {
    const item = selected.value;
    if (!item || item.sourceUnavailable || operationLocked.value) return;
    void router.push(
      item.kind === 'note'
        ? '/noteLibrary/' + encodeURIComponent(item.sourceId)
        : { path: '/home', query: { locate: item.sourceId } },
    );
  }
  const ReadingPane = defineComponent({
    props: { compact: Boolean },
    setup: (props) => () =>
      h(PublicationReadingPane, {
        key: readerEpoch.value,
        compact: props.compact,
        item: selected.value,
        disabled: operationLocked.value,
        unresolved: unresolved.value,
        onExpand: () => {
          detailVisible.value = true;
        },
        onSource: openSource,
        onRefresh: () => load(),
        onChanged: (key: string, value: boolean | null) => changed.value.set(key, value),
        onMaterial: (key: string, fingerprint: string) => knownMaterials.set(key, fingerprint),
      }),
  });
  watch(
    () => bookmark.isMobile,
    (mobile) => {
      if (!mobile) detailVisible.value = false;
    },
  );
  watch(
    () => scope.identity,
    async () => {
      if (alertOpen) {
        Alert.destroy();
        alertOpen = false;
      }
      generation++;
      items.value = [];
      selected.value = null;
      totals.value = {};
      total.value = 0;
      loading.value = scope.eligible;
      loadingMore.value = false;
      moreError.value = false;
      hasMore.value = false;
      error.value = '';
      page.value = 1;
      knownMaterials.clear();
      readerEpoch.value = 0;
      keyword.value = '';
      kind.value = 'all';
      status.value = 'all';
      changed.value.clear();
      detailVisible.value = false;
      confirming.value = false;
      failureOnly.value = false;
      failureAnchor = null;
      lastOperation.value = '';
      range.reset();
      const identity = scope.identity;
      if (scope.eligible) {
        await scope.ensure(true);
        if (identity === scope.identity) await load();
      }
    },
    { immediate: true, flush: 'sync' },
  );
  useForegroundRefresh({
    staleMs: 0,
    canRefresh: () => scope.eligible && !operationLocked.value && !detailVisible.value,
    refresh: async () => {
      await scope.ensure(true);
      await load();
    },
  });
  onBeforeRouteLeave(() => !operationLocked.value);
  onBeforeUnmount(() => {
    if (alertOpen) Alert.destroy();
    generation++;
    items.value = [];
    selected.value = null;
    knownMaterials.clear();
  });
</script>
<style scoped lang="less" src="./publications-workspace.less"></style>
