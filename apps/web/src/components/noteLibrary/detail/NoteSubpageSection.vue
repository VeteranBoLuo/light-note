<template>
  <section class="note-subpage-section" :aria-label="t('note.subpageSection')">
    <header class="note-subpage-header">
      <div class="note-subpage-heading">
        <strong>{{ t('note.subpageSection') }}</strong>
        <span>{{ items.length || t('note.noSubpagesShort') }}</span>
      </div>
      <div v-if="!readonly" class="note-subpage-actions">
        <BDropdown
          class="note-subpage-position-menu"
          :trigger="'click'"
          :align="'right'"
          :menu-options="positionMenuOptions"
        >
          <BButton class="note-subpage-position-button" :title="t('note.pageRelations')">
            <SvgIcon :src="icon.noteTree.move" size="14" aria-hidden="true" />
            {{ t('note.pageRelations') }}
          </BButton>
        </BDropdown>
        <BButton type="primary" class="note-subpage-create" @click="emit('create')">
          <SvgIcon :src="icon.common.add" size="14" aria-hidden="true" />
          {{ t('note.newChildPage') }}
        </BButton>
      </div>
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
  </section>
</template>

<script lang="ts" setup>
  import { computed, ref, watch } from 'vue';
  import { useI18n } from 'vue-i18n';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BDropdown from '@/components/base/BasicComponents/BDropdown.vue';
  import BLoading from '@/components/base/BasicComponents/BLoading.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import icon from '@/config/icon';
  import { apiBasePost } from '@/http/request';
  import type { NoteTreeItem, NoteTreeQueryResult } from '@/types/noteTree';

  const props = withDefaults(defineProps<{ noteId: string; readonly?: boolean; refreshKey?: number }>(), {
    readonly: false,
    refreshKey: 0,
  });
  const emit = defineEmits<{ create: []; attach: []; moveSelf: []; open: [id: string] }>();
  const { t } = useI18n();
  const items = ref<NoteTreeItem[]>([]);
  const loading = ref(false);
  const error = ref('');
  let requestSeq = 0;
  const positionMenuOptions = computed(() => [
    {
      key: 'add-existing-children',
      label: t('note.moveExistingUnderThisPage'),
      icon: icon.noteTree.move,
      function: () => emit('attach'),
    },
    {
      key: 'move-this-page',
      label: t('note.moveThisPageUnderAnother'),
      icon: icon.noteTree.move,
      function: () => emit('moveSelf'),
    },
  ]);

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
    () => [props.noteId, props.refreshKey] as const,
    () => void loadSubpages(),
    { immediate: true },
  );
</script>

<style lang="less" scoped>
  .note-subpage-section {
    flex: 0 0 auto;
    max-height: min(18vh, 118px);
    padding: 6px 10px 7px;
    box-sizing: border-box;
    border-top: 1px solid var(--surface-border-color);
    background: var(--surface-page-bg, var(--background-color));
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

  .note-subpage-actions {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .note-subpage-create,
  .note-subpage-position-button {
    height: 28px;
    padding-inline: 9px;
    gap: 5px;
    border-radius: 7px;
    font-size: 12px;
  }

  .note-subpage-position-button {
    border: 1px solid var(--surface-border-color);
    color: var(--resource-note-color, #00a884);
    background: transparent !important;
  }

  .note-subpage-position-menu {
    display: inline-flex;
  }

  .note-subpage-list {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 5px;
    max-height: 70px;
    margin-top: 5px;
    overflow-y: auto;
  }

  .note-subpage-row {
    width: 100%;
    min-width: 0;
    height: 32px;
    padding: 4px 7px;
    justify-content: flex-start;
    gap: 7px;
    border: 1px solid var(--surface-border-color) !important;
    border-radius: 7px;
    color: var(--desc-color);
    background: transparent !important;

    &:hover,
    &:focus-visible {
      border-color: var(--resource-note-color, #00a884) !important;
      color: var(--resource-note-color, #00a884);
      background: var(--menu-item-h-bg-color) !important;
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

  .note-subpage-error {
    margin: 6px 0 0;
    color: var(--danger-color, #dc2626);
    font-size: 12px;
  }

  @media (max-width: 767px) {
    .note-subpage-section {
      max-height: min(18dvh, 108px);
      padding: 6px 8px;
    }

    .note-subpage-list {
      grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
      max-height: 76px;
    }

    .note-subpage-row {
      height: 38px;
    }

    .note-subpage-actions {
      gap: 5px;
    }

    .note-subpage-heading {
      gap: 5px;

      strong {
        font-size: 12px;
      }
    }
  }
</style>
