<template>
  <component :is="shellComponent" v-bind="shellProps" v-on="shellListeners">
    <div class="note-attach-shell" :class="{ 'is-mobile': bookmark.isMobile }">
      <div class="note-attach-summary">
        <span>{{ t('note.attachTarget') }}</span>
        <strong>{{ targetNote?.title || t('note.untitled') }}</strong>
        <span>{{ t('note.attachSelectedCount', { count: selectedIds.size }) }}</span>
      </div>
      <p class="note-attach-hint">
        {{ t('note.attachPagesHint', { title: targetNote?.title || t('note.untitled') }) }}
      </p>

      <BInput v-model:value="keyword" :placeholder="t('note.attachSearch')" clearable>
        <template #prefix>
          <SvgIcon :src="icon.navigation.search" size="14" aria-hidden="true" />
        </template>
      </BInput>

      <BLoading v-if="loading" inline loading :title="t('common.loading')" />
      <template v-else>
        <div v-auto-scrollbar class="note-attach-list" role="listbox" :aria-label="t('note.attachPagesTitle')">
          <BButton
            v-for="item in filteredItems"
            :key="item.id"
            class="note-attach-row"
            :class="{
              'is-selected': selectedIds.has(item.id),
              'is-disabled-target': disabledReasons.has(item.id),
            }"
            :style="{ '--note-attach-depth': String(item.depth) }"
            :disabled="disabledReasons.has(item.id)"
            role="option"
            :aria-selected="selectedIds.has(item.id)"
            @click="toggleSelected(item.id)"
          >
            <SvgIcon :src="icon.resource.note" size="15" aria-hidden="true" />
            <span class="note-attach-title">{{ item.title || t('note.untitled') }}</span>
            <span v-if="item.childCount" class="note-attach-count">{{ item.childCount }}</span>
            <span v-if="disabledReasons.has(item.id)" class="note-attach-disabled">
              {{ disabledReasons.get(item.id) }}
            </span>
            <SvgIcon
              v-if="selectedIds.has(item.id)"
              :src="icon.filterPanel.check"
              class="note-attach-check"
              size="15"
              aria-hidden="true"
            />
          </BButton>
          <p v-if="!filteredItems.length" class="note-attach-empty">{{ t('note.attachNoCandidates') }}</p>
        </div>
        <p v-if="loadError" class="note-attach-error">{{ loadError }}</p>
      </template>

      <div class="note-attach-footer">
        <BButton :disabled="saving || loading || !selectedIds.size" type="primary" @click="confirmAttach">
          {{ saving ? t('common.loading') : t('note.attachConfirm') }}
        </BButton>
        <BButton :disabled="saving" @click="close">{{ t('common.cancel') }}</BButton>
      </div>
    </div>
  </component>
</template>

<script lang="ts" setup>
  import { computed, ref, watch } from 'vue';
  import { useI18n } from 'vue-i18n';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BDrawer from '@/components/base/BasicComponents/BDrawer.vue';
  import BInput from '@/components/base/BasicComponents/BInput.vue';
  import BLoading from '@/components/base/BasicComponents/BLoading.vue';
  import BModal from '@/components/base/BasicComponents/BModal/BModal.vue';
  import message from '@/components/base/BasicComponents/BMessage/BMessage';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import icon from '@/config/icon';
  import { apiBasePost } from '@/http/request';
  import { bookmarkStore } from '@/store';
  import type { NoteTreeItem, NoteTreeQueryResult } from '@/types/noteTree';
  import { canMoveNoteSubtreeToDepth, collectNoteDescendantIds, flattenNoteTree } from '@/utils/noteTree';

  const props = defineProps<{ targetNote: { id: string; title?: string } | null }>();
  const visible = defineModel<boolean>('visible', { default: false });
  const emit = defineEmits<{ attached: [result: any] }>();
  const { t } = useI18n();
  const bookmark = bookmarkStore();
  const treeItems = ref<NoteTreeItem[]>([]);
  const maxDepth = ref(0);
  const keyword = ref('');
  const selectedIds = ref(new Set<string>());
  const loading = ref(false);
  const saving = ref(false);
  const loadError = ref('');
  let requestSeq = 0;

  const shellComponent = computed(() => (bookmark.isMobile ? BDrawer : BModal));
  const shellProps = computed(() =>
    bookmark.isMobile
      ? {
          open: visible.value,
          title: t('note.attachPagesTitle'),
          placement: 'bottom' as const,
          height: 'min(88dvh, 760px)',
          bodyPadding: '12px 12px 0',
          maskClosable: false,
        }
      : {
          visible: visible.value,
          title: t('note.attachPagesTitle'),
          width: 'min(620px, 88vw)',
          height: 'min(740px, 84vh)',
          maskClosable: false,
          showFooter: false,
        },
  );
  const shellListeners = computed(() =>
    bookmark.isMobile
      ? { close }
      : { ok: confirmAttach, close, 'update:visible': syncVisible },
  );
  const flatItems = computed(() => flattenNoteTree(treeItems.value));
  const targetId = computed(() => String(props.targetNote?.id || '').trim());
  const targetItem = computed(() => flatItems.value.find((item) => item.id === targetId.value) || null);
  const targetDepth = computed(() => Number(targetItem.value?.depth || 0));
  const targetDescendants = computed(() => collectNoteDescendantIds(treeItems.value, targetId.value));
  const targetAncestors = computed(() => {
    const parentById = new Map(flatItems.value.map((item) => [item.id, String(item.parentId || '').trim()]));
    const result = new Set<string>();
    let cursor = parentById.get(targetId.value) || '';
    while (cursor && !result.has(cursor)) {
      result.add(cursor);
      cursor = parentById.get(cursor) || '';
    }
    return result;
  });
  const relativeDepthById = computed(() => {
    const result = new Map<string, number>();
    const childrenByParent = new Map<string, string[]>();
    for (const item of flatItems.value) {
      const parentId = String(item.parentId || '').trim();
      if (!parentId) continue;
      const children = childrenByParent.get(parentId) || [];
      children.push(item.id);
      childrenByParent.set(parentId, children);
    }
    for (const item of [...flatItems.value].reverse()) {
      const relativeDepth = Math.max(
        0,
        ...(childrenByParent.get(item.id) || []).map((childId) => 1 + (result.get(childId) || 0)),
      );
      result.set(item.id, relativeDepth);
    }
    return result;
  });
  const disabledReasons = computed(() => {
    const result = new Map<string, string>();
    for (const item of flatItems.value) {
      if (item.id === targetId.value || targetDescendants.value.has(item.id)) {
        result.set(item.id, t('note.attachAlreadyInBranch'));
        continue;
      }
      if (targetAncestors.value.has(item.id)) {
        result.set(item.id, t('note.moveDescendantDisabled'));
        continue;
      }
      if (!canMoveNoteSubtreeToDepth(targetDepth.value, relativeDepthById.value.get(item.id) || 0, maxDepth.value)) {
        result.set(item.id, t('note.attachDepthDisabled'));
      }
    }
    return result;
  });
  const filteredItems = computed(() => {
    const normalized = keyword.value.trim().toLowerCase();
    if (!normalized) return flatItems.value;
    return flatItems.value.filter((item) =>
      String(item.title || '')
        .toLowerCase()
        .includes(normalized),
    );
  });

  function close() {
    if (!saving.value) visible.value = false;
  }
  function syncVisible(next: boolean) {
    if (next || !saving.value) visible.value = next;
  }
  function toggleSelected(id: string) {
    if (disabledReasons.value.has(id)) return;
    const next = new Set(selectedIds.value);
    if (next.has(id)) next.delete(id);
    else if (next.size < 100) next.add(id);
    selectedIds.value = next;
  }

  async function loadTree() {
    const seq = ++requestSeq;
    loading.value = true;
    loadError.value = '';
    maxDepth.value = 0;
    selectedIds.value = new Set();
    keyword.value = '';
    try {
      const response = await apiBasePost('/api/note/queryNoteTree', { parentId: null, depth: 'all' }, { silent: true });
      if (seq !== requestSeq || !visible.value) return;
      if (response.status !== 200) {
        loadError.value = response.msg || t('note.treeLoadFailed');
        treeItems.value = [];
        return;
      }
      const data = (response.data || {}) as NoteTreeQueryResult;
      const serverMaxDepth = Number(data.maxDepth);
      if (!Number.isInteger(serverMaxDepth) || serverMaxDepth < 1) {
        treeItems.value = [];
        loadError.value = t('note.treeLoadFailed');
        return;
      }
      maxDepth.value = serverMaxDepth;
      treeItems.value = Array.isArray(data.items) ? data.items : [];
      if (!flatItems.value.some((item) => item.id === targetId.value)) {
        treeItems.value = [];
        maxDepth.value = 0;
        loadError.value = t('note.treeLoadFailed');
      }
    } catch {
      if (seq === requestSeq) {
        treeItems.value = [];
        loadError.value = t('note.treeLoadFailed');
      }
    } finally {
      if (seq === requestSeq) loading.value = false;
    }
  }

  async function confirmAttach() {
    if (saving.value || loading.value || !targetId.value || !selectedIds.value.size) return;
    saving.value = true;
    try {
      const response = await apiBasePost('/api/note/moveNoteNodes', {
        ids: [...selectedIds.value],
        parentId: targetId.value,
      });
      if (response.status !== 200) {
        message.error(response.msg || t('note.moveFailed'));
        return;
      }
      message.success(t('note.attachSuccess', { count: selectedIds.value.size }));
      emit('attached', response.data);
      visible.value = false;
    } catch {
      message.error(t('note.moveFailed'));
    } finally {
      saving.value = false;
    }
  }

  watch(
    () => [visible.value, targetId.value] as const,
    ([isVisible]) => {
      if (isVisible && targetId.value) void loadTree();
      else requestSeq += 1;
    },
    { immediate: true },
  );
</script>

<style lang="less" scoped>
  .note-attach-shell {
    height: 100%;
    min-height: 0;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .note-attach-summary {
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
  }

  .note-attach-summary strong {
    min-width: 0;
    overflow: hidden;
    color: var(--text-color);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .note-attach-hint,
  .note-attach-empty {
    margin: 0;
    color: var(--desc-color);
    font-size: 12px;
    line-height: 1.6;
  }

  .note-attach-list {
    flex: 1;
    min-height: 180px;
    overflow-y: auto;
  }

  .note-attach-row {
    width: 100%;
    min-height: 38px;
    margin-block: 2px;
    padding: 5px 8px 5px calc(10px + var(--note-attach-depth, 0) * 14px);
    justify-content: flex-start;
    gap: 7px;
    border: 1px solid transparent;
    border-radius: 9px;
    color: var(--desc-color);

    &.is-selected {
      border-color: var(--resource-note-color, #00a884);
      color: var(--resource-note-color, #00a884);
      background: color-mix(in srgb, var(--resource-note-color, #00a884) 10%, var(--menu-body-bg-color));
      font-weight: 650;
    }

    &.is-disabled-target {
      opacity: 0.58;
    }
  }

  .note-attach-title {
    min-width: 0;
    overflow: hidden;
    text-align: left;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .note-attach-count,
  .note-attach-disabled {
    margin-left: auto;
    color: var(--desc-color);
    font-size: 11px;
  }

  .note-attach-check {
    flex: 0 0 auto;
    color: var(--resource-note-color, #00a884);
  }

  .note-attach-error {
    margin: 0;
    color: var(--danger-color, #ff4d4f);
    font-size: 12px;
  }

  .note-attach-footer {
    display: flex;
    gap: 8px;
    padding: 8px 0 max(12px, env(safe-area-inset-bottom));

    > * {
      flex: 1;
    }
  }
</style>
