<template>
  <b-modal
    v-model:visible="visible"
    :title="t('cloudSpace.fileTagConfig.title')"
    width="min(920px, 92vw)"
    :mask-closable="false"
    @close="handleClose"
  >
    <div class="file-tag-config" :class="{ mobile: bookmark.isMobile }">
      <div class="panel file-panel">
        <div class="file-card">
          <svg-icon :src="icon.cloudSpace.fileIcon[getFileCategory(file)]" size="34" class="file-icon" />
          <div class="file-info">
            <div class="file-name" :title="file?.fileName">{{ file?.fileName || '-' }}</div>
            <div class="file-desc">{{ t('cloudSpace.fileTagConfig.fileDesc') }}</div>
          </div>
        </div>

        <div class="panel-header">
          <div>
            <div class="title">{{ t('cloudSpace.fileTagConfig.selectedTags') }}</div>
            <div class="panel-subtitle">{{ t('cloudSpace.fileTagConfig.selectedDesc') }}</div>
          </div>
          <b-button size="small" @click="resetTags" v-click-log="{ module: '云空间-文件标签配置', operation: '重置标签' }">
            {{ t('cloudSpace.fileTagConfig.reset') }}
          </b-button>
        </div>

        <div class="selected-overview">
          <div class="overview-count">{{ selectedTags.length }}</div>
          <div class="overview-text">
            {{ t('cloudSpace.fileTagConfig.selectedCountText', { count: selectedTags.length }) }}
          </div>
        </div>

        <div v-if="selectedTags.length" class="chip-list">
          <div v-for="tag in selectedTags" :key="tag.id" class="chip">
            <span class="tag-dot" />
            <span class="chip-text">{{ tag.name }}</span>
            <svg-icon
              :src="icon.common.close"
              class="chip-close"
              @click.stop="unbindTag(tag)"
              v-click-log="{ module: '云空间-文件标签配置', operation: `解绑标签【${tag.name}】` }"
            />
          </div>
        </div>
        <div v-else class="empty">{{ t('cloudSpace.fileTagConfig.noSelectedTags') }}</div>
      </div>

      <div class="panel library-panel">
        <div class="panel-header library-header">
          <div>
            <div class="title">{{ t('cloudSpace.fileTagConfig.tagLibrary') }}</div>
            <div class="panel-subtitle">{{ t('cloudSpace.fileTagConfig.sharedDesc') }}</div>
          </div>
          <div class="tag-actions">
            <b-button
              size="small"
              @click="fetchData"
              v-click-log="{ module: '云空间-文件标签配置', operation: '刷新标签' }"
            >
              {{ t('common.refresh') }}
            </b-button>
            <b-button
              size="small"
              @click="openTagWorkspace()"
              v-click-log="{ module: '云空间-文件标签配置', operation: '管理标签' }"
            >
              {{ t('cloudSpace.fileTagConfig.manageTags') }}
            </b-button>
            <b-button
              size="small"
              type="primary"
              @click="openTagWorkspace('add')"
              v-click-log="{ module: '云空间-文件标签配置', operation: '新建共享标签' }"
            >
              {{ t('cloudSpace.fileTagConfig.newSharedTag') }}
            </b-button>
          </div>
        </div>

        <div class="tag-toolbar">
          <b-input v-model:value="searchValue" :maxlength="20" :placeholder="t('cloudSpace.fileTagConfig.tagSearch')" />
        </div>

        <div class="tag-list">
          <div
            v-for="tag in filteredTags"
            :key="tag.id"
            class="tag-row"
            :class="{ active: isTagBound(tag.id) }"
            @click="toggleTag(tag)"
            v-click-log="{ module: '云空间-文件标签配置', operation: `切换文件标签【${tag.name}】` }"
          >
            <div class="tag-left">
              <span class="tag-dot" />
              <div class="tag-text">
                <div class="tag-name">{{ tag.name }}</div>
                <div class="tag-state">
                  {{
                    isTagBound(tag.id)
                      ? t('cloudSpace.fileTagConfig.bound')
                      : t('cloudSpace.fileTagConfig.unbound')
                  }}
                </div>
              </div>
            </div>
            <b-button
              size="small"
              @click.stop="openTagWorkspace(tag.id)"
              v-click-log="{ module: '云空间-文件标签配置', operation: `编辑标签【${tag.name}】` }"
            >
              {{ t('cloudSpace.fileTagConfig.editInWorkspace') }}
            </b-button>
          </div>
          <div v-if="!loading && !filteredTags.length" class="empty">
            {{ t('cloudSpace.fileTagConfig.noTagsCreate') }}
          </div>
        </div>
        <b-loading :loading="loading" class="panel-loading" />
      </div>
    </div>

    <template #footer>
      <div class="modal-footer">
        <b-space>
          <b-button type="primary" @click="submitFileTags">
            {{ saving ? t('cloudSpace.fileTagConfig.saving') : t('common.confirm') }}
          </b-button>
          <b-button @click="handleClose">{{ t('common.cancel') }}</b-button>
        </b-space>
      </div>
    </template>
  </b-modal>
</template>

<script setup lang="ts">
  import { computed, ref, watch } from 'vue';
  import { useI18n } from 'vue-i18n';
  import { useRouter } from 'vue-router';
  import message from '@/components/base/BasicComponents/BMessage/BMessage.ts';
  import BModal from '@/components/base/BasicComponents/BModal/BModal.vue';
  import BInput from '@/components/base/BasicComponents/BInput.vue';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BSpace from '@/components/base/BasicComponents/BSpace.vue';
  import BLoading from '@/components/base/BasicComponents/BLoading.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import icon from '@/config/icon.ts';
  import { bookmarkStore, useUserStore } from '@/store';
  import { apiBasePost, apiQueryPost } from '@/http/request.ts';
  import { getCloudFileCategory } from '@/constants/cloudFileCategory.ts';
  import { recordOperation } from '@/api/commonApi.ts';
  import { blockGuestWrite } from '@/composables/useGuestGuard';

  interface TagItem {
    id: string;
    name: string;
  }

  interface FileItem {
    id?: string;
    fileName?: string;
    category?: string;
  }

  const props = defineProps<{
    file: FileItem | null;
  }>();
  const emit = defineEmits(['saved']);
  const visible = defineModel<boolean>('visible');
  const { t } = useI18n();
  const router = useRouter();
  const bookmark = bookmarkStore();
  const user = useUserStore();

  const allTags = ref<TagItem[]>([]);
  const selectedTags = ref<TagItem[]>([]);
  const initialTags = ref<TagItem[]>([]);
  const searchValue = ref('');
  const loading = ref(false);
  const saving = ref(false);

  const filteredTags = computed(() => {
    const keyword = searchValue.value.trim().toLowerCase();
    if (!keyword) return allTags.value;
    return allTags.value.filter((tag) => tag.name.toLowerCase().includes(keyword));
  });

  watch(
    () => [visible.value, props.file?.id],
    ([isVisible]) => {
      if (isVisible) {
        fetchData();
      }
    },
    { immediate: true },
  );

  function normalizeTag(raw: any): TagItem {
    return {
      id: String(raw.id),
      name: raw.name ?? '',
    };
  }

  function getFileCategory(file: FileItem | null) {
    return getCloudFileCategory({ category: file?.category });
  }

  async function fetchData() {
    if (!props.file?.id) return;
    loading.value = true;
    try {
      const [tagRes, fileTagRes] = await Promise.all([
        apiQueryPost('/api/bookmark/queryTagList', { filters: { userId: user.id } }),
        apiBasePost('/api/file/getFileTags', { id: props.file.id }),
      ]);
      allTags.value = tagRes.status === 200 ? (tagRes.data || []).map(normalizeTag) : [];
      selectedTags.value = fileTagRes.status === 200 ? (fileTagRes.data || []).map(normalizeTag) : [];
      initialTags.value = [...selectedTags.value];
    } finally {
      loading.value = false;
    }
  }

  function isTagBound(tagId: string) {
    return selectedTags.value.some((tag) => tag.id === tagId);
  }

  function bindTag(tag: TagItem) {
    if (isTagBound(tag.id)) {
      message.warning(t('cloudSpace.fileTagConfig.tagBound'));
      return;
    }
    selectedTags.value.push(tag);
  }

  function unbindTag(tag: TagItem) {
    selectedTags.value = selectedTags.value.filter((item) => item.id !== tag.id);
  }

  function toggleTag(tag: TagItem) {
    if (isTagBound(tag.id)) {
      unbindTag(tag);
      return;
    }
    bindTag(tag);
  }

  function resetTags() {
    selectedTags.value = [...initialTags.value];
  }

  function openTagWorkspace(tagId?: string) {
    const target = tagId === 'add' ? '/manage/editTag/add' : tagId ? `/manage/editTag/${tagId}` : '/manage/tagMg';
    const resolved = router.resolve(target);
    window.open(resolved.href, '_blank');
  }

  function handleClose() {
    visible.value = false;
    searchValue.value = '';
    selectedTags.value = [];
    initialTags.value = [];
  }

  async function submitFileTags() {
    if (blockGuestWrite('update-file-tags')) return;
    if (!props.file?.id || saving.value) return;
    saving.value = true;
    try {
      const res = await apiBasePost('/api/file/updateFileTags', {
        id: props.file.id,
        tags: selectedTags.value.map((tag) => tag.id),
      });
      if (res.status === 200) {
        recordOperation({
          module: '云空间-文件标签配置',
          operation: `保存文件关联标签成功【${props.file.fileName || props.file.id}】`,
        });
        message.success(t('common.saveSuccess'));
        emit('saved');
        handleClose();
      } else {
        message.error(res.msg || t('cloudSpace.fileTagConfig.saveFailed'));
      }
    } finally {
      saving.value = false;
    }
  }
</script>

<style scoped lang="less">
  .file-tag-config {
    width: 100%;
    height: min(460px, calc(100vh - 190px));
    min-height: 360px;
    display: grid;
    grid-template-columns: minmax(280px, 340px) minmax(0, 1fr);
    gap: 16px;
    color: var(--text-color);

    &.mobile {
      height: min(620px, calc(100vh - 170px));
      min-height: 0;
      display: flex;
      flex-direction: column;
    }
  }

  :deep(.modal-content) {
    overflow: hidden;
  }

  .panel {
    position: relative;
    min-width: 0;
    min-height: 0;
    padding: 14px;
    border-radius: 8px;
    border: 1px solid var(--card-border-color);
    background: var(--background-color);
    box-shadow: var(--ant-table-boxShadow);
  }

  .library-panel {
    display: grid;
    grid-template-rows: auto auto minmax(0, 1fr);
  }

  .file-card {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 16px;
    padding: 12px;
    border-radius: 8px;
    border: 1px solid color-mix(in srgb, var(--resource-file-color) 24%, var(--card-border-color));
    background: color-mix(in srgb, var(--resource-file-color) 8%, var(--background-color));
  }

  .file-icon {
    flex: 0 0 auto;
    color: var(--resource-file-color);
  }

  .file-info {
    min-width: 0;
  }

  .file-name {
    color: var(--text-color);
    font-size: 15px;
    font-weight: 600;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .file-desc,
  .panel-subtitle,
  .tag-state,
  .empty {
    color: var(--desc-color);
    font-size: 12px;
  }

  .file-desc {
    margin-top: 4px;
  }

  .panel-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 10px;
  }

  .library-header {
    align-items: flex-start;
  }

  .title {
    font-size: 15px;
    font-weight: 600;
    color: var(--text-color);
  }

  .panel-subtitle {
    margin-top: 5px;
    line-height: 1.5;
  }

  .selected-overview {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 12px;
    padding: 12px;
    border-radius: 8px;
    border: 1px solid color-mix(in srgb, var(--resource-tag-color) 22%, var(--card-border-color));
    background: color-mix(in srgb, var(--resource-tag-color) 7%, var(--background-color));
  }

  .overview-count {
    flex: 0 0 auto;
    width: 42px;
    height: 42px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 8px;
    color: var(--resource-tag-color);
    font-size: 22px;
    font-weight: 700;
    background: color-mix(in srgb, var(--resource-tag-color) 12%, var(--background-color));
  }

  .overview-text {
    min-width: 0;
    color: var(--desc-color);
    font-size: 13px;
    line-height: 1.5;
  }

  .chip-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
    max-height: 210px;
    overflow: auto;
  }

  .chip {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
    padding: 9px 10px;
    border-radius: 8px;
    border: 1px solid color-mix(in srgb, var(--resource-tag-color) 30%, var(--card-border-color));
    background: color-mix(in srgb, var(--resource-tag-color) 7%, var(--background-color));
  }

  .tag-dot {
    flex: 0 0 auto;
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: var(--resource-tag-color);
  }

  .chip-text {
    min-width: 0;
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .chip-close {
    flex: 0 0 auto;
    cursor: pointer;
  }

  .tag-actions {
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: 8px;
  }

  .tag-toolbar {
    margin-bottom: 12px;
  }

  .tag-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
    min-height: 0;
    overflow: auto;
    padding-right: 2px;
  }

  .tag-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    min-width: 0;
    padding: 10px;
    border-radius: 8px;
    border: 1px solid var(--card-border-color);
    background: var(--background-color);
    cursor: pointer;
    transition:
      border-color 0.15s ease,
      background-color 0.15s ease,
      box-shadow 0.15s ease;

    &:hover {
      border-color: color-mix(in srgb, var(--resource-tag-color) 40%, var(--card-border-color));
      box-shadow: 0 8px 18px rgba(0, 0, 0, 0.1);
    }

    &.active {
      border-color: var(--resource-tag-color);
      background: color-mix(in srgb, var(--resource-tag-color) 8%, var(--background-color));
      box-shadow: 0 0 0 1px color-mix(in srgb, var(--resource-tag-color) 18%, transparent);
    }
  }

  .tag-left {
    display: flex;
    align-items: center;
    gap: 10px;
    min-width: 0;
  }

  .tag-text {
    min-width: 0;
  }

  .tag-name {
    max-width: 220px;
    overflow: hidden;
    color: var(--text-color);
    font-weight: 600;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .tag-state {
    margin-top: 3px;
  }

  .empty {
    padding: 16px 0;
    text-align: center;
  }

  .panel-loading {
    position: absolute;
    inset: 0;
    z-index: 2;
    pointer-events: none;
  }

  .modal-footer {
    display: flex;
    justify-content: flex-end;
    margin-top: 12px;
  }

  @media (max-width: 900px) {
    .file-tag-config {
      gap: 12px;
    }

    .file-panel {
      flex: 0 0 auto;
    }

    .library-panel {
      flex: 1;
    }

    .chip-list {
      max-height: 96px;
    }

    .library-header {
      flex-direction: column;
    }

    .tag-actions {
      justify-content: flex-start;
    }

    .tag-name {
      max-width: 150px;
    }
  }
</style>
