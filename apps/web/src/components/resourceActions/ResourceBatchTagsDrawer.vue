<template>
  <BDrawer
    :open="open"
    :title="t('resourceCenter.batch.manageTags')"
    width="640px"
    mobile-full-screen
    :mask-closable="!submitLoading"
    :keyboard="!submitLoading"
    :close-disabled="submitLoading"
    body-padding="0"
    @close="closeDrawer"
    @after-close="emit('close', operationKey)"
  >
    <div class="batch-workspace" :class="{ 'batch-workspace--mobile': bookmark.isMobile }" :aria-busy="submitLoading">
      <div v-auto-scrollbar class="batch-scroll">
        <section class="resource-panel">
          <div class="panel-heading">
            <div class="summary-row">
              <strong>{{ t('resourceCenter.batch.selectedResources') }} · {{ selectedResourceCount }}</strong>
              <BChip v-for="entry in typeSummary" :key="entry.type" :tone="entry.type" size="small">
                {{ getSearchTypeLabel(t, entry.type) }} · {{ entry.count }}
              </BChip>
            </div>
            <BButton
              v-if="selection?.mode === 'explicit'"
              size="small"
              :aria-expanded="showResources"
              :disabled="workspaceLoading || !!workspaceError"
              @click="showResources = !showResources"
            >
              {{ t(showResources ? 'resourceCenter.batch.hideResources' : 'resourceCenter.batch.showResources') }}
            </BButton>
          </div>
          <p v-if="showResources" class="panel-hint">{{ t('resourceCenter.batch.scopeLocked') }}</p>
          <div v-if="selection?.mode === 'explicit' && showResources" class="item-list">
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
          <p v-if="selection?.mode === 'allMatching'" class="panel-hint">{{
            t('resourceCenter.batch.allMatchingWorkspaceHint', { count: selectedResourceCount })
          }}</p>
        </section>
        <section class="tag-panel">
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
                :height="bookmark.isMobile ? '44px' : '32px'"
                clearable
                :disabled="submitLoading"
                :placeholder="t('resourceCenter.tagSearchPlaceholder')"
                :aria-label="t('resourceCenter.tagSearchPlaceholder')"
              />
            </div>
            <div v-if="selectedTags.length" class="preview-box" aria-live="polite">
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
                <BButton
                  v-for="tag in displayedSelectedTags"
                  :key="tag.id"
                  class="selected-tag-action"
                  :aria-label="tag.name"
                  aria-pressed="true"
                  :disabled="submitLoading"
                  @click="toggleTag(tag.id)"
                >
                  <ResourceTagChip
                    :tag="tag"
                    class="tag-chip tag-chip--selected"
                    selected
                    show-selected-indicator
                    :disabled="submitLoading"
                    max-width="220px"
                  />
                </BButton>
              </div>
              <BButton
                v-if="selectedTags.length > 6"
                size="small"
                :aria-expanded="expandSelectedTags"
                @click="expandSelectedTags = !expandSelectedTags"
              >
                {{
                  expandSelectedTags
                    ? t('resourceCenter.batch.hideResources')
                    : t('resourceCenter.batch.moreSelectedTags', { count: selectedTags.length - 6 })
                }}
              </BButton>
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
          </template>
        </section>
      </div>
      <footer class="batch-footer">
        <p v-if="submitError" class="submit-error" role="alert">{{ submitError }}</p>
        <div class="batch-preview" aria-live="polite">
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
        <div class="batch-footer-actions">
          <BButton :disabled="submitLoading" @click="closeDrawer">{{ t('common.cancel') }}</BButton>
          <BButton type="primary" :loading="submitLoading" :disabled="cannotSubmit" @click="submitBatch">{{
            submitText
          }}</BButton>
        </div>
      </footer>
    </div>
  </BDrawer>
</template>
<script setup lang="ts">
  import { buildNoteDetailRequestScope } from '@/api/noteDetailPrefetch';
  import { computed, onMounted, onBeforeUnmount, ref, watch } from 'vue';
  import { useRouter } from 'vue-router';
  import { useI18n } from 'vue-i18n';
  import message from '@/components/base/BasicComponents/BMessage/BMessage.ts';
  import { apiBasePost } from '@/http/request.ts';
  import { clearGlobalSearchCache, type BatchSelection, type SearchType } from '@/api/search.ts';
  import { bookmarkStore, useUserStore } from '@/store';
  import { recordOperation } from '@/api/commonApi.ts';
  import { getSearchTypeLabel } from '@/components/searchCenter/searchMeta.ts';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BInput from '@/components/base/BasicComponents/BInput.vue';
  import BCheckbox from '@/components/base/BasicComponents/BCheckbox.vue';
  import BLoading from '@/components/base/BasicComponents/BLoading.vue';
  import BTabs from '@/components/base/BasicComponents/BTabs.vue';
  import BChip from '@/components/base/BasicComponents/BChip.vue';
  import BDrawer from '@/components/base/BasicComponents/BDrawer.vue';
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

  const props = withDefaults(
    defineProps<{
      operationKey?: string;
      selection: BatchSelection;
      initialItems: BatchItem[];
      count: number;
      initialMode?: 'add' | 'remove';
      isCurrent: () => boolean;
    }>(),
    { initialMode: 'add', operationKey: '' },
  );
  const emit = defineEmits<{ updated: [key: string]; close: [key: string] }>();
  const operationKey = props.operationKey;
  const open = ref(true);
  const initialIdentity = buildNoteDetailRequestScope(useUserStore());
  const sessionValid = () => props.isCurrent() && initialIdentity === buildNoteDetailRequestScope(user);
  function closeDrawer() {
    if (!submitLoading.value) open.value = false;
  }
  const EDITABLE_TYPES: SearchType[] = ['bookmark', 'note', 'file'];

  const { t } = useI18n();
  const user = useUserStore();
  const bookmark = bookmarkStore();
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
  const removeNavigationGuard = useRouter().beforeEach(() =>
    submitLoading.value && sessionValid() ? false : undefined,
  );
  watch(
    () => sessionValid(),
    (valid) => {
      if (!valid) open.value = false;
    },
  );

  const mode = ref<'add' | 'remove'>(props.initialMode);
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
  const expandSelectedTags = ref(false);
  const selectedTags = computed(() => displayTagList.value.filter((tag) => selectedTagIds.value.includes(tag.id)));
  const displayedSelectedTags = computed(() =>
    expandSelectedTags.value ? selectedTags.value : selectedTags.value.slice(0, 6),
  );
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
      !open.value ||
      workspaceLoading.value ||
      !!workspaceError.value ||
      submitLoading.value ||
      user.adminContext?.mode === 'readonly',
  );
  const cannotSubmit = computed(
    () => !sessionValid() || controlsDisabled.value || !previewRelationCount.value || !selectedResourceCount.value,
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
    mode.value = value;
  }
  watch(mode, () => {
    selectedTagIds.value = [];
    expandSelectedTags.value = false;
    tagSearch.value = '';
    submitError.value = '';
  });

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
        !sessionValid()
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

    if (!sessionValid()) {
      message.info(t('resourceSelection.expired'));
      closeDrawer();
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
      if (disposed || identity !== buildNoteDetailRequestScope(user) || !sessionValid()) return;
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
      clearGlobalSearchCache();
      emit('updated', operationKey);
      submitLoading.value = false;
      closeDrawer();
    } catch {
      if (!disposed && identity === buildNoteDetailRequestScope(user))
        submitError.value = t('resourceCenter.batch.submitFailed');
    } finally {
      submitLoading.value = false;
    }
  }

  onMounted(async () => {
    if (!sessionValid() || !props.count) {
      closeDrawer();
      return;
    }
    items.value = props.initialItems;
    selection.value = props.selection;
    selectedResourceCount.value = props.count;
    selectionTypeCounts.value = props.initialItems.reduce(
      (counts, item) => {
        counts[item.type] = (counts[item.type] || 0) + 1;
        return counts;
      },
      { bookmark: 0, note: 0, file: 0, tag: 0 },
    );
    await loadWorkspaceData();
  });

  onBeforeUnmount(() => {
    removeNavigationGuard();
    disposed = true;
    workspaceGeneration++;
  });
</script>

<style scoped lang="less">
  .batch-workspace {
    height: 100%;
    min-height: 0;
    display: flex;
    flex-direction: column;
    color: var(--text-color);
  }
  .batch-scroll {
    min-height: 0;
    flex: 1;
    overflow-y: auto;
    padding: 20px 24px;
  }
  .resource-panel {
    padding-bottom: 18px;
    margin-bottom: 20px;
    border-bottom: 1px solid var(--surface-border-color);
  }
  .panel-heading,
  .selection-toolbar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 10px;
  }
  .summary-row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
  }
  .summary-row strong {
    font-size: 14px;
  }
  h2 {
    margin: 0;
    font-size: 14px;
    font-weight: 600;
  }
  .panel-hint {
    margin: 10px 0;
    color: var(--desc-color);
    font-size: 13px;
    line-height: 1.6;
  }
  .item-row {
    padding: 12px 0;
    border-bottom: 1px solid var(--surface-border-color);
  }
  .item-heading,
  .item-tags {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 6px;
  }
  .item-title {
    overflow-wrap: anywhere;
    font-size: 13px;
  }
  .item-tags {
    margin-top: 6px;
  }
  .resource-toggle {
    margin-top: 10px;
  }
  .mode-tabs {
    width: fit-content;
    --primary-color: var(--batch-toggle-accent);
  }
  .workspace-status {
    min-height: 220px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 16px;
    color: var(--desc-color);
    text-align: center;
  }
  .tag-search {
    margin: 18px 0 12px;
  }
  .selection-toolbar {
    margin-bottom: 12px;
    color: var(--desc-color);
    font-size: 12px;
    flex-wrap: wrap;
  }
  .tag-options {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
  }
  .tag-option {
    box-sizing: border-box;
    min-width: 0;
    min-height: 44px;
    padding: 10px 12px;
    gap: 10px;
    border: 1px solid var(--surface-border-color);
    border-radius: 8px;
    background: var(--card-background);
  }
  .tag-option :deep(.b-checkbox__label) {
    min-width: 0;
    display: grid;
    gap: 4px;
    flex: 1;
  }
  .tag-option-name {
    overflow-wrap: anywhere;
    color: var(--text-color);
    font-size: 14px;
  }
  .tag-option-status {
    color: var(--desc-color);
    font-size: 12px;
    line-height: 1.4;
  }
  .tag-option:hover:not(.is-disabled),
  .tag-option:focus-visible {
    border-color: var(--batch-toggle-accent);
    outline: 2px solid var(--focus-ring-color);
    outline-offset: 1px;
  }
  .tag-option--selected {
    border-color: var(--batch-toggle-accent);
  }
  .tag-option--selected .tag-option-name {
    color: var(--batch-toggle-accent);
    font-weight: 600;
  }
  .tag-option.is-disabled {
    opacity: 0.65;
  }
  .preview-box {
    margin: 0 0 8px;
    padding: 12px 0 4px;
    border-top: 1px solid var(--surface-border-color);
  }
  .selected-tags {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin: 10px 0;
  }
  .selected-tag-action.b_btn {
    min-width: 0;
    height: auto;
    padding: 4px 2px;
    border: 0;
    background: transparent;
    box-shadow: none;
  }
  .selected-tag-action.b_btn:hover,
  .selected-tag-action.b_btn:focus-visible {
    background: var(--primary-btn-bg-color);
  }
  .tag-chip.tag-chip--selected.b-chip--tag.b-chip--selected {
    border-color: var(--chip-tag-fg);
    border-width: 1px;
    min-height: 26px;
    padding: 3px 9px;
  }
  .empty-tip {
    padding: 30px 12px;
    color: var(--desc-color);
    text-align: center;
    font-size: 13px;
  }
  .batch-footer {
    flex-shrink: 0;
    padding: 16px 24px max(16px, env(safe-area-inset-bottom));
    border-top: 1px solid var(--surface-border-color);
    background: var(--card-background);
  }
  .preview-result {
    margin: 0;
    font-size: 14px;
    font-weight: 600;
  }
  .batch-preview .panel-hint {
    margin: 5px 0 0;
  }
  .batch-footer-actions {
    display: flex;
    justify-content: flex-end;
    gap: 10px;
    margin-top: 14px;
  }
  .submit-error {
    margin: 0 0 12px;
    padding: 10px;
    color: var(--error-color);
    border: 1px solid var(--error-color);
    border-radius: 8px;
    font-size: 13px;
  }
  .batch-workspace--mobile .batch-scroll {
    padding: 16px;
  }
  .batch-workspace--mobile .batch-footer {
    padding-inline: 16px;
  }
  .batch-workspace--mobile .panel-heading {
    flex-wrap: wrap;
  }
  .batch-workspace--mobile :deep(.b_btn),
  .batch-workspace--mobile :deep(.b-checkbox),
  .batch-workspace--mobile :deep(.tab) {
    min-height: 44px;
  }
  .batch-workspace--mobile .batch-footer-actions > * {
    flex: 1;
  }
  .batch-workspace--mobile .tag-option {
    padding: 10px 8px;
    gap: 6px;
  }
</style>
