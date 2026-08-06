<template>
  <section class="note-subpage-section" :aria-label="t('note.subpageSection')">
    <header class="note-subpage-header">
      <div class="note-subpage-heading">
        <strong>{{ t('note.subpageSection') }}</strong>
        <span>{{ items.length }}</span>
      </div>
      <BButton v-if="!readonly" type="primary" class="note-subpage-create" @click="emit('create')">
        <SvgIcon :src="icon.common.add" size="14" aria-hidden="true" />
        {{ t('note.newChildPage') }}
      </BButton>
    </header>

    <BLoading v-if="loading" inline loading :title="t('common.loading')" />
    <div v-else-if="items.length" v-auto-scrollbar class="note-subpage-list">
      <BButton v-for="item in items" :key="item.id" class="note-subpage-row" @click="emit('open', item.id)">
        <SvgIcon :src="icon.resource.note" size="15" aria-hidden="true" />
        <span class="note-subpage-title">{{ item.title || t('note.untitled') }}</span>
        <span v-if="item.childCount" class="note-subpage-count">{{
          t('note.childPages', { count: item.childCount })
        }}</span>
        <SvgIcon :src="icon.arrow_right" size="13" aria-hidden="true" />
      </BButton>
    </div>
    <p v-else-if="error" class="note-subpage-error">{{ error }}</p>
    <p v-else class="note-subpage-empty">{{ t('note.noSubpages') }}</p>
  </section>
</template>

<script lang="ts" setup>
  import { ref, watch } from 'vue';
  import { useI18n } from 'vue-i18n';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BLoading from '@/components/base/BasicComponents/BLoading.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import icon from '@/config/icon';
  import { apiBasePost } from '@/http/request';
  import type { NoteTreeItem, NoteTreeQueryResult } from '@/types/noteTree';

  const props = withDefaults(defineProps<{ noteId: string; readonly?: boolean }>(), { readonly: false });
  const emit = defineEmits<{ create: []; open: [id: string] }>();
  const { t } = useI18n();
  const items = ref<NoteTreeItem[]>([]);
  const loading = ref(false);
  const error = ref('');
  let requestSeq = 0;

  async function loadSubpages() {
    const noteId = String(props.noteId || '').trim();
    const seq = ++requestSeq;
    if (!noteId) {
      items.value = [];
      return;
    }
    loading.value = true;
    error.value = '';
    try {
      const response = await apiBasePost('/api/note/queryNoteTree', { parentId: noteId, depth: 1 }, { silent: true });
      if (seq !== requestSeq) return;
      if (response.status !== 200) {
        items.value = [];
        error.value = response.msg || t('note.treeLoadFailed');
        return;
      }
      const data = (response.data || {}) as NoteTreeQueryResult;
      items.value = Array.isArray(data.items) ? data.items : [];
    } catch {
      if (seq === requestSeq) {
        items.value = [];
        error.value = t('note.treeLoadFailed');
      }
    } finally {
      if (seq === requestSeq) loading.value = false;
    }
  }

  watch(
    () => props.noteId,
    () => void loadSubpages(),
    { immediate: true },
  );
</script>

<style lang="less" scoped>
  .note-subpage-section {
    flex: 0 0 auto;
    max-height: min(34vh, 270px);
    padding: 10px 14px 12px;
    border-top: 1px solid var(--surface-border-color);
    background: var(--workspace-panel-bg-color, var(--surface-page-bg));
  }

  .note-subpage-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
  }

  .note-subpage-heading {
    display: flex;
    align-items: center;
    gap: 7px;
    color: var(--text-color);
    font-size: 13px;

    span {
      color: var(--desc-color);
      font-size: 11px;
      font-variant-numeric: tabular-nums;
    }
  }

  .note-subpage-create {
    height: 30px;
    gap: 5px;
    border-radius: 8px;
  }

  .note-subpage-list {
    max-height: 180px;
    margin-top: 7px;
    overflow-y: auto;
  }

  .note-subpage-row {
    width: 100%;
    min-height: 34px;
    padding: 4px 7px;
    justify-content: flex-start;
    gap: 7px;
    border: 1px solid transparent;
    border-bottom-color: var(--surface-border-color);
    border-radius: 7px;
    color: var(--desc-color);
    background: transparent;

    &:hover,
    &:focus-visible {
      border-color: var(--resource-note-color, #00a884);
      color: var(--resource-note-color, #00a884);
    }
  }

  .note-subpage-title {
    min-width: 0;
    overflow: hidden;
    color: var(--text-color);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .note-subpage-count {
    margin-left: auto;
    color: var(--desc-color);
    font-size: 11px;
  }

  .note-subpage-empty,
  .note-subpage-error {
    margin: 8px 0 0;
    color: var(--desc-color);
    font-size: 12px;
  }

  .note-subpage-error {
    color: var(--danger-color, #dc2626);
  }

  @media (max-width: 767px) {
    .note-subpage-section {
      max-height: min(38dvh, 250px);
      padding-inline: 12px;
      padding-bottom: max(10px, env(safe-area-inset-bottom));
    }

    .note-subpage-row {
      min-height: 42px;
    }
  }
</style>
