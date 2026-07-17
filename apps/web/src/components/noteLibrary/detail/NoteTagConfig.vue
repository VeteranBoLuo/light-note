<template>
  <BModal
    v-model:visible="visible"
    :title="$t('note.tagConfig.title')"
    :mask-closable="false"
    wrap-class-name="note-tag-modal"
    @ok="handleOk"
  >
    <div class="tag-config" :class="{ mobile: bookmark.isMobile }">
      <div class="panel selected-panel">
        <div class="panel-header">
          <div class="title">{{ $t('note.tagConfig.selectedTags') }}</div>
          <b-button size="small" @click="resetTags" v-click-log="{ module: '笔记-标签配置', operation: '重置标签' }">{{
            $t('note.tagConfig.reset')
          }}</b-button>
        </div>
        <div class="panel-subtitle">{{ $t('note.tagConfig.selectedDesc') }}</div>
        <div class="selected-overview">
          <div class="overview-count">{{ noteTags.length }}</div>
          <div class="overview-text">{{ $t('note.tagConfig.selectedCountText', { count: noteTags.length }) }}</div>
        </div>
        <div class="chip-list" v-if="noteTags.length">
          <div v-for="tag in noteTags" :key="tag.id" class="chip">
            <span class="color-dot" />
            <span class="chip-text">{{ tag.name }}</span>
            <SvgIcon
              :src="icon.common.close"
              class="chip-close"
              @click.stop="unbindTag(tag)"
              v-click-log="{ module: '笔记-标签配置', operation: `解绑标签【${tag.name}】` }"
            />
          </div>
        </div>
        <div class="empty" v-else>{{ $t('note.tagConfig.noTags') }}</div>
      </div>

      <div class="panel library-panel">
        <div class="panel-header panel-header--library">
          <div>
            <div class="title flex-align-center-gap"
              >{{ $t('note.tagConfig.tagLibrary') }}
              <b-button
                size="small"
                @click="fetchAllTags"
                v-click-log="{ module: '笔记-标签配置', operation: '刷新标签' }"
                >{{ $t('common.refresh') }}</b-button
              >
              <b-button
                size="small"
                @click="openTagWorkspace()"
                v-click-log="{ module: '笔记-标签配置', operation: '管理标签' }"
                >{{ $t('note.tagConfig.manageTags') }}</b-button
              ></div
            >
            <div class="panel-subtitle panel-subtitle--tight">{{ $t('note.tagConfig.sharedDesc') }}</div>
          </div>
          <div class="tag-actions">
            <b-button
              size="small"
              type="primary"
              @click="openTagWorkspace('add')"
              v-click-log="{ module: '笔记-标签配置', operation: '新增共享标签' }"
            >
              {{ $t('note.tagConfig.newSharedTag') }}
            </b-button>
          </div>
        </div>

        <div class="tag-toolbar">
          <b-input v-model:value="searchValue" :maxlength="20" :placeholder="t('note.tagConfig.tagSearch')" />
        </div>

        <div class="tag-list" v-if="filteredTags.length">
          <div
            v-for="tag in filteredTags"
            :key="tag.id"
            class="tag-row"
            :class="{ active: isTagBound(tag.id) }"
            @click="toggleTag(tag)"
            v-click-log="{ module: '笔记-标签配置', operation: `切换标签绑定【${tag.name}】` }"
          >
            <div class="tag-left">
              <span class="color-dot" />
              <div class="tag-text">
                <div class="tag-name">{{ tag.name }}</div>
                <div class="tag-state">{{
                  isTagBound(tag.id) ? $t('note.tagConfig.bound') : $t('note.tagConfig.unbound')
                }}</div>
              </div>
            </div>
            <div class="tag-meta">
              <b-button
                size="small"
                @click.stop="openTagWorkspace(tag.id)"
                v-click-log="{ module: '笔记-标签配置', operation: `编辑标签【${tag.name}】` }"
                >{{ t('note.tagConfig.editInWorkspace') }}</b-button
              >
            </div>
          </div>
        </div>
        <div class="empty" v-else>{{ $t('note.tagConfig.noTagsCreate') }}</div>
      </div>
    </div>
  </BModal>
</template>

<script lang="ts" setup>
  import { computed, inject, onMounted, ref } from 'vue';
  import BModal from '@/components/base/BasicComponents/BModal/BModal.vue';
  import BInput from '@/components/base/BasicComponents/BInput.vue';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import icon from '@/config/icon.ts';
  import { apiBasePost, apiQueryPost } from '@/http/request.ts';
  import { bookmarkStore, useUserStore } from '@/store';
  import message from '@/components/base/BasicComponents/BMessage/BMessage.ts';
  import { useI18n } from 'vue-i18n';
  import { useRouter } from 'vue-router';
  import { recordOperation } from '@/api/commonApi.ts';
  import { blockGuestWrite } from '@/composables/useGuestGuard';

  interface TagItem {
    id: string;
    name: string;
  }

  const { t } = useI18n();
  const props = defineProps<{ note?: any }>();
  const visible = defineModel('visible');
  const emit = defineEmits<{ saveTag: [tags: TagItem[]] }>();
  const bookmark = bookmarkStore();
  const user = useUserStore();
  const router = useRouter();
  const injectedNote: any = inject('note', null);
  const currentNote = computed(() => props.note ?? injectedNote);

  const allTags = ref<TagItem[]>([]);
  const noteTags = ref<TagItem[]>([]);
  const initialNoteTags = ref<TagItem[]>([]);
  const searchValue = ref('');

  const filteredTags = computed(() => {
    const keyword = searchValue.value.trim().toLowerCase();
    if (!keyword) return allTags.value;
    return allTags.value.filter((tag) => tag.name.toLowerCase().includes(keyword));
  });

  onMounted(() => {
    fetchAllTags();
    fetchNoteTags();
  });

  async function fetchAllTags() {
    const res = await apiQueryPost('/api/bookmark/queryTagList', {
      filters: { userId: user.id },
    });
    if (res.status === 200) {
      allTags.value = (res.data ?? []).map(normalizeTag);
    }
  }

  async function fetchNoteTags() {
    if (!currentNote.value?.id) return;
    try {
      const res = await apiBasePost('/api/note/getNoteTags', { id: currentNote.value.id });
      if (res.status === 200) {
        noteTags.value = (res.data ?? []).map(normalizeTag);
        initialNoteTags.value = [...noteTags.value];
        return;
      }
    } catch (error) {
      console.warn('fetchNoteTags fallback', error);
    }
    hydrateFromLocal();
  }

  function normalizeTag(raw: any): TagItem {
    return {
      id: String(raw.id),
      name: raw.name ?? '',
    };
  }

  function hydrateFromLocal() {
    if (!currentNote.value?.tags) return;
    try {
      const parsed =
        typeof currentNote.value.tags === 'string' ? JSON.parse(currentNote.value.tags) : currentNote.value.tags;
      if (Array.isArray(parsed)) {
        const ids = parsed.map((v) => String(v?.id ?? v)).filter(Boolean);
        noteTags.value = allTags.value.filter((t) => ids.includes(t.id));
        initialNoteTags.value = [...noteTags.value];
      }
    } catch (error) {
      console.warn('parse note.tags failed', error);
    }
  }

  function isTagBound(tagId: string) {
    return noteTags.value.some((t) => t.id === tagId);
  }

  function bindTag(tag: TagItem) {
    if (isTagBound(tag.id)) {
      message.warning(t('note.tagConfig.tagBound'));
      return;
    }
    if (noteTags.value.length >= 3) {
      message.warning(t('note.tagConfig.maxTags'));
      return;
    }
    noteTags.value.push(tag);
  }

  function unbindTag(tag: TagItem) {
    noteTags.value = noteTags.value.filter((t) => t.id !== tag.id);
  }

  function toggleTag(tag: TagItem) {
    if (isTagBound(tag.id)) {
      unbindTag(tag);
      return;
    }
    bindTag(tag);
  }

  function resetTags() {
    noteTags.value = [...initialNoteTags.value];
  }

  function openTagWorkspace(tagId?: string) {
    const target = tagId === 'add' ? '/manage/editTag/add' : tagId ? `/manage/editTag/${tagId}` : '/manage/tagMg';
    const resolved = router.resolve(target);
    window.open(resolved.href, '_blank');
  }

  async function handleOk() {
    if (blockGuestWrite('update-note-tags')) return;
    if (!currentNote.value?.id) {
      message.warning(t('note.tagConfig.noteNotSaved'));
      return;
    }
    const newTagIds = noteTags.value.map((t) => t.id);
    const res = await apiBasePost('/api/note/updateNoteTags', { noteId: currentNote.value.id, tags: newTagIds });
    if (res.status === 200) {
      visible.value = false;
      emit('saveTag', [...noteTags.value]);
      message.success(t('note.tagConfig.saveSuccess'));
      recordOperation({ module: '笔记-标签配置', operation: `保存笔记标签成功【${noteTags.value.length}个】` });
    }
  }
</script>

<style lang="less" scoped>
  .tag-config {
    width: min(74vw, 980px);
    display: grid;
    grid-template-columns: minmax(280px, 340px) minmax(0, 1fr);
    gap: 18px;
    min-height: 460px;
    color: var(--text-color);

    &.mobile {
      width: 100%;
      grid-template-columns: 1fr;
      gap: 16px;
    }
  }

  .panel {
    background: var(--background-color);
    border: 1px solid var(--card-border-color);
    border-radius: 14px;
    padding: 16px;
    box-shadow: var(--ant-table-boxShadow);
  }

  .panel-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
    margin-bottom: 10px;
  }

  .panel-header--library {
    align-items: flex-start;
  }

  .title {
    font-weight: 600;
    font-size: 16px;
    color: var(--text-color);
  }

  .panel-subtitle {
    font-size: 12px;
    color: var(--desc-color);
    margin: 0 0 10px;
    line-height: 1.5;
  }

  .panel-subtitle--tight {
    margin: 6px 0 0;
  }

  .selected-overview {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px 14px;
    border-radius: 12px;
    margin-bottom: 14px;
    background: color-mix(in srgb, var(--noteType-hover-color) 10%, var(--background-color));
    border: 1px solid color-mix(in srgb, var(--noteType-hover-color) 24%, var(--card-border-color));
  }

  .overview-count {
    min-width: 44px;
    height: 44px;
    border-radius: 12px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 22px;
    font-weight: 700;
    color: var(--noteType-hover-color);
    background: color-mix(in srgb, var(--noteType-hover-color) 14%, white);
  }

  .overview-text {
    font-size: 13px;
    line-height: 1.5;
    color: var(--desc-color);
  }

  .chip-list {
    display: flex;
    flex-direction: column;
    gap: 10px;
    min-height: 48px;
  }

  .chip {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 12px;
    border-radius: 12px;
    border: 1px solid rgba(96, 92, 229, 0.3);
    background: rgba(96, 92, 229, 0.06);
    color: var(--text-color);
  }

  .color-dot {
    width: 12px;
    height: 12px;
    border-radius: 50%;
    background: var(--noteType-hover-color, #605ce5);
    flex: 0 0 auto;
  }

  .chip-text {
    min-width: 0;
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .chip-close {
    cursor: pointer;
    flex: 0 0 auto;
  }

  .tag-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    justify-content: flex-end;
  }

  .tag-toolbar {
    margin-bottom: 12px;
  }

  .tag-list {
    display: flex;
    flex-direction: column;
    gap: 10px;
    max-height: 360px;
    overflow: auto;
    padding: 2px 2px 0;
  }

  .tag-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 10px;
    padding: 12px;
    border: 1px solid var(--card-border-color);
    border-radius: 12px;
    background: var(--background-color);
    transition:
      border-color 0.15s ease,
      box-shadow 0.15s ease,
      transform 0.15s ease;
    cursor: pointer;

    &:hover {
      border-color: rgba(96, 92, 229, 0.4);
      transform: translateY(-1px);
      box-shadow: 0 10px 20px rgba(0, 0, 0, 0.12);
    }

    &.active {
      border-color: rgba(96, 92, 229, 0.75);
      box-shadow: 0 0 0 1px rgba(96, 92, 229, 0.18);
      background: color-mix(in srgb, var(--noteType-hover-color) 7%, var(--background-color));
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
    font-weight: 600;
    color: var(--text-color);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .tag-state {
    margin-top: 4px;
    font-size: 12px;
    color: var(--desc-color);
  }

  .tag-meta {
    flex: 0 0 auto;
  }

  .empty {
    color: var(--desc-color);
    font-size: 13px;
    padding: 16px 0;
    text-align: center;
  }

  @media (max-width: 900px) {
    .panel-header--library {
      flex-direction: column;
      align-items: stretch;
    }

    .tag-actions {
      justify-content: flex-start;
    }
  }
</style>
