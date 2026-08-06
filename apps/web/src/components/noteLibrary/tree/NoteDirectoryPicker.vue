<template>
  <component
    :is="shellComponent"
    v-bind="shellProps"
    @ok="confirmSelection"
    @close="close"
    @update:visible="syncVisible"
  >
    <div class="note-directory-picker" :class="{ 'is-mobile': bookmark.isMobile }">
      <div class="note-directory-picker__target">
        <span>{{ t('note.moveTarget') }}</span>
        <strong>{{ selectedTitle }}</strong>
        <span>{{ t('note.moveTargetDepth', { depth: selectedDepth }) }}</span>
      </div>

      <BLoading v-if="loading" inline loading :title="t('common.loading')" />
      <template v-else>
        <div v-auto-scrollbar class="note-directory-picker__list" role="listbox" :aria-label="t('note.moveTarget')">
          <BButton
            class="note-directory-picker__row is-root"
            :class="{ 'is-selected': selectedParentId === null }"
            role="option"
            :aria-selected="selectedParentId === null"
            @click="selectedParentId = null"
          >
            <SvgIcon :src="icon.noteTree.root" size="17" aria-hidden="true" />
            <span class="note-directory-picker__title">{{ t('note.knowledgeRoot') }}</span>
            <SvgIcon
              v-if="selectedParentId === null"
              :src="icon.filterPanel.check"
              class="note-directory-picker__check"
              size="15"
              aria-hidden="true"
            />
          </BButton>

          <BButton
            v-for="item in flatItems"
            :key="item.id"
            class="note-directory-picker__row"
            :class="{
              'is-selected': selectedParentId === item.id,
              'is-disabled-target': disabledIds.has(item.id),
            }"
            :style="{ '--note-directory-depth': String(item.depth) }"
            :disabled="disabledIds.has(item.id)"
            role="option"
            :aria-selected="selectedParentId === item.id"
            @click="selectedParentId = item.id"
          >
            <SvgIcon :src="icon.resource.note" size="15" aria-hidden="true" />
            <span class="note-directory-picker__title">{{ item.title || t('note.untitled') }}</span>
            <span v-if="item.childCount" class="note-directory-picker__count">{{ item.childCount }}</span>
            <span v-if="disabledIds.has(item.id)" class="note-directory-picker__disabled">
              {{ t('ai.noteTargetDirectory.depthLimit') }}
            </span>
            <SvgIcon
              v-if="selectedParentId === item.id"
              :src="icon.filterPanel.check"
              class="note-directory-picker__check"
              size="15"
              aria-hidden="true"
            />
          </BButton>
        </div>
        <p v-if="error" class="note-directory-picker__error">{{ error }}</p>
      </template>

      <div v-if="bookmark.isMobile" class="note-directory-picker__footer">
        <BButton :disabled="busy || loading" type="primary" @click="confirmSelection">
          {{ busy ? t('ai.noteTargetDirectory.replacing') : t('ai.noteTargetDirectory.confirm') }}
        </BButton>
        <BButton :disabled="busy" @click="close">{{ t('common.cancel') }}</BButton>
      </div>
    </div>
  </component>
</template>

<script setup lang="ts">
  import { computed, ref, watch } from 'vue';
  import { useI18n } from 'vue-i18n';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BDrawer from '@/components/base/BasicComponents/BDrawer.vue';
  import BLoading from '@/components/base/BasicComponents/BLoading.vue';
  import BModal from '@/components/base/BasicComponents/BModal/BModal.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import icon from '@/config/icon';
  import { apiBasePost } from '@/http/request';
  import { bookmarkStore } from '@/store';
  import type { NoteTreeItem, NoteTreeQueryResult } from '@/types/noteTree';
  import { flattenNoteTree } from '@/utils/noteTree';

  const props = withDefaults(
    defineProps<{
      initialParentId?: string | null;
      busy?: boolean;
    }>(),
    {
      initialParentId: null,
      busy: false,
    },
  );
  const visible = defineModel<boolean>('visible', { default: false });
  const emit = defineEmits<{ selected: [parentId: string | null] }>();
  const { t } = useI18n();
  const bookmark = bookmarkStore();
  const treeItems = ref<NoteTreeItem[]>([]);
  const maxDepth = ref<number | null>(null);
  const selectedParentId = ref<string | null>(null);
  const loading = ref(false);
  const error = ref('');
  let requestSeq = 0;

  const shellComponent = computed(() => (bookmark.isMobile ? BDrawer : BModal));
  const shellProps = computed(() =>
    bookmark.isMobile
      ? {
          open: visible.value,
          title: t('ai.noteTargetDirectory.choose'),
          placement: 'bottom' as const,
          height: 'min(88dvh, 760px)',
          bodyPadding: '12px 12px 0',
          maskClosable: false,
        }
      : {
          visible: visible.value,
          title: t('ai.noteTargetDirectory.choose'),
          width: 'min(580px, 88vw)',
          height: 'min(720px, 82vh)',
          maskClosable: false,
        },
  );
  const flatItems = computed(() => flattenNoteTree(treeItems.value));
  const disabledIds = computed(
    () =>
      new Set(
        flatItems.value
          .filter((item) => item.invalidParent || !maxDepth.value || item.depth >= maxDepth.value)
          .map((item) => item.id),
      ),
  );
  const selectedItem = computed(() => flatItems.value.find((item) => item.id === selectedParentId.value) || null);
  const selectedTitle = computed(() => selectedItem.value?.title || t('note.knowledgeRoot'));
  const selectedDepth = computed(() => Number(selectedItem.value?.depth || 0));

  function close() {
    if (props.busy) return;
    visible.value = false;
  }

  function syncVisible(next: boolean) {
    if (!next && props.busy) return;
    visible.value = next;
  }

  function confirmSelection() {
    if (props.busy || loading.value || disabledIds.value.has(String(selectedParentId.value || ''))) return;
    emit('selected', selectedParentId.value);
  }

  async function loadTree() {
    const seq = ++requestSeq;
    loading.value = true;
    error.value = '';
    maxDepth.value = null;
    selectedParentId.value = String(props.initialParentId || '').trim() || null;
    try {
      const response = await apiBasePost(
        '/api/note/queryNoteTree',
        { parentId: null, depth: 'all' },
        { silent: true },
      );
      if (seq !== requestSeq || !visible.value) return;
      if (response.status !== 200) {
        treeItems.value = [];
        error.value = response.msg || t('note.treeLoadFailed');
        return;
      }
      const data = (response.data || {}) as NoteTreeQueryResult;
      const serverMaxDepth = Number(data.maxDepth);
      if (!Number.isInteger(serverMaxDepth) || serverMaxDepth < 1) {
        treeItems.value = [];
        error.value = t('note.treeLoadFailed');
        return;
      }
      maxDepth.value = serverMaxDepth;
      treeItems.value = Array.isArray(data.items) ? data.items : [];
      if (
        selectedParentId.value &&
        (!flatItems.value.some((item) => item.id === selectedParentId.value) ||
          disabledIds.value.has(selectedParentId.value))
      ) {
        selectedParentId.value = null;
      }
    } catch {
      if (seq === requestSeq) {
        treeItems.value = [];
        maxDepth.value = null;
        error.value = t('note.treeLoadFailed');
      }
    } finally {
      if (seq === requestSeq) loading.value = false;
    }
  }

  watch(
    () => [visible.value, props.initialParentId] as const,
    ([isVisible]) => {
      if (isVisible) void loadTree();
      else requestSeq += 1;
    },
    { immediate: true },
  );
</script>

<style scoped lang="less">
  .note-directory-picker {
    height: 100%;
    min-height: 0;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .note-directory-picker__target {
    flex: 0 0 auto;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 10px 12px;
    border: 1px solid var(--surface-border-color);
    border-radius: 10px;
    color: var(--desc-color);
    background: var(--workspace-panel-bg-color, var(--menu-body-bg-color));
    font-size: 12px;

    strong {
      min-width: 0;
      overflow: hidden;
      color: var(--text-color);
      text-overflow: ellipsis;
      white-space: nowrap;
    }
  }

  .note-directory-picker__list {
    flex: 1;
    min-height: 180px;
    overflow-y: auto;
  }

  .note-directory-picker__row {
    width: 100%;
    min-height: 40px;
    margin-block: 2px;
    padding: 5px 8px 5px calc(10px + var(--note-directory-depth, 0) * 14px);
    justify-content: flex-start;
    gap: 7px;
    border: 1px solid transparent;
    border-radius: 9px;
    color: var(--desc-color);
    background: transparent;
    text-align: left;

    &.is-root {
      padding-left: 10px;
    }

    &.is-selected {
      border-color: var(--resource-note-color, #00a884);
      color: var(--resource-note-color, #00a884);
      background: color-mix(in srgb, var(--resource-note-color, #00a884) 10%, var(--menu-body-bg-color));
      font-weight: 650;
    }

    &.is-disabled-target {
      border-style: dashed;
      opacity: 0.55;
    }
  }

  .note-directory-picker__title {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .note-directory-picker__count,
  .note-directory-picker__check {
    margin-left: auto;
  }

  .note-directory-picker__disabled {
    margin-left: auto;
    color: var(--danger-color, #dc2626);
    font-size: 11px;
  }

  .note-directory-picker__error {
    margin: 0;
    color: var(--danger-color, #dc2626);
    font-size: 12px;
  }

  .note-directory-picker__footer {
    position: sticky;
    bottom: 0;
    z-index: 1;
    flex: 0 0 auto;
    display: flex;
    gap: 8px;
    padding: 10px 0 max(10px, env(safe-area-inset-bottom));

    > * {
      flex: 1;
      min-height: 44px;
    }
  }

  @media (max-width: 767px) {
    .note-directory-picker__row {
      min-height: 48px;
    }
  }
</style>
