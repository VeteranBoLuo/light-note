import { createApp, defineComponent, ref } from 'vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NOTE_TREE_ROOT_KEY } from '@/store/noteWorkspace';
import type { NoteTreeItem } from '@/types/noteTree';
import type { NoteTreeDropTarget } from '@/utils/noteTreeDrop';
import { useNoteTreeDragDrop } from './useNoteTreeDragDrop';

const mocks = vi.hoisted(() => ({
  apiBasePost: vi.fn(),
  messageError: vi.fn(),
  messageSuccess: vi.fn(),
  requestShareConfirmation: vi.fn(),
}));

vi.mock('@/http/request', () => ({ apiBasePost: mocks.apiBasePost }));
vi.mock('@/components/base/BasicComponents/BMessage/BMessage', () => ({
  default: { error: mocks.messageError, success: mocks.messageSuccess },
}));
vi.mock('@/utils/noteShareExposure', () => ({
  requestNoteShareExposureConfirmation: mocks.requestShareConfirmation,
}));

const node = (id: string, parentId: string | null, sort: number): NoteTreeItem => ({
  id,
  parentId,
  title: id.toUpperCase(),
  type: 'html',
  childCount: 0,
  hasChildren: false,
  isTop: false,
  sort,
});

const afterTarget: NoteTreeDropTarget = {
  key: 'b',
  isTop: false,
  parentId: null,
  title: 'B',
  previousId: 'b',
  nextId: null,
  position: 'after',
};

function mountDragDrop(apiBasePostResult: unknown) {
  mocks.apiBasePost.mockResolvedValue(apiBasePostResult);
  const childrenByParent = ref<Record<string, NoteTreeItem[]>>({
    [NOTE_TREE_ROOT_KEY]: [node('a', null, 0), node('b', null, 1)],
  });
  const onMoveConfirmed = vi.fn();
  let dragDrop!: ReturnType<typeof useNoteTreeDragDrop>;
  const host = document.createElement('div');
  const app = createApp(
    defineComponent({
      setup() {
        dragDrop = useNoteTreeDragDrop({
          enabled: ref(true),
          childrenByParent,
          t: (key) => key,
          onMoveConfirmed,
        });
        return () => null;
      },
    }),
  );
  app.mount(host);
  return { app, childrenByParent, dragDrop, onMoveConfirmed };
}

describe('useNoteTreeDragDrop', () => {
  beforeEach(() => {
    mocks.apiBasePost.mockReset();
    mocks.messageError.mockReset();
    mocks.messageSuccess.mockReset();
    mocks.requestShareConfirmation.mockReset().mockReturnValue(false);
  });

  afterEach(() => {
    document.body.style.userSelect = '';
  });

  it('接口确认前乐观移动，成功后保留结果并通知页面刷新自己的读模型', async () => {
    const harness = mountDragDrop({ status: 200, data: {} });

    await expect(harness.dragDrop.moveNoteIntoTarget('a', false, afterTarget)).resolves.toBe(true);

    expect(harness.childrenByParent.value[NOTE_TREE_ROOT_KEY].map((item) => item.id)).toEqual(['b', 'a']);
    expect(mocks.apiBasePost).toHaveBeenCalledWith(
      '/api/note/moveNoteNode',
      { id: 'a', parentId: null, previousId: 'b', nextId: null },
      { silent: true },
    );
    expect(harness.onMoveConfirmed).toHaveBeenCalledWith({
      sourceId: 'a',
      sourceIsTop: false,
      target: afterTarget,
    });
    harness.app.unmount();
  });

  it('接口拒绝时完整回滚旧树且不调用成功刷新', async () => {
    const harness = mountDragDrop({ status: 400, msg: '移动失败' });

    await expect(harness.dragDrop.moveNoteIntoTarget('a', false, afterTarget)).resolves.toBe(false);

    expect(harness.childrenByParent.value[NOTE_TREE_ROOT_KEY].map((item) => item.id)).toEqual(['a', 'b']);
    expect(harness.onMoveConfirmed).not.toHaveBeenCalled();
    expect(mocks.messageError).toHaveBeenCalledWith('移动失败');
    harness.app.unmount();
  });

  it('拒绝把页面移入自身或自己的后代', () => {
    const harness = mountDragDrop({ status: 200, data: {} });
    harness.childrenByParent.value = {
      [NOTE_TREE_ROOT_KEY]: [node('a', null, 0)],
      a: [{ ...node('child', 'a', 0), hasChildren: true }],
    };
    harness.dragDrop.beginPointerDrag({ id: 'a', isTop: false });

    harness.dragDrop.scheduleDragDropTarget({
      key: 'child',
      isTop: false,
      parentId: 'child',
      title: 'CHILD',
      previousId: null,
      nextId: null,
      position: 'inside',
    });

    expect(harness.dragDrop.dragDropTarget.value).toBeNull();
    harness.app.unmount();
  });
});
