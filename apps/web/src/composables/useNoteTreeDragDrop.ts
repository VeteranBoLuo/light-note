import { computed, onBeforeUnmount, ref, type ComputedRef, type Ref } from 'vue';
import message from '@/components/base/BasicComponents/BMessage/BMessage';
import { apiBasePost } from '@/http/request';
import { NOTE_TREE_ROOT_KEY } from '@/store/noteWorkspace';
import type { NoteTreeItem } from '@/types/noteTree';
import {
  buildRootStartDropTarget,
  buildTreeNodeDropTarget,
  moveNoteTreeNodeOptimistically,
  normalizePinnedAfterDropTarget,
  type NoteTreeDropTarget,
} from '@/utils/noteTreeDrop';
import { resolveNoteTreeDragScrollStep } from '@/utils/noteTreeDragScroll';
import { requestNoteShareExposureConfirmation } from '@/utils/noteShareExposure';
import { getRootZoom } from '@/utils/zoom';
import type { NoteTreeMoveItemResult } from '@/api/noteTree';

type BoolRef = Readonly<Ref<boolean> | ComputedRef<boolean>>;
type TreeIndexRef = Ref<Record<string, NoteTreeItem[]>>;
type Translate = (key: string, params?: Record<string, unknown>) => string;

interface NoteTreeDragDropOptions {
  enabled: BoolRef;
  childrenByParent: TreeIndexRef;
  visibleChildrenByParent?: Readonly<Ref<Record<string, NoteTreeItem[]>>>;
  t: Translate;
  getScrollElement?: () => HTMLElement | null;
  getSourceParentId?: (sourceId: string) => string | null | undefined;
  canCommit?: () => boolean;
  onMoveConfirmed?: (context: {
    sourceId: string;
    sourceIsTop: boolean;
    target: NoteTreeDropTarget;
    result: NoteTreeMoveItemResult;
  }) => void | Promise<void>;
  logLabel?: string;
}

export interface NoteTreePointerDropSnapshot {
  target: NoteTreeDropTarget | null;
  sourceId: string;
  sourceIsTop: boolean;
}

function normalizedParentId(value: unknown) {
  const id = String(value ?? '').trim();
  return id && id !== NOTE_TREE_ROOT_KEY ? id : null;
}

/**
 * 笔记库与详情页共用的页面树拖拽状态机。
 * 页面只提供目录读模型、滚动容器和移动确认后的刷新策略，落点、校验、提交与回滚保持单一实现。
 */
export function useNoteTreeDragDrop(options: NoteTreeDragDropOptions) {
  const noteDragging = ref(false);
  const treeMovePending = ref(false);
  const dragDropTarget = ref<NoteTreeDropTarget | null>(null);
  const dragDropTargetActive = ref(false);
  const draggingNoteId = ref('');
  const draggingNoteIsTop = ref(false);
  let dragDropTimer: number | null = null;
  let treeDragImageElement: HTMLElement | null = null;
  let treeDragScrollFrame: number | null = null;
  let treeDragScrollPointer: { clientX: number; clientY: number } | null = null;
  let pointerTracking = false;

  function findLoadedTreeNode(noteId: string) {
    const indexes = [options.childrenByParent.value, options.visibleChildrenByParent?.value || {}];
    for (const index of indexes) {
      for (const nodes of Object.values(index)) {
        const match = nodes.find((node) => node.id === noteId);
        if (match) return match;
      }
    }
    return null;
  }

  function dragSourceParentId() {
    const sourceId = draggingNoteId.value;
    const externalParentId = options.getSourceParentId?.(sourceId);
    if (externalParentId !== undefined) return normalizedParentId(externalParentId);
    return normalizedParentId(findLoadedTreeNode(sourceId)?.parentId);
  }

  function clearDragDropTarget() {
    if (dragDropTimer !== null) window.clearTimeout(dragDropTimer);
    dragDropTimer = null;
    dragDropTarget.value = null;
    dragDropTargetActive.value = false;
  }

  const dragDropHint = computed(() => {
    const target = dragDropTarget.value;
    if (!target) return '';
    const pinning = !draggingNoteIsTop.value && target.isTop;
    const unpinning = draggingNoteIsTop.value && !target.isTop;
    if (target.position === 'before') {
      if (pinning) return options.t('note.dropBeforePageAndPin', { title: target.title });
      if (unpinning) return options.t('note.dropBeforePageAndUnpin', { title: target.title });
      return options.t('note.dropBeforePage', { title: target.title });
    }
    if (target.position === 'after') {
      if (pinning) return options.t('note.dropAfterPageAndPin', { title: target.title });
      if (unpinning) return options.t('note.dropAfterPageAndUnpin', { title: target.title });
      return options.t('note.dropAfterPage', { title: target.title });
    }
    if (target.position === 'root-start') {
      return unpinning ? options.t('note.dropAtRootStartAndUnpin') : options.t('note.dropAtRootStart');
    }
    if (unpinning) return options.t('note.dropIntoPageAndUnpin', { title: target.title });
    return options.t(dragDropTargetActive.value ? 'note.dropIntoReady' : 'note.dropIntoPage', {
      title: target.title,
    });
  });

  function isNoopSiblingPlacement(target: NoteTreeDropTarget, sourceParentId: string | null) {
    if (target.position !== 'before' && target.position !== 'after') return false;
    if (sourceParentId !== target.parentId) return false;
    const siblings = options.childrenByParent.value[target.parentId || NOTE_TREE_ROOT_KEY] || [];
    const group = siblings.filter((item) => Boolean(item.isTop) === target.isTop);
    const sourceIndex = group.findIndex((item) => item.id === draggingNoteId.value);
    const targetIndex = group.findIndex((item) => item.id === target.key);
    if (sourceIndex < 0 || targetIndex < 0) return false;
    return target.position === 'before' ? sourceIndex === targetIndex - 1 : sourceIndex === targetIndex + 1;
  }

  function isInvalidDropTarget(target: NoteTreeDropTarget) {
    const sourceId = draggingNoteId.value;
    if (!sourceId || target.parentId === sourceId || target.previousId === sourceId || target.nextId === sourceId) {
      return true;
    }
    const sourceParentId = dragSourceParentId();
    if (target.position === 'inside' && sourceParentId === target.parentId) return true;
    if (isNoopSiblingPlacement(target, sourceParentId)) return true;
    let cursor = target.parentId;
    const visited = new Set<string>();
    while (cursor && !visited.has(cursor)) {
      if (cursor === sourceId) return true;
      visited.add(cursor);
      cursor = findLoadedTreeNode(cursor)?.parentId || null;
    }
    return false;
  }

  function dropTargetIdentity(target: NoteTreeDropTarget | null) {
    if (!target) return '';
    return [
      target.position,
      target.key,
      target.isTop ? '1' : '0',
      target.parentId || '',
      target.previousId || '',
      target.nextId || '',
    ].join(':');
  }

  function scheduleDragDropTarget(target: NoteTreeDropTarget | null, immediate = false) {
    if (!target || isInvalidDropTarget(target)) {
      clearDragDropTarget();
      return;
    }
    if (dropTargetIdentity(dragDropTarget.value) === dropTargetIdentity(target)) return;
    clearDragDropTarget();
    dragDropTarget.value = target;
    if (immediate) {
      dragDropTargetActive.value = true;
      return;
    }
    dragDropTimer = window.setTimeout(() => {
      if (dropTargetIdentity(dragDropTarget.value) === dropTargetIdentity(target)) {
        dragDropTargetActive.value = true;
      }
      dragDropTimer = null;
    }, 160);
  }

  function resolveDropTargetAtPoint(clientX: number, clientY: number) {
    const element = document.elementFromPoint(clientX, clientY)?.closest<HTMLElement>('[data-note-drop-parent]');
    if (!element) return null;
    const key = String(element.dataset.noteDropParent || '').trim();
    if (!key) return null;
    const title = String(element.dataset.noteDropTitle || options.t('note.untitled'));
    if (key === NOTE_TREE_ROOT_KEY) {
      return buildRootStartDropTarget({
        rootItems: options.childrenByParent.value[NOTE_TREE_ROOT_KEY] || [],
        source: {
          id: draggingNoteId.value,
          isTop: draggingNoteIsTop.value,
          parentId: dragSourceParentId(),
        },
        title,
        rootKey: NOTE_TREE_ROOT_KEY,
      });
    }

    const treeNodeId = String(element.dataset.noteTreeNodeId || '').trim();
    if (treeNodeId) {
      const rect = element.getBoundingClientRect();
      const forcedPosition = element.dataset.noteTreeDropPosition;
      const rawTarget = buildTreeNodeDropTarget({
        node: {
          id: treeNodeId,
          parentId: normalizedParentId(element.dataset.noteTreeParentId),
          title,
          isTop: element.dataset.noteTreePinned === '1',
        },
        source: { id: draggingNoteId.value, isTop: draggingNoteIsTop.value },
        relativeY: forcedPosition === 'before' ? 0 : forcedPosition === 'after' ? 1 : clientY - rect.top,
        height: forcedPosition === 'before' || forcedPosition === 'after' ? 1 : rect.height,
      });
      if (!rawTarget) return null;
      const parentKey = rawTarget.parentId || NOTE_TREE_ROOT_KEY;
      const siblings =
        options.childrenByParent.value[parentKey] || options.visibleChildrenByParent?.value[parentKey] || [];
      return normalizePinnedAfterDropTarget({
        target: rawTarget,
        source: { id: draggingNoteId.value, isTop: draggingNoteIsTop.value },
        siblings,
      });
    }

    if (element.hasAttribute('data-note-sort-id')) {
      const rect = element.getBoundingClientRect();
      const relativeY = clientY - rect.top;
      if (relativeY < rect.height * 0.28 || relativeY > rect.height * 0.72) return null;
    }
    return {
      key,
      isTop: false,
      parentId: key,
      title,
      previousId: null,
      nextId: null,
      position: 'inside',
    } satisfies NoteTreeDropTarget;
  }

  function updatePointerDropTarget(event: Pick<PointerEvent, 'clientX' | 'clientY'>) {
    scheduleDragDropTarget(resolveDropTargetAtPoint(event.clientX, event.clientY));
  }

  function stopTreeDragAutoScroll() {
    treeDragScrollPointer = null;
    if (treeDragScrollFrame !== null) window.cancelAnimationFrame(treeDragScrollFrame);
    treeDragScrollFrame = null;
  }

  function runTreeDragAutoScroll() {
    treeDragScrollFrame = null;
    const pointer = treeDragScrollPointer;
    const container = options.getScrollElement?.();
    if (!pointer || !container) return stopTreeDragAutoScroll();
    const step = resolveNoteTreeDragScrollStep({
      ...pointer,
      rect: container.getBoundingClientRect(),
      rootZoom: getRootZoom(),
    });
    if (!step) return stopTreeDragAutoScroll();
    const previousTop = container.scrollTop;
    const maxTop = Math.max(0, container.scrollHeight - container.clientHeight);
    container.scrollTop = Math.min(maxTop, Math.max(0, previousTop + step));
    if (container.scrollTop === previousTop) return stopTreeDragAutoScroll();
    scheduleDragDropTarget(resolveDropTargetAtPoint(pointer.clientX, pointer.clientY), true);
    treeDragScrollFrame = window.requestAnimationFrame(runTreeDragAutoScroll);
  }

  function updateTreeDragAutoScroll(event: DragEvent) {
    const container = options.getScrollElement?.();
    if (!container) {
      stopTreeDragAutoScroll();
      return false;
    }
    const pointer = { clientX: event.clientX, clientY: event.clientY };
    const step = resolveNoteTreeDragScrollStep({
      ...pointer,
      rect: container.getBoundingClientRect(),
      rootZoom: getRootZoom(),
    });
    if (!step) {
      stopTreeDragAutoScroll();
      return false;
    }
    treeDragScrollPointer = pointer;
    if (treeDragScrollFrame === null) treeDragScrollFrame = window.requestAnimationFrame(runTreeDragAutoScroll);
    return true;
  }

  function cleanupNativeDrag() {
    stopTreeDragAutoScroll();
    window.removeEventListener('dragover', onTreeNativeDragOver, true);
    window.removeEventListener('drop', onTreeNativeDrop, true);
    treeDragImageElement?.remove();
    treeDragImageElement = null;
  }

  function stopPointerTracking() {
    if (!pointerTracking) return;
    window.removeEventListener('pointermove', updatePointerDropTarget, true);
    pointerTracking = false;
  }

  function resetDragState() {
    cleanupNativeDrag();
    stopPointerTracking();
    clearDragDropTarget();
    draggingNoteId.value = '';
    draggingNoteIsTop.value = false;
    noteDragging.value = false;
    document.body.style.userSelect = '';
  }

  function setCompactTreeDragImage(node: NoteTreeItem, event: DragEvent) {
    if (!event.dataTransfer) return;
    const preview = document.createElement('div');
    preview.className = 'note-tree-drag-image';
    preview.textContent = String(node.title || options.t('note.untitled')).trim();
    document.body.appendChild(preview);
    treeDragImageElement = preview;
    event.dataTransfer.setDragImage(preview, 18, 16);
    window.setTimeout(() => {
      if (treeDragImageElement !== preview) return;
      preview.remove();
      treeDragImageElement = null;
    }, 0);
  }

  function beginPointerDrag(source: { id: string; isTop: boolean }) {
    resetDragState();
    const sourceId = String(source.id || '').trim();
    if (!sourceId) return false;
    document.body.style.userSelect = 'none';
    noteDragging.value = true;
    draggingNoteId.value = sourceId;
    draggingNoteIsTop.value = Boolean(source.isTop);
    window.addEventListener('pointermove', updatePointerDropTarget, true);
    pointerTracking = true;
    return true;
  }

  function takePointerDropSnapshot(): NoteTreePointerDropSnapshot {
    const snapshot = {
      target: dragDropTarget.value,
      sourceId: draggingNoteId.value,
      sourceIsTop: draggingNoteIsTop.value,
    };
    stopPointerTracking();
    clearDragDropTarget();
    draggingNoteId.value = '';
    draggingNoteIsTop.value = false;
    document.body.style.userSelect = '';
    return snapshot;
  }

  function completePointerDrag() {
    noteDragging.value = false;
  }

  function onTreeDragStart(node: NoteTreeItem, event: DragEvent) {
    const sourceId = String(node.id || '').trim();
    if (!options.enabled.value || treeMovePending.value || !sourceId) {
      event.preventDefault();
      return;
    }
    resetDragState();
    document.body.style.userSelect = 'none';
    noteDragging.value = true;
    draggingNoteId.value = sourceId;
    draggingNoteIsTop.value = Boolean(node.isTop);
    event.dataTransfer?.setData('text/plain', sourceId);
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
      setCompactTreeDragImage(node, event);
    }
    window.addEventListener('dragover', onTreeNativeDragOver, true);
    window.addEventListener('drop', onTreeNativeDrop, true);
  }

  function onTreeNativeDragOver(event: DragEvent) {
    if (!draggingNoteId.value) return;
    const autoScrolling = updateTreeDragAutoScroll(event);
    const target = resolveDropTargetAtPoint(event.clientX, event.clientY);
    if (!target || isInvalidDropTarget(target)) {
      clearDragDropTarget();
      if (autoScrolling) event.preventDefault();
      return;
    }
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
    scheduleDragDropTarget(target, true);
  }

  async function moveNoteIntoTarget(
    sourceId: string,
    sourceIsTop: boolean,
    target: NoteTreeDropTarget,
    shareExposureAcknowledged = false,
  ) {
    if (treeMovePending.value) return false;
    treeMovePending.value = true;
    const previousTree = options.childrenByParent.value;
    const optimisticMove = moveNoteTreeNodeOptimistically(previousTree, sourceId, target, NOTE_TREE_ROOT_KEY);
    if (optimisticMove.applied) options.childrenByParent.value = optimisticMove.childrenByParent;
    try {
      let response;
      try {
        response = await apiBasePost(
          '/api/note/moveNoteNode',
          {
            id: sourceId,
            parentId: target.parentId,
            previousId: target.previousId,
            nextId: target.nextId,
            ...(shareExposureAcknowledged ? { shareExposureAcknowledged: true } : {}),
          },
          { silent: true },
        );
      } catch (error) {
        if (optimisticMove.applied) options.childrenByParent.value = previousTree;
        throw error;
      }
      if (response.status !== 200) {
        if (optimisticMove.applied) options.childrenByParent.value = previousTree;
        const retryMove = async () => {
          await moveNoteIntoTarget(sourceId, sourceIsTop, target, true);
        };
        if (requestNoteShareExposureConfirmation(response, retryMove)) return false;
        message.error(response.msg || options.t('note.moveFailed'));
        return false;
      }

      const successMessage =
        target.position === 'before'
          ? target.isTop !== sourceIsTop
            ? options.t(target.isTop ? 'note.moveBeforeAndPinSuccess' : 'note.moveBeforeAndUnpinSuccess', {
                title: target.title,
              })
            : options.t('note.moveBeforeSuccess', { title: target.title })
          : target.position === 'after'
            ? target.isTop !== sourceIsTop
              ? options.t(target.isTop ? 'note.moveAfterAndPinSuccess' : 'note.moveAfterAndUnpinSuccess', {
                  title: target.title,
                })
              : options.t('note.moveAfterSuccess', { title: target.title })
            : target.position === 'root-start'
              ? sourceIsTop && !target.isTop
                ? options.t('note.moveRootStartAndUnpinSuccess')
                : options.t('note.moveRootStartSuccess')
              : sourceIsTop
                ? options.t('note.moveIntoAndUnpinSuccess', { title: target.title })
                : options.t('note.moveIntoSuccess', { title: target.title });
      message.success(successMessage);
      try {
        await options.onMoveConfirmed?.({
          sourceId,
          sourceIsTop,
          target,
          result: response.data as NoteTreeMoveItemResult,
        });
      } catch (error) {
        console.error(`[${options.logLabel || 'note-tree'}] refresh after tree move failed`, error);
      }
      return true;
    } finally {
      treeMovePending.value = false;
    }
  }

  async function onTreeNativeDrop(event: DragEvent) {
    if (!draggingNoteId.value) return;
    const target = resolveDropTargetAtPoint(event.clientX, event.clientY);
    if (!target || isInvalidDropTarget(target)) return;
    event.preventDefault();
    const sourceId = draggingNoteId.value;
    const sourceIsTop = draggingNoteIsTop.value;
    resetDragState();
    if (options.canCommit && !options.canCommit()) return;
    try {
      await moveNoteIntoTarget(sourceId, sourceIsTop, target);
    } catch (error) {
      console.error(`[${options.logLabel || 'note-tree'}] tree drag move failed`, error);
      message.error(options.t('note.moveFailed'));
    }
  }

  function onTreeDragEnd() {
    resetDragState();
  }

  onBeforeUnmount(resetDragState);

  return {
    beginPointerDrag,
    completePointerDrag,
    dragDropHint,
    dragDropTarget,
    dragDropTargetActive,
    moveNoteIntoTarget,
    noteDragging,
    onTreeDragEnd,
    onTreeDragStart,
    resolveDropTargetAtPoint,
    scheduleDragDropTarget,
    takePointerDropSnapshot,
    treeMovePending,
    updatePointerDropTarget,
  };
}
