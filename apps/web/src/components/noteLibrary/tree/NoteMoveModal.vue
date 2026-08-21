<template>
  <component :is="shellComponent" v-bind="shellProps" v-on="shellListeners">
    <div class="note-move-shell" :class="{ 'is-mobile': bookmark.isMobile }">
      <div class="note-move-summary">
        <strong v-if="isBatchMove">{{ t('note.moveSelectedPages', { count: selectedIds.size }) }}</strong>
        <strong v-else>{{ note?.title || t('note.untitled') }}</strong>
        <span v-if="isBatchMove">{{ t('note.moveSelectedScope', { count: affectedIds.size }) }}</span>
        <span v-else-if="subtreeCount">{{ t('note.moveWithDescendants', { count: subtreeCount }) }}</span>
        <span v-else>{{ t('note.moveSinglePageHint') }}</span>
      </div>

      <BLoading v-if="loading" inline loading :title="t('common.loading')" />
      <template v-else>
        <div class="note-move-target-meta">
          <span>{{ t('note.moveTarget') }}</span>
          <strong>{{ selectedTitle }}</strong>
          <span>{{ t('note.moveTargetDepth', { depth: selectedDestinationDepth }) }}</span>
        </div>

        <div
          v-if="!isBatchMove && selectedItem"
          class="note-move-placement"
          role="group"
          :aria-label="t('note.movePlacement')"
        >
          <BButton
            v-for="option in placementOptions"
            :key="option.value"
            size="small"
            :class="{ 'is-selected': placement === option.value }"
            :disabled="!option.enabled"
            :aria-pressed="placement === option.value"
            @click="placement = option.value"
          >
            {{ option.label }}
          </BButton>
        </div>
        <p class="note-move-outcome" aria-live="polite">
          {{ moveOutcomeHint }}
          <span v-if="pinChangeHint">{{ pinChangeHint }}</span>
        </p>

        <div v-auto-scrollbar class="note-move-list" role="listbox" :aria-label="t('note.moveTarget')">
          <BButton
            class="note-move-row is-root"
            :class="{ 'is-selected': selectedParentId === null }"
            role="option"
            :aria-selected="selectedParentId === null"
            @click="selectTarget(null)"
          >
            <SvgIcon :src="icon.noteTree.root" size="17" aria-hidden="true" />
            <span class="note-move-title">{{ t('note.knowledgeRoot') }}</span>
            <SvgIcon
              v-if="selectedParentId === null"
              :src="icon.filterPanel.check"
              class="note-move-check"
              size="15"
              aria-hidden="true"
            />
          </BButton>

          <BButton
            v-for="item in flatItems"
            :key="item.id"
            class="note-move-row"
            :class="{ 'is-selected': selectedParentId === item.id, 'is-disabled-target': targetIsDisabled(item) }"
            :style="{ '--note-move-depth': String(item.depth) }"
            :disabled="targetIsDisabled(item)"
            role="option"
            :aria-selected="selectedParentId === item.id"
            @click="selectTarget(item.id)"
          >
            <SvgIcon :src="icon.resource.note" size="15" aria-hidden="true" />
            <span class="note-move-title">{{ item.title || t('note.untitled') }}</span>
            <span v-if="item.childCount" class="note-move-count">{{ item.childCount }}</span>
            <span v-if="targetIsDisabled(item)" class="note-move-disabled-label">
              {{ disabledReason(item) }}
            </span>
            <SvgIcon
              v-if="selectedParentId === item.id"
              :src="icon.filterPanel.check"
              class="note-move-check"
              size="15"
              aria-hidden="true"
            />
          </BButton>
        </div>
        <p v-if="loadError" class="note-move-error">{{ loadError }}</p>
      </template>

      <div v-if="bookmark.isMobile" class="note-move-footer">
        <BButton :disabled="saving || loading || !canConfirmMove" type="primary" @click="confirmMove()">
          {{ saving ? t('common.loading') : t('note.confirmMove') }}
        </BButton>
        <BButton :disabled="saving" @click="close">{{ t('common.cancel') }}</BButton>
      </div>
    </div>
    <template v-if="!bookmark.isMobile" #footer>
      <div class="note-move-desktop-footer">
        <BButton :disabled="saving" @click="close">{{ t('common.cancel') }}</BButton>
        <BButton :disabled="saving || loading || !canConfirmMove" type="primary" @click="confirmMove()">
          {{ saving ? t('common.loading') : t('note.confirmMove') }}
        </BButton>
      </div>
    </template>
  </component>
</template>

<script lang="ts" setup>
  import { computed, ref, watch } from 'vue';
  import { useI18n } from 'vue-i18n';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BDrawer from '@/components/base/BasicComponents/BDrawer.vue';
  import BLoading from '@/components/base/BasicComponents/BLoading.vue';
  import BModal from '@/components/base/BasicComponents/BModal/BModal.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import message from '@/components/base/BasicComponents/BMessage/BMessage';
  import icon from '@/config/icon';
  import { apiBasePost } from '@/http/request';
  import { recordNoteTreeProductEvent } from '@/api/noteTreeTelemetry';
  import { bookmarkStore } from '@/store';
  import { requestNoteShareExposureConfirmation } from '@/utils/noteShareExposure';
  import type { NoteTreeItem, NoteTreeQueryResult } from '@/types/noteTree';
  import {
    canMoveNoteSubtreeToDepth,
    collectNoteDescendantIds,
    flattenNoteTree,
    type FlatNoteTreeItem,
  } from '@/utils/noteTree';

  const props = withDefaults(defineProps<{ note?: any | null; notes?: any[] }>(), {
    note: null,
    notes: () => [],
  });
  const visible = defineModel<boolean>('visible', { default: false });
  const emit = defineEmits<{ moved: [result: any] }>();
  const { t } = useI18n();
  const bookmark = bookmarkStore();
  const treeItems = ref<NoteTreeItem[]>([]);
  const maxDepth = ref<number | null>(null);
  const selectedParentId = ref<string | null>(null);
  type MovePlacement = 'inside' | 'before' | 'after';
  const placement = ref<MovePlacement>('inside');
  const loading = ref(false);
  const saving = ref(false);
  const loadError = ref('');
  let requestSeq = 0;

  const shellComponent = computed(() => (bookmark.isMobile ? BDrawer : BModal));
  const shellProps = computed(() =>
    bookmark.isMobile
      ? {
          open: visible.value,
          title: t(isBatchMove.value ? 'note.movePages' : 'note.movePage'),
          placement: 'bottom' as const,
          height: 'min(88dvh, 760px)',
          bodyPadding: '12px 12px 0',
          maskClosable: false,
        }
      : {
          visible: visible.value,
          title: t(isBatchMove.value ? 'note.movePages' : 'note.movePage'),
          width: 'min(580px, 88vw)',
          height: 'min(720px, 82vh)',
          maskClosable: false,
        },
  );
  const shellListeners = computed(() =>
    bookmark.isMobile ? { close } : { ok: confirmMove, close, 'update:visible': syncVisible },
  );
  const flatItems = computed(() => flattenNoteTree(treeItems.value));
  const isBatchMove = computed(() => props.notes.length > 0);
  const movingNotes = computed(() => (isBatchMove.value ? props.notes : props.note ? [props.note] : []));
  const selectedIds = computed(
    () => new Set(movingNotes.value.map((item) => String(item?.id || '').trim()).filter(Boolean)),
  );
  const descendantsBySelected = computed(() => {
    const result = new Map<string, Set<string>>();
    for (const id of selectedIds.value) result.set(id, collectNoteDescendantIds(treeItems.value, id));
    return result;
  });
  const descendantIds = computed(() => {
    const ids = new Set<string>();
    for (const descendants of descendantsBySelected.value.values()) {
      for (const descendantId of descendants) ids.add(descendantId);
    }
    return ids;
  });
  const affectedIds = computed(() => new Set([...selectedIds.value, ...descendantIds.value]));
  const subtreeRelativeDepth = computed(() => {
    let maximum = 0;
    for (const selectedId of selectedIds.value) {
      const movingItem = flatItems.value.find((item) => item.id === selectedId);
      if (!movingItem) continue;
      const descendants = descendantsBySelected.value.get(selectedId) || new Set<string>();
      for (const item of flatItems.value) {
        if (descendants.has(item.id)) {
          maximum = Math.max(maximum, item.depth - movingItem.depth);
        }
      }
    }
    return maximum;
  });
  const structuralDisabledIds = computed(() => new Set([...selectedIds.value, ...descendantIds.value].filter(Boolean)));
  const subtreeCount = computed(() => descendantIds.value.size);
  const selectedItem = computed(() => flatItems.value.find((item) => item.id === selectedParentId.value) || null);
  const selectedTitle = computed(() => selectedItem.value?.title || t('note.knowledgeRoot'));
  const selectedDestinationDepth = computed(() => {
    if (!selectedItem.value) return 1;
    return placement.value === 'inside' ? selectedItem.value.depth + 1 : selectedItem.value.depth;
  });
  const selectedDestinationParentId = computed(() => {
    if (!selectedItem.value || placement.value === 'inside') return selectedParentId.value;
    return selectedItem.value.parentId || null;
  });
  const placementOptions = computed(() => {
    const item = selectedItem.value;
    if (!item) return [];
    return [
      { value: 'inside' as const, label: t('note.moveInside'), enabled: placementAllowed(item, 'inside') },
      { value: 'before' as const, label: t('note.moveBefore'), enabled: placementAllowed(item, 'before') },
      { value: 'after' as const, label: t('note.moveAfter'), enabled: placementAllowed(item, 'after') },
    ];
  });
  const movingItem = computed(() => flatItems.value.find((item) => selectedIds.value.has(item.id)) || null);
  const expectedPinnedState = computed(() => {
    if (!movingItem.value || isBatchMove.value) return null;
    if (placement.value === 'before' || placement.value === 'after') return Boolean(selectedItem.value?.isTop);
    return movingItem.value.parentId === selectedDestinationParentId.value ? Boolean(movingItem.value.isTop) : false;
  });
  const pinChangeHint = computed(() => {
    if (expectedPinnedState.value === null || !movingItem.value) return '';
    if (expectedPinnedState.value === Boolean(movingItem.value.isTop)) return '';
    return t(expectedPinnedState.value ? 'note.moveWillPin' : 'note.moveWillUnpin');
  });
  const moveOutcomeHint = computed(() => {
    if (isBatchMove.value) return t('note.moveBatchInsideHint', { title: selectedTitle.value });
    if (!selectedItem.value) return t('note.moveRootInsideHint');
    if (placement.value === 'before') return t('note.moveBeforeHint', { title: selectedTitle.value });
    if (placement.value === 'after') return t('note.moveAfterHint', { title: selectedTitle.value });
    return t('note.moveInsideHint', { title: selectedTitle.value });
  });
  const canConfirmMove = computed(() => {
    if (!selectedIds.value.size) return false;
    if (!selectedItem.value) return true;
    return !targetIsDisabled(selectedItem.value) && placementAllowed(selectedItem.value, placement.value);
  });

  function placementAllowed(item: FlatNoteTreeItem, nextPlacement: MovePlacement) {
    if (isBatchMove.value && nextPlacement !== 'inside') return false;
    const parentDepth = nextPlacement === 'inside' ? item.depth : Math.max(0, item.depth - 1);
    return canMoveNoteSubtreeToDepth(parentDepth, subtreeRelativeDepth.value, maxDepth.value || 0);
  }

  function targetIsDisabled(item: FlatNoteTreeItem) {
    if (structuralDisabledIds.value.has(item.id)) return true;
    if (isBatchMove.value) return !placementAllowed(item, 'inside');
    return !placementAllowed(item, 'inside') && !placementAllowed(item, 'before');
  }

  function selectTarget(id: string | null) {
    selectedParentId.value = id;
    if (!id || isBatchMove.value) {
      placement.value = 'inside';
      return;
    }
    const item = flatItems.value.find((candidate) => candidate.id === id);
    if (!item || !placementAllowed(item, placement.value)) {
      placement.value = item && placementAllowed(item, 'inside') ? 'inside' : 'before';
    }
  }

  function disabledReason(item: NoteTreeItem) {
    if (selectedIds.value.has(item.id)) {
      return t(isBatchMove.value ? 'note.moveSelectedDisabled' : 'note.moveSelfDisabled');
    }
    if (descendantIds.value.has(item.id)) {
      return t(isBatchMove.value ? 'note.moveSelectedDescendantDisabled' : 'note.moveDescendantDisabled');
    }
    return t('note.moveDepthDisabled');
  }

  function close() {
    if (saving.value) return;
    visible.value = false;
  }
  function syncVisible(next: boolean) {
    visible.value = next;
  }

  async function loadTree() {
    const seq = ++requestSeq;
    loading.value = true;
    loadError.value = '';
    maxDepth.value = null;
    const parentIds = new Set(movingNotes.value.map((item) => (item?.parentId ? String(item.parentId) : null)));
    selectedParentId.value = parentIds.size === 1 ? (parentIds.values().next().value ?? null) : null;
    placement.value = 'inside';
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
      const initialTarget = flatItems.value.find((item) => item.id === selectedParentId.value);
      if (initialTarget && targetIsDisabled(initialTarget)) selectTarget(null);
    } catch {
      if (seq === requestSeq) {
        treeItems.value = [];
        maxDepth.value = null;
        loadError.value = t('note.treeLoadFailed');
      }
    } finally {
      if (seq === requestSeq) loading.value = false;
    }
  }

  async function confirmMove(shareExposureAcknowledged = false) {
    if (saving.value || loading.value || selectedIds.value.size === 0 || !canConfirmMove.value) return;
    const startedAt = Date.now();
    const telemetryBase = {
      surface: (bookmark.isMobile ? 'mobile' : 'desktop') as 'mobile' | 'desktop',
      depth: selectedDestinationDepth.value,
      childCount: Math.max(
        0,
        Number(
          placement.value === 'inside'
            ? selectedItem.value?.childCount || 0
            : flatItems.value.find((item) => item.id === selectedDestinationParentId.value)?.childCount || 0,
        ),
      ),
      subtreeSize: affectedIds.value.size,
    };
    saving.value = true;
    try {
      const response = isBatchMove.value
        ? await apiBasePost(
            '/api/note/moveNoteNodes',
            {
              ids: [...selectedIds.value],
              parentId: selectedDestinationParentId.value,
              ...(shareExposureAcknowledged ? { shareExposureAcknowledged: true } : {}),
            },
            { silent: true },
          )
        : await apiBasePost(
            '/api/note/moveNoteNode',
            {
              id: [...selectedIds.value][0],
              parentId: selectedDestinationParentId.value,
              previousId: placement.value === 'after' ? selectedParentId.value : null,
              nextId: placement.value === 'before' ? selectedParentId.value : null,
              ...(shareExposureAcknowledged ? { shareExposureAcknowledged: true } : {}),
            },
            { silent: true },
          );
      if (response.status !== 200) {
        if (requestNoteShareExposureConfirmation(response, () => confirmMove(true))) return;
        void recordNoteTreeProductEvent('note_tree_move_rejected', {
          ...telemetryBase,
          durationMs: Date.now() - startedAt,
          result:
            response.status === 409 || String(response.data?.code || '').includes('CONFLICT') ? 'conflict' : 'rejected',
        });
        message.error(response.msg || t('note.moveFailed'));
        return;
      }
      message.success(
        isBatchMove.value
          ? t('note.moveBatchSuccess', { count: Number(response.data?.affectedCount || affectedIds.value.size) })
          : placement.value === 'before'
            ? t('note.moveBeforeSuccess', { title: selectedTitle.value })
            : placement.value === 'after'
              ? t('note.moveAfterSuccess', { title: selectedTitle.value })
              : t('note.moveSuccess'),
      );
      void recordNoteTreeProductEvent('note_tree_node_moved', {
        ...telemetryBase,
        durationMs: Date.now() - startedAt,
        result: 'success',
      });
      emit('moved', response.data);
      visible.value = false;
    } catch {
      void recordNoteTreeProductEvent('note_tree_move_rejected', {
        ...telemetryBase,
        durationMs: Date.now() - startedAt,
        result: 'failed',
      });
      message.error(t('note.moveFailed'));
    } finally {
      saving.value = false;
    }
  }

  watch(
    () => [visible.value, [...selectedIds.value].join(',')] as const,
    ([isVisible]) => {
      if (isVisible) void loadTree();
      else requestSeq += 1;
    },
    { immediate: true },
  );
</script>

<style lang="less" scoped>
  .note-move-shell {
    height: 100%;
    min-height: 0;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .note-move-summary,
  .note-move-target-meta {
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
  }

  .note-move-summary strong,
  .note-move-target-meta strong {
    min-width: 0;
    overflow: hidden;
    color: var(--text-color);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .note-move-placement {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 6px;

    > * {
      width: 100%;
      min-width: 0;
      border: 1px solid var(--surface-border-color);
    }

    > .is-selected {
      border-color: var(--resource-note-color, #00a884);
      color: var(--resource-note-color, #00a884);
      background: var(--resource-note-soft-bg, #e9f8f4);
      font-weight: 650;
    }
  }

  .note-move-outcome {
    min-height: 18px;
    margin: 0;
    color: var(--desc-color);
    font-size: 12px;
    line-height: 18px;

    span {
      margin-left: 4px;
      color: var(--resource-note-color, #00a884);
      font-weight: 600;
    }
  }

  .note-move-list {
    flex: 1;
    min-height: 180px;
    overflow-y: auto;
  }

  .note-move-row {
    width: 100%;
    min-height: 38px;
    margin-block: 2px;
    padding: 5px 8px 5px calc(10px + var(--note-move-depth, 0) * 14px);
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

  .note-move-title {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .note-move-count {
    margin-left: auto;
    font-size: 11px;
  }

  .note-move-disabled-label {
    margin-left: auto;
    color: var(--danger-color, #dc2626);
    font-size: 11px;
  }

  .note-move-check {
    margin-left: auto;
  }

  .note-move-error {
    margin: 0;
    color: var(--danger-color, #dc2626);
    font-size: 12px;
  }

  .note-move-footer {
    position: sticky;
    bottom: 0;
    z-index: 1;
    flex: 0 0 auto;
    display: flex;
    gap: 8px;
    padding: 10px 0 max(10px, env(safe-area-inset-bottom));
    border-top: 1px solid var(--surface-border-color);
    background: var(--menu-body-bg-color);

    > * {
      flex: 1;
    }
  }

  .note-move-desktop-footer {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
  }

  .note-move-shell.is-mobile .note-move-list {
    min-height: 0;
  }
</style>
