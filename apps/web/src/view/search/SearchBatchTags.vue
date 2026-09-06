<template>
  <ResourcePageShell
    :title="pageTitle"
    :subtitle="t('resourceCenter.batch.workspaceSubtitle')"
    accent="tag"
    show-back
    @back="goBack"
  >
    <template v-if="!bookmark.isMobile" #actions>
      <BButton :disabled="submitLoading" @click="goBack">{{ t('resourceCenter.cancel') }}</BButton>
      <BButton type="primary" :loading="submitLoading" :disabled="cannotSubmit" @click="submitBatch">{{
        submitText
      }}</BButton>
    </template>
    <div v-auto-scrollbar class="batch-page" :class="{ 'batch-page--mobile': bookmark.isMobile }">
      <div class="batch-layout">
        <BCard as="aside" padding="18px" class="resource-panel">
          <div class="panel-heading">
            <h2>{{ t('resourceCenter.batch.selectedResources') }}</h2>
            <span class="resource-total">{{ selectedResourceCount }}</span>
          </div>
          <div class="summary-row">
            <BChip v-for="entry in typeSummary" :key="entry.type" :tone="entry.type" size="small"
              >{{ getSearchTypeLabel(t, entry.type) }} · {{ entry.count }}</BChip
            >
          </div>
          <p class="panel-hint">{{ t('resourceCenter.batch.scopeLocked') }}</p>
          <BButton
            v-if="bookmark.isMobile && selection?.mode === 'explicit'"
            class="resource-toggle"
            @click="showResources = !showResources"
            >{{
              t(showResources ? 'resourceCenter.batch.hideResources' : 'resourceCenter.batch.showResources')
            }}</BButton
          >
          <div v-if="selection?.mode === 'explicit' && (!bookmark.isMobile || showResources)" class="item-list">
            <div v-for="item in previewItems" :key="`${item.type}:${item.id}`" class="item-row">
              <div class="item-heading">
                <BChip v-if="typeSummary.length > 1" :tone="item.type" size="small">{{
                  getSearchTypeLabel(t, item.type)
                }}</BChip>
                <span class="item-title" :title="item.title">{{ item.title || item.id }}</span>
              </div>
              <div class="item-tags">
                <ResourceTagChip v-for="tag in getItemTags(item)" :key="tag.id" :tag="tag" max-width="150px" />
                <span v-if="!getItemTags(item).length" class="panel-hint">{{
                  t('resourceCenter.batch.noItemTags')
                }}</span>
              </div>
            </div>
            <BButton v-if="items.length > 8" class="resource-toggle" @click="expandResources = !expandResources">{{
              t(expandResources ? 'resourceCenter.batch.hideResources' : 'resourceCenter.batch.showMoreResources')
            }}</BButton>
            <p v-if="itemsTruncated" class="panel-hint">{{
              t('resourceCenter.batch.previewItemsTruncated', { count: selectedResourceCount })
            }}</p>
          </div>
          <p v-else-if="selection?.mode === 'allMatching'" class="panel-hint">{{
            t('resourceCenter.batch.allMatchingWorkspaceHint', { count: selectedResourceCount })
          }}</p>
        </BCard>
        <BCard as="section" padding="20px" class="tag-panel">
          <BTabs class="mode-tabs" :active-tab="mode" :options="modeOptions" variant="segment" @change="changeMode" />
          <p class="panel-hint">{{
            t(mode === 'remove' ? 'resourceCenter.batch.removeTagHint' : 'resourceCenter.batch.tagHint')
          }}</p>
          <div v-if="workspaceLoading" class="workspace-status"
            ><BLoading inline :loading="true" :title="t('resourceCenter.batch.loadingWorkspace')"
          /></div>
          <div v-else-if="workspaceError" class="workspace-status" role="alert">
            <p>{{ workspaceError }}</p
            ><BButton @click="loadWorkspaceData">{{ t('common.retry') }}</BButton>
          </div>
          <template v-else>
            <div class="tag-search">
              <BInput
                v-model:value="tagSearch"
                clearable
                :disabled="submitLoading"
                :placeholder="t('resourceCenter.tagSearchPlaceholder')"
                :aria-label="t('resourceCenter.tagSearchPlaceholder')"
              />
            </div>
            <div class="selection-toolbar">
              <BCheckbox
                controlled
                :model-value="allFilteredSelected"
                :indeterminate="someFilteredSelected"
                :disabled="controlsDisabled || !selectableTags.length"
                @update:model-value="selectFiltered"
                >{{
                  t(tagSearch.trim() ? 'resourceCenter.batch.selectMatches' : 'resourceCenter.batch.selectAvailable')
                }}</BCheckbox
              >
              <span>{{ t('resourceCenter.availableTagCount', { count: filteredTags.length }) }}</span>
            </div>
            <div v-if="filteredTags.length" class="tag-options">
              <BCheckbox
                v-for="tag in filteredTags"
                :key="tag.id"
                controlled
                class="tag-option"
                :class="{ 'tag-option--selected': selectedTagIds.includes(tag.id) }"
                :model-value="selectedTagIds.includes(tag.id)"
                :disabled="controlsDisabled || tagImpact(tag.id) === 0"
                @update:model-value="toggleTag(tag.id)"
              >
                <span class="tag-option-name" :title="tag.name">{{ tag.name }}</span>
                <span v-if="mode === 'add' && tagImpact(tag.id) === 0" class="tag-option-status">{{
                  t('resourceCenter.batch.tagAlreadyOnAll')
                }}</span>
              </BCheckbox>
            </div>
            <p v-else class="empty-tip" role="status">{{
              t(
                tagSearch.trim()
                  ? 'resourceCenter.noTagMatches'
                  : mode === 'remove'
                    ? 'resourceCenter.batch.noTagsToRemove'
                    : 'resourceCenter.batch.noTags',
              )
            }}</p>
            <div class="preview-box" aria-live="polite">
              <div class="panel-heading"
                ><h2>{{ t('resourceCenter.selectedTagCount', { count: selectedTagIds.length }) }}</h2
                ><BButton
                  size="small"
                  :disabled="controlsDisabled || !selectedTagIds.length"
                  @click="selectedTagIds = []"
                  >{{ t('resourceCenter.batch.clearTags') }}</BButton
                ></div
              >
              <div v-if="selectedTags.length" class="selected-tags">
                <ResourceTagChip
                  v-for="tag in selectedTags"
                  :key="tag.id"
                  :tag="tag"
                  class="tag-chip"
                  :class="{ 'tag-chip--selected': selectedTagIds.includes(tag.id) }"
                  interactive
                  selected
                  show-selected-indicator
                  :disabled="submitLoading"
                  max-width="220px"
                  @click="toggleTag(tag.id)"
                />
              </div>
              <p class="preview-result">{{
                t(
                  selectedTagIds.length
                    ? mode === 'add'
                      ? 'resourceCenter.batch.previewAdd'
                      : 'resourceCenter.batch.previewRemove'
                    : 'resourceCenter.batch.pickTagsHint',
                  { count: previewRelationCount },
                )
              }}</p>
              <p v-if="selectedTagIds.length" class="panel-hint">{{
                t('resourceCenter.batch.previewSkipped', { count: skippedRelationCount })
              }}</p>
            </div>
            <p v-if="submitError" class="submit-error" role="alert">{{ submitError }}</p>
          </template>
        </BCard>
      </div>
    </div>
    <MobileStickyActionBar v-if="bookmark.isMobile">
      <BButton :disabled="submitLoading" @click="goBack">{{ t('resourceCenter.cancel') }}</BButton>
      <BButton type="primary" :loading="submitLoading" :disabled="cannotSubmit" @click="submitBatch">{{
        submitText
      }}</BButton>
    </MobileStickyActionBar>
  </ResourcePageShell>
</template>

<script setup lang="ts">
  import { useResourceSelectionStore } from '@/store/resourceSelection';
  import { buildNoteDetailRequestScope } from '@/api/noteDetailPrefetch';
  import { computed, onMounted, onBeforeUnmount, ref, watch } from 'vue';
  import { onBeforeRouteLeave, onBeforeRouteUpdate } from 'vue-router';
  import { useI18n } from 'vue-i18n';
  import { useRoute, useRouter } from 'vue-router';
  import message from '@/components/base/BasicComponents/BMessage/BMessage.ts';
  import { apiBasePost } from '@/http/request.ts';
  import { clearGlobalSearchCache, type BatchSelection, type SearchType } from '@/api/search.ts';
  import { bookmarkStore, cloudSpaceStore, useUserStore } from '@/store';
  import { recordOperation } from '@/api/commonApi.ts';
  import { getSearchTypeLabel } from '@/components/searchCenter/searchMeta.ts';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BCard from '@/components/base/BasicComponents/BCard.vue';
  import BInput from '@/components/base/BasicComponents/BInput.vue';
  import BCheckbox from '@/components/base/BasicComponents/BCheckbox.vue';
  import BLoading from '@/components/base/BasicComponents/BLoading.vue';
  import BTabs from '@/components/base/BasicComponents/BTabs.vue';
  import BChip from '@/components/base/BasicComponents/BChip.vue';
  import MobileStickyActionBar from '@/components/mobile/MobileStickyActionBar.vue';
  import ResourcePageShell from '@/components/base/ResourcePageShell.vue';
  import ResourceTagChip from '@/components/tag/ResourceTagChip.vue';

  interface BatchItem {
    id: string;
    type: SearchType;
    title: string;
  }

  interface TagItem {
    id: string;
    name: string;
  }

  const STORAGE_KEY = 'resource-center-batch-items';
  const EDITABLE_TYPES: SearchType[] = ['bookmark', 'note', 'file'];

  const { t } = useI18n();
  const route = useRoute();
  const router = useRouter();
  const user = useUserStore();
  const bookmark = bookmarkStore();
  const cloud = cloudSpaceStore();
  const selectionStore = useResourceSelectionStore();
  const token = String(route.query.selectionSession || '');
  const handoff =
    token && selectionStore.handoff?.token === token && selectionStore.identity === buildNoteDetailRequestScope(user)
      ? selectionStore.handoff
      : null;
  const sessionValid = () =>
    !!handoff &&
    selectionStore.handoff?.token === token &&
    selectionStore.busy &&
    selectionStore.isCurrent(handoff.operation) &&
    selectionStore.identity === buildNoteDetailRequestScope(user);

  const items = ref<BatchItem[]>([]);
  const selection = ref<BatchSelection | null>(null);
  const selectedResourceCount = ref(0);
  const selectionTypeCounts = ref<Record<SearchType, number>>({ bookmark: 0, note: 0, file: 0, tag: 0 });
  const itemsTruncated = ref(false);
  const tagList = ref<TagItem[]>([]);
  const selectedResourceTags = ref<TagItem[]>([]);
  const resourceTagsMap = ref<Record<string, TagItem[]>>({});
  const selectedTagIds = ref<string[]>([]);
  const submitLoading = ref(false);
  const workspaceLoading = ref(false);
  const workspaceError = ref('');
  const submitError = ref('');
  const tagRelationCounts = ref<Record<string, number>>({});
  const tagSearch = ref('');
  const showResources = ref(false);
  const expandResources = ref(false);
  let workspaceGeneration = 0;
  let disposed = false;

  const mode = computed<'add' | 'remove'>(() => (route.query.mode === 'remove' ? 'remove' : 'add'));
  const fromPath = computed(() => {
    if (handoff) return handoff.from;
    const raw = Array.isArray(route.query.from) ? route.query.from[0] : route.query.from;
    const text = String(raw || '/search');
    return ['/search', '/cloudSpace', '/noteLibrary', '/organize', '/home', '/manage/bookmarkMg'].some(
      (path) => text.split('?')[0] === path,
    )
      ? text
      : '/search';
  });
  const pageTitle = computed(() =>
    mode.value === 'add' ? t('resourceCenter.batch.workspaceAddTitle') : t('resourceCenter.batch.workspaceRemoveTitle'),
  );
  const submitText = computed(() =>
    mode.value === 'add' ? t('resourceCenter.batch.confirmAdd') : t('resourceCenter.batch.confirmRemove'),
  );

  const typeSummary = computed(() =>
    EDITABLE_TYPES.map((type) => ({ type, count: Number(selectionTypeCounts.value[type] || 0) })).filter(
      (entry) => entry.count > 0,
    ),
  );
  const displayTagList = computed(() => (mode.value === 'remove' ? selectedResourceTags.value : tagList.value));
  const filteredTags = computed(() =>
    displayTagList.value.filter((tag) =>
      tag.name.toLocaleLowerCase().includes(tagSearch.value.trim().toLocaleLowerCase()),
    ),
  );
  const selectedTags = computed(() => displayTagList.value.filter((tag) => selectedTagIds.value.includes(tag.id)));
  const previewItems = computed(() => (expandResources.value ? items.value : items.value.slice(0, 8)));
  const selectableTags = computed(() => filteredTags.value.filter((tag) => tagImpact(tag.id) > 0));
  const allFilteredSelected = computed(
    () => selectableTags.value.length > 0 && selectableTags.value.every((tag) => selectedTagIds.value.includes(tag.id)),
  );
  const someFilteredSelected = computed(
    () => !allFilteredSelected.value && selectableTags.value.some((tag) => selectedTagIds.value.includes(tag.id)),
  );
  const previewRelationCount = computed(() => selectedTagIds.value.reduce((count, id) => count + tagImpact(id), 0));
  const skippedRelationCount = computed(
    () => selectedResourceCount.value * selectedTagIds.value.length - previewRelationCount.value,
  );
  const controlsDisabled = computed(
    () =>
      workspaceLoading.value || !!workspaceError.value || submitLoading.value || user.adminContext?.mode === 'readonly',
  );
  const cannotSubmit = computed(
    () => controlsDisabled.value || !previewRelationCount.value || !selectedResourceCount.value,
  );
  const modeOptions = computed(() => [
    { key: 'add', label: t('resourceCenter.batch.modeAdd') },
    { key: 'remove', label: t('resourceCenter.batch.modeRemove') },
  ]);

  function tagImpact(id: string) {
    const existing = Math.min(selectedResourceCount.value, Number(tagRelationCounts.value[id] || 0));
    return mode.value === 'remove' ? existing : selectedResourceCount.value - existing;
  }
  function selectFiltered(checked: boolean) {
    if (controlsDisabled.value) return;
    const ids = new Set(selectableTags.value.map((tag) => tag.id));
    selectedTagIds.value = checked
      ? [...new Set([...selectedTagIds.value, ...ids])]
      : selectedTagIds.value.filter((id) => !ids.has(id));
  }
  function changeMode(value: string) {
    if (controlsDisabled.value || (value !== 'add' && value !== 'remove') || value === mode.value) return;
    void router.replace({ query: { ...route.query, mode: value } });
  }
  watch(mode, () => {
    selectedTagIds.value = [];
    tagSearch.value = '';
    submitError.value = '';
  });

  function loadBatchStateFromStorage() {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      const rawItems = Array.isArray(parsed) ? parsed : parsed?.items;
      if (!Array.isArray(rawItems)) return null;
      const unique = new Map<string, BatchItem>();
      rawItems.forEach((item) => {
        const type = String(item?.type || '').trim() as SearchType;
        const id = String(item?.id || '').trim();
        const title = String(item?.title || '').trim();
        if (!EDITABLE_TYPES.includes(type) || !id) return;
        unique.set(`${type}:${id}`, { type, id, title });
      });
      const normalizedItems = Array.from(unique.values());
      const normalizedSelection: BatchSelection = parsed?.selection || {
        mode: 'explicit',
        items: normalizedItems.map((item) => ({ id: item.id, type: item.type })),
      };
      return {
        items: normalizedItems,
        selection: normalizedSelection,
        selectedCount: Number(parsed?.selectedCount || normalizedItems.length),
      };
    } catch (error) {
      return null;
    }
  }

  function mapTagItems(list: any[]): TagItem[] {
    return list
      .map((item: any) => ({
        id: String(item.id || '').trim(),
        name: String(item.name || '').trim(),
      }))
      .filter((item: TagItem) => item.id && item.name);
  }

  async function loadWorkspaceData() {
    if (!selection.value || workspaceLoading.value || submitLoading.value) return;
    const generation = ++workspaceGeneration;
    const identity = buildNoteDetailRequestScope(user);
    workspaceLoading.value = true;
    workspaceError.value = '';
    try {
      const res = await apiBasePost(
        '/api/search/batchResourceTagWorkspace',
        { selection: selection.value },
        { silent: true },
      );
      if (
        disposed ||
        generation !== workspaceGeneration ||
        identity !== buildNoteDetailRequestScope(user) ||
        (token && !sessionValid())
      )
        return;
      if (res.status !== 200) {
        workspaceError.value = t(
          res.status === 409 ? 'resourceCenter.batch.resourcesChanged' : 'resourceCenter.batch.workspaceFailed',
        );
        return;
      }
      if (!res.data?.tagRelationCounts || typeof res.data.tagRelationCounts !== 'object') {
        workspaceError.value = t('resourceCenter.batch.workspaceFailed');
        return;
      }
      selectedResourceTags.value = mapTagItems(res.data.selectedResourceTags || []);
      tagList.value = mapTagItems(res.data.allTags || []);
      tagRelationCounts.value = res.data.tagRelationCounts;
      resourceTagsMap.value = res.data.resourceTagsMap || {};
      selectedResourceCount.value = Number(res.data.selectionSummary?.editableCount || 0);
      selectionTypeCounts.value = {
        bookmark: Number(res.data.selectionSummary?.typeCounts?.bookmark || 0),
        note: Number(res.data.selectionSummary?.typeCounts?.note || 0),
        file: Number(res.data.selectionSummary?.typeCounts?.file || 0),
        tag: 0,
      };
      itemsTruncated.value = Boolean(res.data.itemsTruncated);
      const previous = new Map(items.value.map((item) => [`${item.type}:${item.id}`, item]));
      items.value = Array.isArray(res.data.items)
        ? res.data.items.map((item: any) => ({
            id: String(item.id),
            type: item.type,
            title: previous.get(`${item.type}:${item.id}`)?.title || item.title || String(item.id),
          }))
        : items.value;
      selectedTagIds.value = selectedTagIds.value.filter(
        (id) => displayTagList.value.some((tag) => tag.id === id) && tagImpact(id) > 0,
      );
    } catch {
      if (!disposed && generation === workspaceGeneration && identity === buildNoteDetailRequestScope(user))
        workspaceError.value = t('resourceCenter.batch.workspaceFailed');
    } finally {
      if (generation === workspaceGeneration) workspaceLoading.value = false;
    }
  }

  function getItemTags(item: BatchItem) {
    return (resourceTagsMap.value[`${item.type}:${item.id}`] || []).slice(0, 4);
  }

  function toggleTag(tagId: string) {
    if (controlsDisabled.value || tagImpact(tagId) <= 0) return;
    if (selectedTagIds.value.includes(tagId)) {
      selectedTagIds.value = selectedTagIds.value.filter((id) => id !== tagId);
    } else {
      selectedTagIds.value = [...selectedTagIds.value, tagId];
    }
  }

  function goBack() {
    if (submitLoading.value) return;
    const target = router.resolve(fromPath.value);
    router.replace({ path: target.path, query: { ...target.query, _rt: String(Date.now()) }, hash: target.hash });
  }

  async function submitBatch() {
    if (cannotSubmit.value) return;
    const identity = buildNoteDetailRequestScope(user);
    if (!selection.value || !selectedResourceCount.value) {
      message.warning(t('resourceCenter.batch.noSelection'));
      return;
    }
    if (!selectedTagIds.value.length) {
      message.warning(t('resourceCenter.batch.noTagsSelected'));
      return;
    }

    if (token && !sessionValid()) {
      message.info(t('resourceSelection.expired'));
      goBack();
      return;
    }
    submitLoading.value = true;
    submitError.value = '';
    try {
      const res = await apiBasePost(
        '/api/search/batchUpdateResourceTags',
        {
          action: mode.value,
          tagIds: selectedTagIds.value,
          selection: selection.value,
        },
        { silent: true },
      );
      if (disposed || identity !== buildNoteDetailRequestScope(user) || (token && !sessionValid())) return;
      if (res.status !== 200) {
        submitError.value = t('resourceCenter.batch.submitFailed');
        return;
      }
      const affected = Number(res.data?.affectedRelationCount || 0);
      const skipped = Number(res.data?.skippedRelationCount || 0);
      recordOperation({
        module: '资源中心',
        operation:
          mode.value === 'add'
            ? `批量加标签成功【资源${selectedResourceCount.value}个，关系新增${affected}条】`
            : `批量移除标签成功【资源${selectedResourceCount.value}个，关系移除${affected}条】`,
      });
      message.success(t('resourceCenter.batch.submitSuccess', { affected, skipped }));
      if (!token) sessionStorage.removeItem(STORAGE_KEY);
      clearGlobalSearchCache();
      if (fromPath.value.split('?')[0] === '/cloudSpace') void cloud.queryFieldList();
      submitLoading.value = false;
      const target = router.resolve(fromPath.value);
      await router.replace({
        path: target.path,
        query: {
          ...target.query,
          _rt: String(Date.now()),
        },
      });
    } catch {
      if (!disposed && identity === buildNoteDetailRequestScope(user))
        submitError.value = t('resourceCenter.batch.submitFailed');
    } finally {
      submitLoading.value = false;
    }
  }

  onMounted(async () => {
    const stored = token
      ? sessionValid()
        ? {
            items: handoff.operation.items,
            selection: handoff.operation.selection,
            selectedCount:
              handoff.operation.selection.mode === 'allMatching'
                ? selectionStore.count
                : handoff.operation.items.length,
          }
        : null
      : fromPath.value.startsWith('/organize')
        ? loadBatchStateFromStorage()
        : null;
    if (!stored?.selection || !stored.selectedCount) {
      message.warning(t(token ? 'resourceSelection.expired' : 'resourceCenter.batch.noSelection'));
      router.replace(fromPath.value);
      return;
    }
    items.value = stored.items;
    selection.value = stored.selection;
    selectedResourceCount.value = stored.selectedCount;
    selectionTypeCounts.value = stored.items.reduce(
      (counts, item) => {
        counts[item.type] = (counts[item.type] || 0) + 1;
        return counts;
      },
      { bookmark: 0, note: 0, file: 0, tag: 0 },
    );
    await loadWorkspaceData();
  });

  onBeforeRouteLeave(() => !submitLoading.value || (Boolean(token) && !sessionValid()));
  onBeforeRouteUpdate(() => !submitLoading.value || (Boolean(token) && !sessionValid()));
  onBeforeUnmount(() => {
    disposed = true;
    workspaceGeneration++;
  });
</script>

<style scoped lang="less">
  .batch-page {
    height: 100%;
    overflow: auto;
    color: var(--text-color);
  }
  .batch-layout {
    display: grid;
    grid-template-columns: minmax(240px, 0.8fr) minmax(0, 2fr);
    gap: 20px;
    align-items: start;
  }
  .resource-panel,
  .tag-panel {
    min-width: 0;
    --b-card-shadow: none;
  }
  .panel-heading {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
  }
  .mode-tabs {
    width: fit-content;
    border-radius: 8px;
  }
  .mode-tabs :deep(.tab.is-active) {
    border-bottom: 2px solid var(--primary-color);
  }
  .batch-page--mobile .mode-tabs :deep(.tab) {
    min-height: 44px;
    line-height: 44px;
  }
  h2 {
    margin: 0;
    font-size: 15px;
    font-weight: 600;
  }
  .resource-total {
    font-size: 21px;
    font-weight: 700;
  }
  .summary-row {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-top: 10px;
  }
  .panel-hint {
    margin: 10px 0;
    color: var(--desc-color);
    font-size: 12px;
    line-height: 1.6;
  }
  .item-list {
    border-top: 1px solid var(--surface-border-color);
  }
  .item-row {
    padding: 12px 0;
    border-bottom: 1px solid var(--surface-border-color);
  }
  .item-title {
    display: block;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 13px;
    font-weight: 500;
    flex: 1;
  }
  .item-heading {
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
  }
  .item-tags {
    display: flex;
    flex-wrap: wrap;
    gap: 5px;
    margin-top: 7px;
  }
  .item-tags .panel-hint {
    margin: 0;
  }
  .resource-toggle {
    margin-top: 10px;
    width: 100%;
  }
  .workspace-status {
    min-height: 300px;
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    gap: 16px;
    text-align: center;
    color: var(--desc-color);
  }
  .tag-search {
    margin: 18px 0 10px;
  }
  .selection-toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    margin-bottom: 12px;
    font-size: 12px;
    color: var(--desc-color);
  }
  .tag-options {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(175px, 1fr));
    gap: 8px;
  }
  .tag-option {
    box-sizing: border-box;
    min-width: 0;
    min-height: 44px;
    padding: 10px 12px;
    gap: 10px;
    border: 1px solid var(--surface-border-color);
    border-radius: 10px;
    background: var(--workspace-panel-bg-color);
  }
  .tag-option :deep(.b-checkbox__label) {
    display: grid;
    gap: 4px;
    min-width: 0;
    flex: 1;
  }
  .tag-option-name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--text-color);
    font-size: 13px;
  }
  .tag-option-status {
    color: var(--desc-color);
    font-size: 11px;
    line-height: 1.4;
  }
  .tag-option:hover:not(.is-disabled),
  .tag-option:focus-visible {
    border-color: var(--primary-color);
    outline: 2px solid var(--primary-color);
    outline-offset: 1px;
  }
  .tag-option--selected {
    border-color: var(--primary-color);
  }
  .tag-option--selected .tag-option-name {
    color: var(--primary-color);
    font-weight: 600;
  }
  .tag-option.is-disabled {
    opacity: 0.65;
  }
  .preview-box {
    margin-top: 20px;
    padding-top: 16px;
    border-top: 1px solid var(--surface-border-color);
  }
  .selected-tags {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-top: 10px;
  }
  .preview-result {
    margin: 12px 0 0;
    font-size: 14px;
    font-weight: 600;
  }
  .tag-chip.tag-chip--selected.b-chip--tag.b-chip--selected {
    --b-chip-bg: var(--chip-tag-fg);
    --b-chip-border: var(--chip-tag-fg);
    --b-chip-fg: var(--card-background);
    border-color: var(--chip-tag-fg);
    border-width: 2px;
  }
  .empty-tip {
    padding: 30px 12px;
    color: var(--desc-color);
    text-align: center;
    font-size: 13px;
  }
  .submit-error {
    padding: 12px;
    color: var(--error-color);
    border: 1px solid var(--error-color);
    border-radius: 8px;
    font-size: 13px;
  }
  .batch-page--mobile {
    padding-bottom: calc(155px + env(safe-area-inset-bottom));
  }
  .batch-page--mobile .batch-layout {
    grid-template-columns: minmax(0, 1fr);
    gap: 12px;
  }
  .batch-page--mobile .tag-panel {
    padding: 14px !important;
  }
  .batch-page--mobile .tag-options {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .batch-page--mobile .tag-option {
    min-height: 44px;
    padding: 10px 8px;
    gap: 6px;
  }
  .batch-page--mobile .selection-toolbar {
    flex-wrap: wrap;
  }
  .batch-page--mobile .resource-toggle {
    min-height: 44px;
  }
  .batch-page--mobile .tag-option-name {
    font-size: 14px;
  }
  .batch-page--mobile .tag-option-status {
    font-size: 12px;
  }
  .batch-page--mobile .tag-chip,
  .batch-page--mobile .preview-box :deep(.b_btn),
  .batch-page--mobile .selection-toolbar :deep(.b-checkbox) {
    min-height: 44px;
  }
</style>
