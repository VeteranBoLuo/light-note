<template>
  <div class="batch-page" :class="{ 'batch-page--night': user.currentTheme === 'night' }">
    <section class="batch-header">
      <div>
        <h1>{{ pageTitle }}</h1>
        <p>{{ t('resourceCenter.batch.workspaceSubtitle') }}</p>
      </div>
      <div class="header-actions">
        <button class="secondary-btn" @click="goBack">{{ t('resourceCenter.cancel') }}</button>
        <button class="primary-btn" :disabled="submitLoading" @click="submitBatch">{{ submitText }}</button>
      </div>
    </section>

    <section class="batch-layout">
      <article class="panel">
        <div class="panel-title">{{ t('resourceCenter.batch.selectedResources') }}</div>
        <div class="panel-subtitle">{{ t('resourceCenter.batch.selectedCount', { count: items.length }) }}</div>
        <div class="summary-row">
          <span v-for="entry in typeSummary" :key="entry.type" class="summary-chip" :class="`summary-chip--${entry.type}`">
            <span class="summary-chip-dot"></span>
            <span class="summary-chip-label">{{ getSearchTypeLabel(t, entry.type) }}</span>
            <span class="summary-chip-count">{{ entry.count }}</span>
          </span>
        </div>
        <div class="item-list">
          <div v-for="item in items" :key="`${item.type}:${item.id}`" class="item-row">
            <div class="item-main">
              <span class="item-type-badge" :class="`item-type-badge--${item.type}`">{{ getSearchTypeLabel(t, item.type) }}</span>
              <span class="item-title text-hidden">{{ item.title || item.id }}</span>
            </div>
            <div class="item-tags">
              <span class="item-tags-label">{{ t('resourceCenter.batch.itemTags') }}</span>
              <div v-if="getItemTags(item).length" class="item-tags-values">
                <span v-for="tag in getItemTags(item)" :key="`${item.type}:${item.id}:${tag}`" class="item-tag-chip text-hidden">
                  {{ tag }}
                </span>
              </div>
              <span v-else class="item-tags-value item-tags-value--empty">-</span>
            </div>
          </div>
        </div>
      </article>

      <article class="panel">
        <div class="panel-title">{{ t('resourceCenter.batch.selectTags') }}</div>
        <div class="panel-subtitle">
          {{ mode === 'remove' ? t('resourceCenter.batch.removeTagHint') : t('resourceCenter.batch.tagHint') }}
        </div>
        <div class="tag-list" v-if="displayTagList.length">
          <button
            v-for="tag in displayTagList"
            :key="tag.id"
            class="tag-chip"
            :class="{ active: selectedTagIds.includes(tag.id) }"
            @click="toggleTag(tag.id)"
          >
            {{ tag.name }}
          </button>
        </div>
        <div class="empty-tip" v-else>{{ t('resourceCenter.batch.noTags') }}</div>

        <div class="preview-box">
          <div class="preview-title">{{ t('resourceCenter.batch.previewTitle') }}</div>
          <div class="preview-line">{{ t('resourceCenter.batch.previewResources', { count: items.length }) }}</div>
          <div class="preview-line">{{ t('resourceCenter.batch.previewTags', { count: selectedTagIds.length }) }}</div>
          <div class="preview-line">
            {{ t('resourceCenter.batch.previewRelations', { count: previewRelationCount }) }}
          </div>
        </div>
      </article>
    </section>
  </div>
</template>

<script setup lang="ts">
  import { computed, onMounted, ref } from 'vue';
  import { useI18n } from 'vue-i18n';
  import { useRoute, useRouter } from 'vue-router';
  import { message } from 'ant-design-vue';
  import { apiBasePost } from '@/http/request.ts';
  import { clearGlobalSearchCache } from '@/api/search.ts';
  import { useUserStore } from '@/store';
  import { recordOperation } from '@/api/commonApi.ts';
  import type { SearchType } from '@/api/search.ts';
  import { getSearchTypeLabel } from '@/components/searchCenter/searchMeta.ts';

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

  const items = ref<BatchItem[]>([]);
  const tagList = ref<TagItem[]>([]);
  const selectedResourceTags = ref<TagItem[]>([]);
  const resourceTagsMap = ref<Record<string, TagItem[]>>({});
  const selectedTagIds = ref<string[]>([]);
  const submitLoading = ref(false);

  const mode = computed<'add' | 'remove'>(() => (route.query.mode === 'remove' ? 'remove' : 'add'));
  const fromPath = computed(() => {
    const raw = Array.isArray(route.query.from) ? route.query.from[0] : route.query.from;
    const text = String(raw || '/search');
    return text.startsWith('/search') ? text : '/search';
  });
  const pageTitle = computed(() =>
    mode.value === 'add' ? t('resourceCenter.batch.workspaceAddTitle') : t('resourceCenter.batch.workspaceRemoveTitle'),
  );
  const submitText = computed(() =>
    mode.value === 'add' ? t('resourceCenter.batch.confirmAdd') : t('resourceCenter.batch.confirmRemove'),
  );

  const typeSummary = computed(() =>
    EDITABLE_TYPES.map((type) => ({
      type,
      count: items.value.filter((item) => item.type === type).length,
    })).filter((entry) => entry.count > 0),
  );
  const previewRelationCount = computed(() => items.value.length * selectedTagIds.value.length);
  const displayTagList = computed(() => (mode.value === 'remove' ? selectedResourceTags.value : tagList.value));

  function loadItemsFromStorage() {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(parsed)) return [];
      const unique = new Map<string, BatchItem>();
      parsed.forEach((item) => {
        const type = String(item?.type || '').trim() as SearchType;
        const id = String(item?.id || '').trim();
        const title = String(item?.title || '').trim();
        if (!EDITABLE_TYPES.includes(type) || !id) return;
        unique.set(`${type}:${id}`, { type, id, title });
      });
      return Array.from(unique.values());
    } catch (error) {
      return [];
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
    const workspaceRes = await apiBasePost('/api/search/batchResourceTagWorkspace', {
      items: items.value.map((item) => ({ id: item.id, type: item.type })),
    });
    if (workspaceRes.status !== 200) {
      message.error(workspaceRes.msg || t('resourceCenter.batch.submitFailed'));
      return false;
    }
    selectedResourceTags.value = mapTagItems(Array.isArray(workspaceRes.data?.selectedResourceTags) ? workspaceRes.data.selectedResourceTags : []);
    tagList.value = mapTagItems(Array.isArray(workspaceRes.data?.allTags) ? workspaceRes.data.allTags : []);
    resourceTagsMap.value = workspaceRes.data?.resourceTagsMap || {};
    items.value = Array.isArray(workspaceRes.data?.items)
      ? workspaceRes.data.items.map((item: any) => ({
          id: String(item.id || '').trim(),
          type: String(item.type || '').trim() as SearchType,
          title: items.value.find((raw) => raw.id === String(item.id || '').trim() && raw.type === item.type)?.title || '',
        }))
      : items.value;
    if (mode.value === 'remove') {
      selectedTagIds.value = selectedTagIds.value.filter((id) => selectedResourceTags.value.some((tag) => tag.id === id));
    }
    return true;
  }

  function getItemTags(item: BatchItem) {
    const key = `${item.type}:${item.id}`;
    const tags = resourceTagsMap.value[key] || [];
    return tags.map((tag) => tag.name).filter(Boolean).slice(0, 4);
  }

  function toggleTag(tagId: string) {
    if (selectedTagIds.value.includes(tagId)) {
      selectedTagIds.value = selectedTagIds.value.filter((id) => id !== tagId);
    } else {
      selectedTagIds.value = [...selectedTagIds.value, tagId];
    }
  }

  function goBack() {
    router.replace(fromPath.value);
  }

  async function submitBatch() {
    if (!items.value.length) {
      message.warning(t('resourceCenter.batch.noSelection'));
      return;
    }
    if (!selectedTagIds.value.length) {
      message.warning(t('resourceCenter.batch.noTagsSelected'));
      return;
    }

    submitLoading.value = true;
    try {
      const res = await apiBasePost('/api/search/batchUpdateResourceTags', {
        action: mode.value,
        tagIds: selectedTagIds.value,
        items: items.value.map((item) => ({ id: item.id, type: item.type })),
      });
      if (res.status !== 200) {
        message.error(res.msg || t('resourceCenter.batch.submitFailed'));
        return;
      }
      const affected = Number(res.data?.affectedRelationCount || 0);
      const skipped = Number(res.data?.skippedRelationCount || 0);
      recordOperation({
        module: '资源中心',
        operation:
          mode.value === 'add'
            ? `批量加标签成功【资源${items.value.length}个，关系新增${affected}条】`
            : `批量移除标签成功【资源${items.value.length}个，关系移除${affected}条】`,
      });
      message.success(t('resourceCenter.batch.submitSuccess', { affected, skipped }));
      sessionStorage.removeItem(STORAGE_KEY);
      clearGlobalSearchCache();
      const target = router.resolve(fromPath.value);
      router.replace({
        path: target.path,
        query: {
          ...target.query,
          _rt: String(Date.now()),
        },
      });
    } finally {
      submitLoading.value = false;
    }
  }

  onMounted(async () => {
    items.value = loadItemsFromStorage();
    if (!items.value.length) {
      message.warning(t('resourceCenter.batch.noSelection'));
      router.replace('/search');
      return;
    }
    const ok = await loadWorkspaceData();
    if (!ok) {
      router.replace('/search');
    }
  });
</script>

<style scoped lang="less">
  .batch-page {
    height: 100%;
    overflow: auto;
    padding: 24px;
    box-sizing: border-box;
    color: var(--text-color);
  }

  .batch-header {
    display: flex;
    justify-content: space-between;
    gap: 16px;
    align-items: center;
    padding: 20px;
    border-radius: 18px;
    border: 1px solid var(--card-border-color);
    background: var(--background-color);
    box-shadow: var(--ant-table-boxShadow);
  }

  h1 {
    margin: 0 0 8px;
    font-size: 28px;
    line-height: 1.1;
  }

  p {
    margin: 0;
    color: var(--desc-color);
  }

  .header-actions {
    display: flex;
    gap: 10px;
  }

  .primary-btn,
  .secondary-btn,
  .tag-chip {
    border: 0;
    cursor: pointer;
    font: inherit;
    color: inherit;
  }

  .primary-btn,
  .secondary-btn {
    min-height: 38px;
    border-radius: 12px;
    padding: 0 16px;
  }

  .primary-btn {
    color: #fff;
    background: var(--primary-color);
  }

  .primary-btn:disabled {
    opacity: 0.55;
    cursor: not-allowed;
  }

  .secondary-btn {
    background: var(--bl-input-noBorder-bg-color);
  }

  .batch-layout {
    margin-top: 16px;
    display: grid;
    gap: 16px;
    grid-template-columns: 1fr 1fr;
  }

  .panel {
    border-radius: 18px;
    border: 1px solid var(--card-border-color);
    background: var(--background-color);
    box-shadow: var(--ant-table-boxShadow);
    padding: 16px;
  }

  .panel-title {
    font-size: 18px;
    font-weight: 700;
  }

  .panel-subtitle {
    margin-top: 6px;
    color: var(--desc-color);
    font-size: 13px;
  }

  .summary-row {
    margin-top: 12px;
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(110px, 1fr));
    gap: 8px;
  }

  .summary-chip {
    min-height: 40px;
    padding: 8px 10px;
    border-radius: 10px;
    background: color-mix(in srgb, var(--bl-input-noBorder-bg-color) 88%, var(--background-color));
    color: var(--text-color);
    font-size: 12px;
    display: grid;
    grid-template-columns: auto 1fr auto;
    align-items: center;
    gap: 6px;
    border: 1px solid color-mix(in srgb, var(--card-border-color) 88%, transparent);
  }

  .summary-chip-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--resource-bookmark-color);
  }

  .summary-chip--note .summary-chip-dot {
    background: var(--resource-note-color);
  }

  .summary-chip--file .summary-chip-dot {
    background: var(--resource-file-color);
  }

  .summary-chip-label {
    color: var(--desc-color);
    min-width: 0;
  }

  .summary-chip-count {
    min-width: 30px;
    height: 22px;
    border-radius: 7px;
    padding: 0 8px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-weight: 700;
    font-size: 13px;
    background: color-mix(in srgb, var(--background-color) 90%, transparent);
  }

  .summary-chip--bookmark .summary-chip-count {
    color: var(--resource-bookmark-color);
  }

  .summary-chip--note .summary-chip-count {
    color: var(--resource-note-color);
  }

  .summary-chip--file .summary-chip-count {
    color: var(--resource-file-color);
  }

  .item-list {
    margin-top: 12px;
    max-height: 420px;
    overflow: auto;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .item-row {
    min-height: 78px;
    border-radius: 10px;
    border: 1px solid var(--card-border-color);
    background: color-mix(in srgb, var(--bl-input-noBorder-bg-color) 76%, var(--background-color));
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: 10px;
    padding: 12px 14px;
    transition:
      border-color 0.2s,
      background-color 0.2s;
  }

  .item-row:hover {
    border-color: color-mix(in srgb, var(--primary-color) 42%, var(--card-border-color));
    background: color-mix(in srgb, var(--bl-input-noBorder-bg-color) 66%, var(--background-color));
  }

  .item-main {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    align-items: baseline;
    gap: 10px;
  }

  .item-type-badge {
    min-height: 21px;
    border-radius: 999px;
    padding: 0 9px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-size: 11px;
    font-weight: 700;
    background: color-mix(in srgb, var(--resource-bookmark-color) 15%, transparent);
    color: var(--resource-bookmark-color);
  }

  .item-type-badge--note {
    background: color-mix(in srgb, var(--resource-note-color) 15%, transparent);
    color: var(--resource-note-color);
  }

  .item-type-badge--file {
    background: color-mix(in srgb, var(--resource-file-color) 15%, transparent);
    color: var(--resource-file-color);
  }

  .item-title {
    font-size: 20px;
    font-weight: 600;
    line-height: 1.2;
  }

  .item-tags {
    display: flex;
    gap: 8px;
    align-items: center;
    min-height: 22px;
    min-width: 0;
  }

  .item-tags-label {
    color: var(--text-color);
    font-size: 12px;
    font-weight: 700;
    flex-shrink: 0;
    opacity: 0.78;
  }

  .item-tags-values {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    min-width: 0;
  }

  .item-tag-chip {
    max-width: 180px;
    min-height: 22px;
    padding: 0 10px;
    border-radius: 999px;
    display: inline-flex;
    align-items: center;
    background: color-mix(in srgb, var(--resource-tag-color) 15%, transparent);
    color: var(--resource-tag-color);
    font-size: 12px;
    border: 1px solid color-mix(in srgb, var(--resource-tag-color) 26%, transparent);
  }

  .item-tags-value {
    min-width: 0;
    font-size: 12px;
    color: var(--desc-color);
  }

  .item-tags-value--empty {
    opacity: 0.62;
  }

  .tag-list {
    margin-top: 12px;
    max-height: 300px;
    overflow: auto;
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  .tag-chip {
    min-height: 30px;
    border-radius: 999px;
    padding: 4px 12px;
    background: var(--bl-input-noBorder-bg-color);
    color: var(--desc-color);
    font-size: 13px;
  }

  .tag-chip.active {
    background: color-mix(in srgb, var(--resource-tag-color) 16%, transparent);
    color: var(--resource-tag-color);
  }

  .preview-box {
    margin-top: 16px;
    border: 1px solid var(--card-border-color);
    border-radius: 12px;
    padding: 12px;
    background: color-mix(in srgb, var(--background-color) 92%, transparent);
  }

  .preview-title {
    font-size: 13px;
    color: var(--desc-color);
  }

  .preview-line {
    margin-top: 6px;
    font-size: 14px;
  }

  .empty-tip {
    margin-top: 12px;
    color: var(--desc-color);
  }

  .text-hidden {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  @media (max-width: 900px) {
    .batch-page {
      padding: 12px;
    }

    .batch-layout {
      grid-template-columns: 1fr;
    }

    .batch-header {
      flex-direction: column;
      align-items: flex-start;
    }
  }
</style>
