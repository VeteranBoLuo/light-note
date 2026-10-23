<template>
  <main class="public-moderation" :class="{ 'is-mobile': bookmark.isMobile }">
    <CommunityLayout
      ><template #navigation><CommunityNavigation active="feed" /></template>
      <section class="public-moderation-main">
        <h1>{{ t('community.feed.moderation') }}</h1>
        <BTabs
          :active-tab="'publicResources'"
          variant="line"
          :options="sectionOptions"
          :inert="locked || undefined"
          @change="emit('section', String($event))"
        />
        <p class="moderation-subtitle">{{ t('publicResources.moderationIntro') }}</p>
        <div v-if="!canReview" role="status">{{ t('publicResources.unavailable') }}</div>
        <template v-else>
          <BTabs
            v-model:active-tab="queue"
            variant="pill"
            :options="queueOptions"
            :inert="locked || undefined"
            @change="reload()"
          />
          <p v-if="error || selectionError" role="alert" class="moderation-error"
            >{{ t(publicResourceErrorKey(error || selectionError)) }}
            <BButton v-if="error" :disabled="locked" @click="load()">{{ t('publicResources.retry') }}</BButton></p
          >
          <div class="moderation-workspace">
            <BCard class="moderation-queue" padding="0">
              <header class="moderation-list-heading"
                ><h2>{{
                  t(
                    'publicResources.' +
                      (queue === 'pending'
                        ? 'pendingQueue'
                        : queue === 'reports'
                          ? 'reports'
                          : queue === 'removed'
                            ? 'removedQueue'
                            : 'publicQueue'),
                  )
                }}</h2
                ><span v-if="!error && (!loading || items.length)">{{
                  t('publicResources.flow.candidateCount', { count: total })
                }}</span></header
              >
              <div v-if="queue !== 'reports'" class="moderation-filters"
                ><BInput
                  v-model:value="query"
                  :disabled="locked"
                  :placeholder="t('publicResources.flow.reviewSearch')"
                  clearable
                  @enter="reload"
                /><BSelect v-model:value="kind" :options="kindOptions" :disabled="locked" @change="reload" /><BButton
                  :disabled="locked"
                  @click="reload"
                  >{{ t('common.search') }}</BButton
                ></div
              >
              <div v-if="queue === 'pending'" class="moderation-select-line"
                ><BCheckbox
                  controlled
                  :checked="allSelected"
                  :indeterminate="someSelected && !allSelected"
                  :disabled="locked || unresolved || loading || !!error || !selectionRange.length"
                  @change="toggleAll"
                  >{{ selectLabel }}</BCheckbox
                ><small>{{ t('publicResources.batch.limitHint', { count: limit }) }}</small></div
              >
              <BLoading v-if="loading && !items.length" inline loading :title="t('publicResources.loading')" />
              <BVirtualList
                v-if="displayItems.length"
                ref="listRef"
                class="moderation-list"
                :items="displayItems"
                item-key="key"
                :item-height="88"
                :gap="8"
                dynamic-height
                :loading="loading || loadingMore"
                :has-more="queue === 'pending' && hasMore && !moreError && !error"
                :loading-text="t('publicResources.loading')"
                @load-more="load(true)"
              >
                <template #default="{ item }"
                  ><div
                    class="moderation-row-shell"
                    :class="{
                      'is-chosen': chosen.has(item.publicId),
                      'is-current': (selected?.reportId || selected?.publicId) === item.key,
                      'range-selection-anchor': range.isAnchor(item.key),
                    }"
                  >
                    <div
                      v-if="queue === 'pending'"
                      v-range-selection="{ controller: range, key: item.key }"
                      class="moderation-check"
                      ><BCheckbox
                        controlled
                        :checked="chosen.has(item.publicId)"
                        :disabled="locked || unresolved || loading"
                        :aria-label="t('publicResources.batch.selectResource', { title: item.title })"
                        @change="toggle(item)"
                    /></div>
                    <BButton class="moderation-row" :disabled="locked || loading" @click="rowAction(item, $event)"
                      ><span class="moderation-type" :class="'is-' + item.kind"
                        ><SvgIcon :src="icon.resource[item.kind]" size="22" /></span
                      ><span class="moderation-row-copy"
                        ><strong>{{ item.title }}</strong
                        ><span>{{ item.authorName }} · V{{ item.revision }}</span
                        ><small v-if="item.reason">{{ item.reason }}</small
                        ><small v-else>{{
                          t(
                            item.ai
                              ? item.ai.decision === 'pass'
                                ? 'publicResources.aiPass'
                                : 'publicResources.aiHold'
                              : 'publicResources.flow.aiNotRun',
                          )
                        }}</small
                        ><small v-if="failures.get(item.publicId)" class="moderation-row-error">{{
                          t(
                            failures.get(item.publicId) === 'PUBLIC_RESOURCE_VERSION_CONFLICT'
                              ? 'publicResources.flow.reviewChanged'
                              : publicResourceErrorKey(failures.get(item.publicId)!),
                          )
                        }}</small></span
                      ></BButton
                    >
                    <BButton
                      v-if="queue === 'pending'"
                      class="moderation-approve-row"
                      icon-only
                      :disabled="locked || unresolved || loading"
                      :aria-label="t('publicResources.flow.approveResource', { title: item.title })"
                      :title="t('publicResources.approve')"
                      @click="runReview([item], 'approve')"
                      ><SvgIcon :src="icon.organize.check" size="20"
                    /></BButton> </div
                ></template>
              </BVirtualList>
              <p v-else-if="!loading && !error" class="moderation-empty">{{ t('publicResources.reviewEmpty') }}</p>
              <p v-if="moreError" class="moderation-error"
                ><BButton @click="retryMore">{{ t('publicResources.retry') }}</BButton></p
              >
              <BPagination
                v-if="queue !== 'pending' && total > 20"
                :current="page"
                :page-size="20"
                :total="total"
                @page-change="changePage"
              />
              <p v-if="queue === 'pending'" class="moderation-list-hint">{{
                t('publicResources.flow.reviewListHint')
              }}</p>
            </BCard>
            <BCard v-if="!bookmark.isMobile" class="moderation-detail" padding="0"
              ><BLoading :loading="detailLoading"
                ><PublicResourceReviewPanel
                  v-if="detail"
                  :detail="detail"
                  :report="selectedReport"
                  :busy="locked || loading || unresolved"
                  :published-view="queue === 'published'"
                  compact
                  integrated
                  :ai-enabled="scope.caps.aiEnabled"
                  @decision="startDecision"
                /><p v-else class="moderation-empty">{{ t('publicResources.selectReview') }}</p></BLoading
              ></BCard
            >
          </div>
          <p v-if="bookmark.isMobile && range.selecting" class="moderation-range-guide" role="status">{{
            t(range.hintKey)
          }}</p>
          <div v-else-if="bookmark.isMobile && selected && !detailVisible" class="moderation-peek"
            ><span>{{ selected.title }}</span
            ><BButton type="text" @click="detailVisible = true">{{
              t('publicResources.workspace.expandPreview')
            }}</BButton></div
          >
          <footer
            v-if="queue === 'pending'"
            class="moderation-actions"
            role="toolbar"
            :aria-label="t('publicResources.batch.actions')"
            ><RangeSelectionHint :controller="range" />
            <div class="moderation-summary" role="status" aria-live="polite"
              ><strong>{{ summary }}</strong
              ><small :class="{ 'is-selection-hint': !unresolved }">{{
                t(unresolved ? 'publicResources.batch.unknown' : 'publicResources.flow.reviewSelectionHint')
              }}</small></div
            >
            <RangeSelectionToggle v-if="bookmark.isMobile" :controller="range" />
            <BButton v-else type="text" :disabled="locked || unresolved || !chosen.size" @click="clearSelection">{{
              t('publicResources.batch.clear')
            }}</BButton>
            <div v-if="unresolved" class="moderation-batch-buttons"
              ><BButton :disabled="locked" @click="checkResults">{{
                t('publicResources.batch.checkResults', { count: unknownRows.length })
              }}</BButton
              ><BButton v-if="retryableUnknown" type="primary" :disabled="locked" @click="retryUnconfirmed">{{
                t('publicResources.batch.retryUnconfirmed', { count: retryableUnknown })
              }}</BButton></div
            >
            <div v-else class="moderation-batch-buttons"
              ><BButton :disabled="locked || loading || !chosen.size" @click="openRejection([...chosen.values()])">{{
                t('publicResources.flow.rejectSelected')
              }}</BButton
              ><BButton
                type="primary"
                :loading="batch.busy.value"
                :disabled="locked || loading || !chosen.size"
                @click="runReview([...chosen.values()], 'approve')"
                >{{ t('publicResources.flow.approveSelected', { count: chosen.size }) }}</BButton
              ></div
            >
          </footer>
        </template>
      </section>
    </CommunityLayout>
    <BDrawer
      :open="bookmark.isMobile && detailVisible"
      :title="t('publicResources.content')"
      mobile-full-screen
      mobile-centered-header
      body-padding="0"
      :close-disabled="locked"
      @close="detailVisible = false"
      ><BLoading :loading="detailLoading"
        ><PublicResourceReviewPanel
          v-if="detail"
          :detail="detail"
          :report="selectedReport"
          :busy="locked || loading || unresolved"
          :published-view="queue === 'published'"
          compact
          integrated
          :ai-enabled="scope.caps.aiEnabled"
          @decision="startDecision" /></BLoading
    ></BDrawer>
    <BModal
      v-model:visible="decisionVisible"
      :title="decisionTitle"
      :show-footer="false"
      width="var(--ui-layout-460, 460px)"
      :close-disabled="writer.busy.value"
      ><div class="moderation-decision"
        ><p>{{
          decisionTargets.length
            ? t('publicResources.batch.selected', { count: decisionTargets.length })
            : decisionTarget?.title
        }}</p
        ><p v-if="decision === 'unlock'">{{ t('publicResources.unlockHint') }}</p
        ><BInput
          v-if="requiresReason"
          v-model:value="reason"
          type="textarea"
          :maxlength="500"
          :placeholder="t('publicResources.reasonPlaceholder')"
          :aria-label="t('publicResources.authorReason')"
        /><p v-if="decisionError" class="moderation-error" role="alert">{{ decisionError }}</p
        ><BButton v-if="decisionStale" @click="refreshDecision">{{ t('publicResources.retry') }}</BButton
        ><BButton
          :type="['reject', 'remove', 'removeReport'].includes(decision) ? 'danger' : 'primary'"
          :disabled="decisionStale || (requiresReason && !reason.trim())"
          :loading="writer.busy.value"
          @click="submitDecision"
          >{{ decisionTitle }}</BButton
        ></div
      ></BModal
    >
  </main>
</template>
<script setup lang="ts">
  import { computed, onBeforeUnmount, ref, watch } from 'vue';
  import { onBeforeRouteLeave } from 'vue-router';
  import { useI18n } from 'vue-i18n';
  import { PUBLIC_RESOURCE_LIMITS } from '@lightnote/shared/public-resources';
  import { bookmarkStore, useUserStore } from '@/store';
  import {
    publicGet,
    type ModerationQueueItem,
    type ModerationDetail,
    type PublicReport,
    type PublicPage,
  } from '@/api/publicResources';
  import { usePublicResourceWrite } from '@/composables/usePublicResourceWrite';
  import { usePublicResourceBatch } from '@/composables/usePublicResourceBatch';
  import { usePublicResourceScope } from '@/store/publicResourceScope';
  import { useForegroundRefresh } from '@/composables/useForegroundRefresh';
  import { useRangeSelection } from '@/composables/useRangeSelection';
  import { vRangeSelect as vRangeSelection } from '@/directives/rangeSelection';
  import { publicResourceErrorKey } from '@/utils/publicResourceErrors';
  import CommunityLayout from '@/components/community/CommunityLayout.vue';
  import CommunityNavigation from '@/components/community/CommunityNavigation.vue';
  import PublicResourceReviewPanel from '@/components/publicResources/PublicResourceReviewPanel.vue';
  import RangeSelectionToggle from '@/components/resourceActions/RangeSelectionToggle.vue';
  import RangeSelectionHint from '@/components/resourceActions/RangeSelectionHint.vue';
  import BCard from '@/components/base/BasicComponents/BCard.vue';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BTabs from '@/components/base/BasicComponents/BTabs.vue';
  import BLoading from '@/components/base/BasicComponents/BLoading.vue';
  import BPagination from '@/components/base/BasicComponents/BPagination.vue';
  import BModal from '@/components/base/BasicComponents/BModal/BModal.vue';
  import BDrawer from '@/components/base/BasicComponents/BDrawer.vue';
  import BInput from '@/components/base/BasicComponents/BInput.vue';
  import BSelect from '@/components/base/BasicComponents/BSelect.vue';
  import BCheckbox from '@/components/base/BasicComponents/BCheckbox.vue';
  import BVirtualList from '@/components/base/BasicComponents/BVirtualList.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import icon from '@/config/icon';
  defineProps<{ sectionOptions: { key: string; label: string }[] }>();
  const emit = defineEmits<{ section: [value: string] }>();
  const { t } = useI18n(),
    user = useUserStore(),
    bookmark = bookmarkStore(),
    writer = usePublicResourceWrite(),
    scope = usePublicResourceScope(),
    batch = usePublicResourceBatch();
  const canReview = computed(() => user.role === 'root' && !user.adminContext && !user.adminPreview),
    owner = computed(() => scope.identity),
    limit = PUBLIC_RESOURCE_LIMITS.selection;
  const queue = ref('pending'),
    page = ref(1),
    total = ref(0),
    query = ref(''),
    kind = ref('all'),
    items = ref<ModerationQueueItem[]>([]),
    chosen = ref(new Map<string, ModerationQueueItem>()),
    selected = ref<ModerationQueueItem | null>(null),
    detail = ref<ModerationDetail | null>(null),
    selectedReport = ref<PublicReport | null>(null),
    loading = ref(false),
    loadingMore = ref(false),
    moreError = ref(false),
    hasMore = ref(false),
    detailLoading = ref(false),
    detailVisible = ref(false),
    error = ref('');
  const decision = ref(''),
    decisionVisible = ref(false),
    reason = ref(''),
    decisionError = ref(''),
    decisionStale = ref(false),
    decisionTargets = ref<ModerationQueueItem[]>([]),
    decisionTarget = ref<{
      path: string;
      expectedVersion: number;
      publicationVersion?: number;
      action: string;
      title: string;
      revision: number;
    } | null>(null);
  const selectionError = ref('');
  const lastAction = ref<'approve' | 'reject'>('approve');
  const locked = computed(() => writer.busy.value || batch.busy.value || decisionVisible.value);
  const unknownRows = computed(() => batch.rows.value.filter((row) => row.state === 'unknown'));
  const unresolved = computed(() => unknownRows.value.length > 0);
  const retryableUnknown = computed(() => unknownRows.value.filter((row) => row.checkedNotFound).length);
  const failures = computed(
    () => new Map(batch.rows.value.filter((row) => row.state === 'failed').map((row) => [row.key, row.code])),
  );
  const displayItems = computed(() => items.value.map((item) => ({ ...item, key: item.reportId || item.publicId })));
  const selectionRange = computed(() => displayItems.value.slice(0, limit));
  const allSelected = computed(
    () => !!selectionRange.value.length && selectionRange.value.every((item) => chosen.value.has(item.publicId)),
  );
  const someSelected = computed(() => selectionRange.value.some((item) => chosen.value.has(item.publicId)));
  const selectLabel = computed(() =>
    t(items.value.length > limit ? 'publicResources.flow.selectFirst' : 'publicResources.flow.selectAll', {
      count: selectionRange.value.length,
    }),
  );
  const summary = computed(() =>
    batch.busy.value
      ? t('publicResources.flow.reviewing')
      : unresolved.value
        ? t('publicResources.batch.unknownSummary', { count: unknownRows.value.length })
        : failures.value.size
          ? t('publicResources.flow.partial', {
              done: batch.rows.value.filter((row) => row.state === 'success').length,
              failed: failures.value.size,
            })
          : batch.rows.value.length
            ? t(lastAction.value === 'approve' ? 'publicResources.flow.approved' : 'publicResources.flow.rejected', {
                count: batch.rows.value.length,
              })
            : t('publicResources.batch.selected', { count: chosen.value.size }),
  );
  const range = useRangeSelection({
    active: () => canReview.value && queue.value === 'pending',
    mobile: () => bookmark.isMobile,
    blocked: () => locked.value || loading.value || unresolved.value || !!error.value,
    groups: () => [{ id: 'default', keys: displayItems.value.map((item) => item.key) }],
    scope: () => `${owner.value}:${queue.value}:${query.value}:${kind.value}`,
    apply: (keys) => {
      const targets = keys.map((key) => displayItems.value.find((item) => item.key === key)!).filter(Boolean);
      if (!addSelection(targets)) return false;
      if (targets.length) void select(targets[targets.length - 1], false);
      return true;
    },
  });
  const listRef = ref<InstanceType<typeof BVirtualList> | null>(null);
  const queueOptions = computed(() => [
    { key: 'pending', label: t('publicResources.pendingQueue') },
    { key: 'published', label: t('publicResources.publicQueue') },
    { key: 'removed', label: t('publicResources.removedQueue') },
    { key: 'reports', label: t('publicResources.reports') },
  ]);
  const kindOptions = computed(() =>
    ['all', 'note', 'bookmark'].map((value) => ({ value, label: t('publicResources.' + value) })),
  );
  const requiresReason = computed(() => ['reject', 'remove', 'removeReport'].includes(decision.value)),
    decisionTitle = computed(() =>
      t('publicResources.' + ({ removeReport: 'remove' }[decision.value] || decision.value || 'reject')),
    );
  let generation = 0,
    detailGeneration = 0,
    disposed = false,
    applied = { status: 'pending', q: '', kind: 'all' };
  function addSelection(targets: ModerationQueueItem[]) {
    const next = new Map(chosen.value);
    targets.forEach((item) => next.set(item.publicId, { ...item }));
    if (next.size > limit) {
      selectionError.value = 'PUBLIC_RESOURCE_BATCH_LIMIT';
      return false;
    }
    selectionError.value = '';
    chosen.value = next;
    return true;
  }
  function toggle(item: ModerationQueueItem) {
    if (locked.value || unresolved.value || loading.value) return;
    selectionError.value = '';
    if (chosen.value.has(item.publicId)) chosen.value.delete(item.publicId);
    else if (!addSelection([item])) return;
    void select(item, false);
  }
  function toggleAll() {
    if (locked.value || unresolved.value || loading.value) return;
    if (allSelected.value) selectionRange.value.forEach((item) => chosen.value.delete(item.publicId));
    else addSelection(selectionRange.value);
  }
  function clearSelection() {
    if (locked.value || unresolved.value) return;
    chosen.value.clear();
    selectionError.value = '';
    range.reset();
  }
  function rowAction(item: ModerationQueueItem, event?: MouseEvent) {
    if (locked.value || loading.value) return;
    if (
      (event?.shiftKey || range.selecting) &&
      range.activate(item.reportId || item.publicId, 'default', !!event?.shiftKey)
    )
      return;
    void select(item, false, true);
  }
  async function load(append = false) {
    if (
      !canReview.value ||
      (append &&
        (locked.value || loading.value || loadingMore.value || !hasMore.value || moreError.value || !!error.value))
    )
      return;
    const current = append ? generation : ++generation,
      identity = owner.value;
    if (append) loadingMore.value = true;
    else {
      detailGeneration++;
      detailLoading.value = false;
      loading.value = true;
      error.value = '';
      moreError.value = false;
      applied = { status: queue.value, q: query.value.trim(), kind: kind.value };
    }
    const targetPage = append ? page.value + 1 : page.value;
    try {
      const collected: ModerationQueueItem[] = [];
      let latest: PublicPage<ModerationQueueItem> | null = null;
      for (let next = append ? targetPage : queue.value === 'pending' ? 1 : targetPage; next <= targetPage; next++) {
        const data = await publicGet<PublicPage<ModerationQueueItem>>('moderation', {
          ...applied,
          page: next,
          pageSize: queue.value === 'pending' ? PUBLIC_RESOURCE_LIMITS.workspace : 20,
        });
        if (current !== generation || identity !== owner.value) return;
        collected.push(...data.items);
        latest = data;
        if (!data.hasMore) break;
      }
      if (!latest) return;
      total.value = latest.total;
      hasMore.value = latest.hasMore;
      page.value = latest.page || targetPage;
      items.value = append
        ? [...new Map([...items.value, ...collected].map((item) => [item.reportId || item.publicId, item])).values()]
        : collected;
      // Explicit selections retain their revision/version until the reviewer reselects or rereads them.
      if (!append) {
        const target =
          items.value.find(
            (item) => (item.reportId || item.publicId) === (selected.value?.reportId || selected.value?.publicId),
          ) || items.value[0];
        if (target) void select(target, false);
        else {
          selected.value = null;
          detail.value = null;
          selectedReport.value = null;
          detailVisible.value = false;
        }
      }
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
  function reload() {
    if (locked.value) return;
    page.value = 1;
    range.reset();
    listRef.value?.scrollToTop();
    void load();
  }
  function changePage(value: number) {
    if (!locked.value) {
      page.value = value;
      void load();
    }
  }
  function retryMore() {
    moreError.value = false;
    void load(true);
  }
  async function select(item: ModerationQueueItem, open = false, acknowledge = false) {
    selected.value = item;
    detailLoading.value = true;
    const current = ++detailGeneration,
      identity = owner.value;
    detail.value = null;
    selectedReport.value = null;
    if (open && bookmark.isMobile) detailVisible.value = true;
    try {
      const [data, report] = await Promise.all([
        publicGet<ModerationDetail>('moderation/' + item.publicId),
        item.reportId ? publicGet<PublicReport>('moderation/reports/' + item.reportId) : Promise.resolve(null),
      ]);
      if (current === detailGeneration && identity === owner.value) {
        detail.value = data;
        selectedReport.value = report;
        if (acknowledge && data.hasPending && !data.removed && !data.withdrawn) {
          const snapshot = {
            ...item,
            version: data.version,
            revision: data.latestRevision,
            title: data.revisions.find((revision) => revision.revision === data.latestRevision)?.title || item.title,
          };
          selected.value = snapshot;
          items.value = items.value.map((row) => (row.publicId === item.publicId ? snapshot : row));
          if (chosen.value.has(item.publicId)) chosen.value.set(item.publicId, snapshot);
        }
      }
    } catch (e) {
      if (current === detailGeneration) error.value = (e as { code?: string }).code || 'PUBLIC_RESOURCE_UNAVAILABLE';
    } finally {
      if (current === detailGeneration) detailLoading.value = false;
    }
  }
  async function finishReview(identity: string) {
    if (identity !== owner.value || disposed) return;
    for (const row of batch.rows.value)
      if (row.state === 'success' || row.state === 'reused') chosen.value.delete(row.key);
    await load();
  }
  async function runReview(targets: ModerationQueueItem[], action: 'approve' | 'reject', authorReason = '') {
    if (
      locked.value ||
      loading.value ||
      unresolved.value ||
      !targets.length ||
      !canReview.value ||
      queue.value !== 'pending'
    )
      return;
    const identity = owner.value;
    lastAction.value = action;
    await batch.start(
      targets.map((item) => ({
        key: item.publicId,
        kind: item.kind,
        title: item.title,
        path: `moderation/${item.publicId}/decide`,
        body: { expectedVersion: item.version, action, reason: authorReason },
      })),
    );
    if (identity !== owner.value || disposed) return;
    if (unknownRows.value.length) await batch.reconcile();
    await finishReview(identity);
  }
  async function checkResults() {
    const identity = owner.value;
    await batch.reconcile();
    await finishReview(identity);
  }
  async function retryUnconfirmed() {
    const identity = owner.value;
    await batch.retryUnconfirmed();
    await finishReview(identity);
  }
  function openRejection(targets: ModerationQueueItem[]) {
    if (locked.value || unresolved.value || !targets.length) return;
    decisionTargets.value = targets.map((item) => ({ ...item }));
    decision.value = 'reject';
    decisionTarget.value = null;
    reason.value = '';
    decisionError.value = '';
    decisionStale.value = false;
    decisionVisible.value = true;
  }
  function startDecision(action: string) {
    if (!detail.value || loading.value || detailLoading.value || locked.value || unresolved.value) return;
    if (['approve', 'reject'].includes(action)) {
      const item = {
        ...selected.value!,
        publicId: detail.value.publicId,
        version: detail.value.version,
        revision: detail.value.latestRevision,
      };
      if (action === 'approve') void runReview([item], 'approve');
      else openRejection([item]);
      return;
    }
    const reportAction = ['dismiss', 'removeReport'].includes(action);
    if (reportAction && !selectedReport.value) return;
    const revision =
      selectedReport.value?.evidence ||
      detail.value.revisions.find(
        (row) =>
          row.revision ===
          (queue.value === 'published' ? detail.value!.publishedRevision : detail.value!.latestRevision),
      );
    decisionTargets.value = [];
    decisionTarget.value = {
      path: reportAction
        ? 'moderation/reports/' + selectedReport.value!.reportId
        : 'moderation/' + detail.value.publicId + '/decide',
      expectedVersion: reportAction ? selectedReport.value!.version : detail.value.version,
      ...(reportAction ? { publicationVersion: detail.value.version } : {}),
      action: action === 'removeReport' ? 'remove' : action,
      title: revision?.title || selected.value?.title || '',
      revision: revision?.revision || detail.value.latestRevision,
    };
    decision.value = action;
    reason.value = '';
    decisionError.value = '';
    decisionStale.value = false;
    decisionVisible.value = true;
  }
  async function submitDecision() {
    if (decisionStale.value || (requiresReason.value && !reason.value.trim())) return;
    if (decisionTargets.value.length) {
      const snapshot = decisionTargets.value,
        authorReason = reason.value.trim();
      decisionVisible.value = false;
      await runReview(snapshot, 'reject', authorReason);
      return;
    }
    const target = decisionTarget.value,
      identity = owner.value;
    if (!target) return;
    try {
      await writer.execute(target.path, {
        expectedVersion: target.expectedVersion,
        ...(target.publicationVersion !== undefined ? { publicationVersion: target.publicationVersion } : {}),
        action: target.action,
        reason: reason.value.trim(),
      });
      if (identity !== owner.value || decisionTarget.value !== target || disposed) return;
      decisionVisible.value = false;
      await load();
    } catch (e) {
      if (identity !== owner.value || disposed) return;
      decisionStale.value = (e as any)?.code === 'PUBLIC_RESOURCE_VERSION_CONFLICT';
      decisionError.value = t(publicResourceErrorKey((e as any)?.code || 'PUBLIC_RESOURCE_UNAVAILABLE'));
    }
  }
  async function refreshDecision() {
    decisionVisible.value = false;
    decisionTarget.value = null;
    await load();
  }
  watch(queue, () => {
    chosen.value.clear();
    selectionError.value = '';
    range.reset();
  });
  watch(
    owner,
    () => {
      generation++;
      detailGeneration++;
      items.value = [];
      detail.value = null;
      selected.value = null;
      selectedReport.value = null;
      chosen.value.clear();
      total.value = 0;
      page.value = 1;
      error.value = '';
      selectionError.value = '';
      decisionError.value = '';
      reason.value = '';
      decisionTarget.value = null;
      decisionTargets.value = [];
      loading.value = false;
      detailLoading.value = false;
      detailVisible.value = false;
      decisionVisible.value = false;
      if (canReview.value) {
        void scope.ensure(true);
        void load();
      }
    },
    { immediate: true, flush: 'sync' },
  );
  useForegroundRefresh({
    staleMs: 0,
    canRefresh: () => canReview.value && !locked.value && !detailVisible.value,
    refresh: load,
  });
  onBeforeRouteLeave(() => !locked.value);
  onBeforeUnmount(() => {
    disposed = true;
    generation++;
    detailGeneration++;
  });
</script>
<style scoped lang="less">
  @import (reference) '@/assets/css/ui-density.less';
  @import (reference) '@/assets/css/workspace-surfaces.less';
  .public-moderation {
    .workspace-open-surface();
    height: 100%;
    min-height: 0;
    overflow: hidden;
    box-sizing: border-box;
    color: var(--text-color);
  }
  .public-moderation :deep(.community-layout) {
    height: 100%;
    min-height: 0;
  }
  .public-moderation :deep(.community-layout-content) {
    display: flex;
    min-height: 0;
    padding: .ui-space(20px) [] .ui-space(24px) [];
  }
  .public-moderation-main {
    display: flex;
    flex-direction: column;
    gap: .ui-space(12px) [];
    min-width: 0;
    min-height: 0;
    flex: 1;
  }
  h1 {
    font-size: .ui-font(24px) [];
    margin: 0;
  }
  .moderation-subtitle {
    color: var(--desc-color);
    font-size: .ui-font(13px) [];
    line-height: 1.6;
    margin: 0;
  }
  .moderation-workspace {
    display: grid;
    grid-template-columns: minmax(0, 2fr) minmax(0, 3fr);
    gap: .ui-space(18px) [];
    flex: 1;
    min-height: 0;
  }
  .moderation-queue,
  .moderation-detail {
    .workspace-content-surface();
    display: flex;
    flex-direction: column;
    min-width: 0;
    min-height: 0;
    overflow: hidden;
    border: 1px solid var(--workspace-border);
    border-radius: 14px;
  }
  .moderation-detail :deep(.loader-container),
  .moderation-detail :deep(.b-loading-content) {
    height: 100%;
    min-height: 0;
  }
  .moderation-list-heading {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: .ui-space(14px) [] .ui-space(16px) [] .ui-space(8px) [];
    gap: .ui-space(8px) [];
  }
  h2 {
    margin: 0;
    font-size: .ui-font(16px) [];
  }
  .moderation-list-heading span,
  .moderation-select-line {
    color: var(--desc-color);
    font-size: .ui-font(12px) [];
  }
  .moderation-filters {
    display: flex;
    gap: .ui-space(8px) [];
    padding: 0 .ui-space(16px) [] .ui-space(8px) [];
  }
  .moderation-filters > :first-child {
    flex: 1;
    min-width: 0;
  }
  .moderation-filters :deep(.b-select) {
    width: .ui-layout(90px) [];
  }
  .moderation-select-line {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: .ui-space(8px) [];
    padding: 0 .ui-space(16px) [] .ui-space(10px) [];
    border-bottom: 1px solid var(--workspace-divider);
  }
  .moderation-select-line small {
    font-size: .ui-font(11px) [];
    white-space: nowrap;
  }
  .moderation-list {
    flex: 1;
    min-height: 0;
    padding: .ui-space(12px) [];
  }
  .moderation-row-shell {
    display: flex;
    align-items: center;
    gap: .ui-space(6px) [];
    border: 1px solid var(--workspace-border);
    border-radius: 10px;
    padding: 0 .ui-space(8px) [];
  }
  .moderation-row-shell.is-chosen {
    background: var(--workspace-purple-selected);
  }
  .moderation-row-shell.is-current {
    border-color: var(--workspace-purple-text);
    box-shadow: inset .ui-space(2px) [] 0 var(--workspace-purple-text);
  }
  .moderation-row {
    height: auto;
    min-height: .ui-control(80px) [];
    white-space: normal;
    line-height: 1.5;
    display: flex;
    align-items: center;
    justify-content: flex-start;
    gap: .ui-space(10px) [];
    flex: 1;
    min-width: 0;
    padding: .ui-space(10px) [] .ui-space(6px) [];
    text-align: left;
    background: transparent;
    border: 0;
  }
  .moderation-row:hover {
    background: transparent;
  }
  .moderation-row-copy {
    display: flex;
    flex-direction: column;
    gap: .ui-space(3px) [];
    min-width: 0;
  }
  .moderation-row strong {
    font-size: .ui-font(14px) [];
    overflow-wrap: anywhere;
    color: var(--text-color);
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
  .moderation-row-copy > span,
  .moderation-row small {
    color: var(--desc-color);
    font-size: .ui-font(11px) [];
    overflow-wrap: anywhere;
  }
  .moderation-type {
    color: var(--resource-bookmark-color);
    background: var(--workspace-purple-selected);
    width: .ui-control(32px) [];
    height: .ui-control(36px) [];
    border-radius: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }
  .moderation-type.is-note {
    color: var(--resource-note-color);
    background: var(--workspace-note-selected);
  }
  .moderation-check,
  .moderation-approve-row {
    flex-shrink: 0;
  }
  .moderation-approve-row {
    color: var(--success-color);
  }
  .moderation-list-hint {
    font-size: .ui-font(11px) [];
    color: var(--desc-color);
    padding: .ui-space(8px) [] .ui-space(16px) [];
    border-top: 1px solid var(--workspace-divider);
    margin: 0;
  }
  .moderation-empty {
    color: var(--desc-color);
    text-align: center;
    padding: .ui-space(24px) [];
    line-height: 1.7;
  }
  .moderation-error,
  .moderation-row .moderation-row-error {
    color: var(--warning-color);
    font-size: .ui-font(12px) [];
    margin: 0;
  }
  .moderation-decision {
    display: flex;
    flex-direction: column;
    gap: .ui-space(16px) [];
  }
  .moderation-actions {
    position: relative;
    display: flex;
    align-items: center;
    gap: .ui-space(12px) [];
    flex-shrink: 0;
    border: 1px solid var(--workspace-border);
    border-radius: 12px;
    padding: .ui-space(12px) [] .ui-space(16px) [];
    background: var(--workspace-content);
  }
  .moderation-summary {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-width: 0;
    gap: .ui-space(2px) [];
    font-size: .ui-font(14px) [];
  }
  .moderation-summary small {
    color: var(--desc-color);
    font-size: .ui-font(11px) [];
  }
  .moderation-batch-buttons {
    display: flex;
    gap: .ui-space(8px) [];
  }
  .moderation-peek,
  .moderation-range-guide {
    flex-shrink: 0;
    border: 1px solid var(--workspace-border);
    border-radius: 10px;
    padding: .ui-space(8px) [] .ui-space(12px) [];
    font-size: .ui-font(12px) [];
    margin: 0;
  }
  .moderation-peek {
    display: flex;
    align-items: center;
    gap: .ui-space(8px) [];
  }
  .moderation-peek > span {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }
  .moderation-range-guide {
    border-color: var(--workspace-purple-text);
    color: var(--workspace-purple-text);
  }
  .is-mobile :deep(.community-layout-content) {
    padding: .ui-space(12px) [];
  }
  .is-mobile .moderation-workspace {
    grid-template-columns: minmax(0, 1fr);
  }
  .is-mobile .moderation-filters > .b_btn {
    display: none;
  }
  .is-mobile .moderation-actions {
    flex-wrap: wrap;
    padding: .ui-space(10px) [];
    gap: .ui-space(8px) [];
  }
  .is-mobile .moderation-batch-buttons {
    width: 100%;
  }
  .is-mobile .moderation-batch-buttons > .b_btn {
    flex: 1;
    min-height: .ui-control(44px) [];
    height: auto;
    white-space: normal;
    line-height: 1.5;
  }
  .is-mobile .moderation-row-shell {
    gap: .ui-space(2px) [];
    padding-inline: .ui-space(4px) [];
  }
  .is-mobile .moderation-approve-row,
  .is-mobile .moderation-check :deep(.b-checkbox) {
    width: .ui-control(44px) [];
    height: .ui-control(44px) [];
    justify-content: center;
  }
  .is-mobile .moderation-row strong {
    font-size: .ui-font(13px) [];
  }
  .is-mobile .moderation-type {
    display: none;
  }
  .is-mobile .moderation-summary .is-selection-hint {
    display: none;
  }
</style>
