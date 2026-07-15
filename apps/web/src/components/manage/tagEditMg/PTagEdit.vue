<template>
  <CommonContainer :title="pageTitle">
    <b-loading :loading="loading" style="height: unset">
      <div class="tag-edit-body">
        <div class="base-card">
          <div class="tag-attr-item">
            <span class="tag-attr-label">{{ $t('tagManage.tagName') }}</span>
            <b-input v-model:value="tag.name" />
          </div>
          <div class="tag-attr-item">
            <TagIconPicker v-model:value="tag.iconUrl" :tag-name="tag.name" />
          </div>
          <div class="tag-attr-item">
            <span class="tag-attr-label">{{ $t('tagManage.relatedTag') }}</span>
            <b-select
              v-model:value="tag.relatedTagIds"
              mode="multiple"
              :show-search="true"
              :max-tag-count="3"
              :options="tagOptions"
              :filter-option="SelectionSearch"
            />
          </div>
        </div>

        <section class="resource-section" :style="{ '--section-color': activeResourceSection.color }">
          <div class="resource-tabs">
            <BButton
              v-for="section in resourceSections"
              :key="section.type"
              class="resource-tab"
              :class="{ active: activeResourceType === section.type }"
              @click="activeResourceType = section.type"
            >
              <span class="resource-tab-dot" :style="{ background: section.color }"></span>
              <span>{{ section.label }}</span>
              <strong>{{ section.selectedCount }}/{{ section.items.length }}</strong>
            </BButton>
          </div>
          <BInput
            v-model:value="searchMap[activeResourceType]"
            class="section-search"
            :placeholder="$t('placeholder.searchPlaceholder')"
            clearable
          />
          <div :key="activeResourceType" class="resource-list">
            <label
              v-for="item in activeResourceSection.filteredItems"
              :key="`${activeResourceType}-${item.rawId}`"
              class="resource-card"
              :class="{ active: activeResourceSection.selectedIds.includes(item.rawId) }"
            >
              <BCheckbox
                :checked="activeResourceSection.selectedIds.includes(item.rawId)"
                @change="(checked: boolean) => toggleResource(activeResourceSection.type, item.rawId, checked)"
              />
              <div class="resource-name text-hidden" :title="item.name">{{ item.name }}</div>
            </label>
            <div v-if="!activeResourceSection.filteredItems.length" class="resource-empty">
              {{ $t('tagManage.listEmptyText') }}
            </div>
          </div>
        </section>
      </div>
    </b-loading>
    <b-button class="container-footer-btn" type="primary" @click="submit">{{ $t('common.confirm') }}</b-button>
  </CommonContainer>
</template>

<script lang="ts" setup>
  import { computed, onMounted, reactive, ref } from 'vue';
  import { TagInterface } from '@/config/bookmarkCfg.ts';
  import { apiBasePost, apiQueryPost } from '@/http/request.ts';
  import { useRouter } from 'vue-router';
  import BInput from '@/components/base/BasicComponents/BInput.vue';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import { bookmarkStore, useUserStore } from '@/store';
  import message from '@/components/base/BasicComponents/BMessage/BMessage.ts';
  import { SelectionSearch } from '@/components/base/BasicComponents/BForm/FormRenders.vue';
  import BLoading from '@/components/base/BasicComponents/BLoading.vue';
  import TagIconPicker from './TagIconPicker.vue';
  import CommonContainer from '@/components/base/BasicComponents/CommonContainer.vue';
  import BCheckbox from '@/components/base/BasicComponents/BCheckbox.vue';
  import { RESOURCE_COLOR_HEX, type ResourceType } from '@/config/resourceColor.ts';
  import { CLOUD_FILE_CATEGORY_ORDER } from '@/constants/cloudFileCategory.ts';
  import { useI18n } from 'vue-i18n';
  import { recordOperation } from '@/api/commonApi.ts';
  import { blockGuestWrite } from '@/composables/useGuestGuard';
  import { normalizeTagIconValue } from '@/utils/tagIcon.ts';

  type ResourceKind = 'bookmark' | 'note' | 'file';
  type ResourceItem = { rawId: string; name: string; type: ResourceType };

  const router = useRouter();
  const bookmark = bookmarkStore();
  const user = useUserStore();
  const { t } = useI18n();
  const loading = ref(false);

  const tag = ref<TagInterface>({
    id: '',
    name: '',
    iconUrl: '',
    color: '',
    createTime: '',
    updateTime: '',
    bookmarkList: [],
    noteList: [],
    fileList: [],
  });

  const allResources = ref<ResourceItem[]>([]);
  const selectedBookmarkIds = ref<string[]>([]);
  const selectedNoteIds = ref<string[]>([]);
  const selectedFileIds = ref<string[]>([]);
  const tagOptions = ref<{ label: string; value: string }[]>([]);
  const activeResourceType = ref<ResourceKind>('bookmark');
  const searchMap = reactive<Record<'bookmark' | 'note' | 'file', string>>({
    bookmark: '',
    note: '',
    file: '',
  });

  const handleType = computed(() => (router.currentRoute.value.params.id === 'add' ? 'add' : 'edit'));
  const pageTitle = computed(() =>
    t(handleType.value === 'add' ? 'tagManage.editorAddTitle' : 'tagManage.editorEditTitle'),
  );

  function getResourceItems(type: ResourceKind) {
    return allResources.value.filter((item) => item.type === type);
  }

  function filterItems(type: ResourceKind) {
    const keyword = String(searchMap[type] || '')
      .trim()
      .toLowerCase();
    const items = getResourceItems(type);
    if (!keyword) return items;
    return items.filter((item) => item.name.toLowerCase().includes(keyword));
  }

  const resourceSections = computed(() => [
    {
      type: 'bookmark' as const,
      label: t('tagManage.bookmark'),
      color: RESOURCE_COLOR_HEX.bookmark,
      items: getResourceItems('bookmark'),
      filteredItems: filterItems('bookmark'),
      selectedIds: selectedBookmarkIds.value,
      selectedCount: selectedBookmarkIds.value.length,
    },
    {
      type: 'note' as const,
      label: t('tagManage.note'),
      color: RESOURCE_COLOR_HEX.note,
      items: getResourceItems('note'),
      filteredItems: filterItems('note'),
      selectedIds: selectedNoteIds.value,
      selectedCount: selectedNoteIds.value.length,
    },
    {
      type: 'file' as const,
      label: t('tagManage.file'),
      color: RESOURCE_COLOR_HEX.file,
      items: getResourceItems('file'),
      filteredItems: filterItems('file'),
      selectedIds: selectedFileIds.value,
      selectedCount: selectedFileIds.value.length,
    },
  ]);

  const activeResourceSection = computed(() =>
    resourceSections.value.find((section) => section.type === activeResourceType.value)!,
  );

  function toggleResource(type: ResourceKind, id: string, checked: boolean) {
    const map = {
      bookmark: selectedBookmarkIds,
      note: selectedNoteIds,
      file: selectedFileIds,
    };
    const target = map[type].value;
    if (checked) {
      if (!target.includes(id)) target.push(id);
      return;
    }
    map[type].value = target.filter((item) => item !== id);
  }

  async function getAllResources() {
    const [bookmarkRes, noteRes, fileRes] = await Promise.all([
      apiQueryPost('/api/bookmark/getBookmarkList', {
        filters: { userId: user.id, type: 'all' },
      }),
      apiBasePost('/api/note/queryNoteList'),
      apiBasePost('/api/file/queryFiles', { filters: { category: CLOUD_FILE_CATEGORY_ORDER } }),
    ]);

    const resources: ResourceItem[] = [];
    if (bookmarkRes.status === 200) {
      bookmarkRes.data.items.forEach((item: any) => {
        resources.push({ rawId: String(item.id), name: item.name, type: 'bookmark' });
      });
    }
    if (noteRes.status === 200) {
      (noteRes.data ?? []).forEach((item: any) => {
        resources.push({ rawId: String(item.id), name: item.title || '未命名笔记', type: 'note' });
      });
    }
    if (fileRes.status === 200) {
      (fileRes.data ?? []).forEach((item: any) => {
        resources.push({ rawId: String(item.id), name: item.fileName, type: 'file' });
      });
    }
    allResources.value = resources;
  }

  async function getTagSelect() {
    const res = await apiQueryPost('/api/bookmark/queryTagList', {
      filters: { userId: user.id },
    });
    if (res.status === 200) {
      bookmark.tagList = res.data;
      tagOptions.value = (res.data || [])
        .filter((item: any) => item.id !== router.currentRoute.value.params.id)
        .map((item: any) => ({ label: item.name, value: item.id }));
    }
  }

  async function submit() {
    if (blockGuestWrite('add-tag')) return;
    if (loading.value) {
      message.warning('请等待数据请求完毕');
      return;
    }
    tag.value.iconUrl = normalizeTagIconValue(tag.value.iconUrl);
    tag.value.bookmarkList = selectedBookmarkIds.value;
    tag.value.noteList = selectedNoteIds.value;
    tag.value.fileList = selectedFileIds.value;
    const url = handleType.value === 'add' ? '/api/bookmark/addTag' : '/api/bookmark/updateTag';
    const res = await apiBasePost(url, tag.value);
    if (res.status === 200) {
      recordOperation({
        module: '标签详情',
        operation: `${handleType.value === 'add' ? '新增' : '保存'}标签成功【${tag.value.name}】`,
      });
      message.success('保存成功');
      router.back();
    }
  }

  onMounted(async () => {
    loading.value = true;
    try {
      await Promise.all([getAllResources(), getTagSelect()]);
      if (handleType.value === 'add') return;
      const res = await apiQueryPost('/api/bookmark/getTagDetail', {
        filters: { id: router.currentRoute.value.params?.id },
      });
      tag.value = res.data;

      const [bookmarkListRes, noteListRes, fileListRes, relatedRes] = await Promise.all([
        apiQueryPost('/api/bookmark/getBookmarkList', {
          filters: { userId: user.id, tagId: tag.value.id, type: 'normal' },
        }),
        apiBasePost('/api/note/queryNoteList', { tagId: tag.value.id }),
        apiBasePost('/api/file/queryFiles', {
          filters: { tagId: tag.value.id, category: CLOUD_FILE_CATEGORY_ORDER },
        }),
        apiQueryPost('/api/bookmark/getRelatedTag', {
          filters: { userId: user.id, id: tag.value.id },
        }),
      ]);

      selectedBookmarkIds.value = (bookmarkListRes.data.items || []).map((item: any) => String(item.id));
      selectedNoteIds.value = (noteListRes.data || []).map((item: any) => String(item.id));
      selectedFileIds.value = (fileListRes.data || []).map((item: any) => String(item.id));
      tag.value.relatedTagIds = (relatedRes.data || []).map((item: any) => item.id);
    } finally {
      loading.value = false;
    }
  });
</script>

<style lang="less" scoped>
  .tag-edit-body {
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 12px 0 20px;
  }

  .base-card,
  .resource-section {
    border: 1px solid var(--card-border-color);
    background: var(--background-color);
    border-radius: 12px;
  }

  .base-card,
  .resource-section {
    padding: 12px;
  }

  .tag-attr-item {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin-bottom: 12px;
  }

  .tag-attr-item:last-child {
    margin-bottom: 0;
  }

  .tag-attr-label {
    font-size: 13px;
    color: var(--desc-color);
  }

  .resource-section {
    display: flex;
    flex-direction: column;
    gap: 8px;
    min-height: 320px;
  }

  .resource-tabs {
    display: flex;
    align-items: center;
    gap: 8px;
    padding-bottom: 2px;
    overflow-x: auto;
  }

  .resource-tab {
    height: 32px;
    gap: 6px;
    padding: 0 10px;
    color: var(--desc-color);
    background: transparent;
    border: 1px solid transparent;

    strong {
      font-size: 10px;
      font-weight: 500;
    }
  }

  .resource-tab.active {
    color: var(--text-color);
    border-color: color-mix(in srgb, var(--section-color) 38%, var(--card-border-color));
    background: color-mix(in srgb, var(--section-color) 9%, var(--background-color));
  }

  .resource-tab-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    flex: 0 0 auto;
  }

  .section-search {
    width: 100%;
  }

  .resource-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
    max-height: min(44vh, 360px);
    overflow: auto;
  }

  .resource-card {
    display: flex;
    align-items: center;
    gap: 10px;
    min-height: 44px;
    padding: 0 12px;
    border-radius: 8px;
    border: 1px solid var(--card-border-color);
    min-width: 0;
  }

  .resource-card.active {
    border-color: var(--section-color);
    background: color-mix(in srgb, var(--section-color) 8%, var(--background-color));
  }

  .resource-name {
    min-width: 0;
    color: var(--text-color);
    font-size: 13px;
  }

  .resource-empty {
    font-size: 12px;
    color: var(--desc-color);
    padding: 24px 0;
    text-align: center;
  }
</style>
