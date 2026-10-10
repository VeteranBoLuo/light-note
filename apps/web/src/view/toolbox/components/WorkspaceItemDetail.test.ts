import { webcrypto } from 'node:crypto';
import { createApp, h, nextTick, ref, watch, type App } from 'vue';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { BoardCommand } from '@lightnote/shared/workspace-board';
import type { ToolboxWorkspace } from '@/api/toolbox';
const mocks = vi.hoisted(() => ({
  saveNote: vi.fn(),
  alert: vi.fn(),
  push: vi.fn(),
  todos: vi.fn(),
  addResource: vi.fn(),
  routeLeave: vi.fn(),
}));
vi.mock('@/api/toolbox', () => ({ addToolboxWorkspaceResources: mocks.addResource }));
vi.mock('@/api/todoApi', () => ({ getTodoWorkspace: mocks.todos }));
vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (key: string) => key }) }));
vi.mock('vue-router', () => ({
  useRouter: () => ({ push: mocks.push }),
  useRoute: () => ({ fullPath: '/toolbox/research_workspace?workspace=w' }),
  onBeforeRouteLeave: mocks.routeLeave,
  onBeforeRouteUpdate: vi.fn(),
}));
vi.mock('@/composables/useSaveAsNote', () => ({ openSaveAsNote: mocks.saveNote }));
vi.mock('@/utils/aiNoteDraft', () => ({ createNoteFromContent: vi.fn() }));
vi.mock('@/utils/mobileOverlayHistory', () => ({
  closeCurrentMobileOverlayThen: async (close: () => void, next: () => unknown) => {
    close();
    return next();
  },
}));
vi.mock('@/components/base/BasicComponents/BModal/Alert', () => ({ default: { alert: mocks.alert } }));
vi.mock('@/components/base/BasicComponents/BDrawer.vue', () => ({
  default: {
    props: ['open'],
    emits: ['afterClose'],
    setup: (props: any, { slots, emit }: any) => {
      watch(
        () => props.open,
        async (open) => {
          if (!open) {
            await nextTick();
            emit('afterClose');
          }
        },
      );
      return () =>
        h('div', { 'data-drawer-open': String(props.open) }, [slots['header-leading']?.(), slots.default?.()]);
    },
  },
}));
vi.mock('@/components/base/BasicComponents/BInput.vue', () => ({
  default: {
    props: ['value', 'type', 'disabled'],
    emits: ['update:value'],
    setup:
      (props: any, { emit, attrs }: any) =>
      () =>
        h(props.type === 'textarea' ? 'textarea' : 'input', {
          ...attrs,
          value: props.value,
          disabled: props.disabled,
          onInput: (event: Event) => emit('update:value', (event.target as HTMLInputElement).value),
        }),
  },
}));
vi.mock('@/components/base/BasicComponents/BSelect.vue', () => ({
  default: {
    props: ['value', 'options', 'disabled'],
    emits: ['update:value'],
    setup:
      (props: any, { emit }: any) =>
      () =>
        h(
          'select',
          {
            value: props.value,
            disabled: props.disabled,
            onChange: (event: Event) => emit('update:value', (event.target as HTMLSelectElement).value),
          },
          props.options.map((option: any) => h('option', { value: option.value }, option.label)),
        ),
  },
}));
vi.mock('@/components/base/BasicComponents/BDateTimePicker.vue', () => ({
  default: { render: () => h('span', 'date-picker') },
}));
vi.mock('@/components/resourcePicker/ResourcePickerPanel.vue', () => ({
  default: {
    props: ['allowedTypes'],
    emits: ['select'],
    setup:
      (props: any, { emit }: any) =>
      () =>
        h(
          'button',
          { onClick: () => emit('select', { type: props.allowedTypes[0], id: 'selected', title: 'Selected source' }) },
          'choose-reference',
        ),
  },
}));
import Detail from './WorkspaceItemDetail.vue';
let app: App, host: HTMLElement;
const flush = async () => {
  for (let i = 0; i < 8; i++) {
    await new Promise((resolve) => setTimeout(resolve, 0));
    await nextTick();
  }
};
const workspace = () =>
  ({
    id: 'w',
    kind: 'research',
    boardVersion: 0,
    status: 'active',
    resources: [{ id: 1, type: 'note', resourceId: 'e', title: 'Evidence', version: 'v1', available: true }],
    items: [
      {
        id: 'i',
        lane: 'knowledge',
        title: 'Finding',
        content: 'Summary',
        status: 'done',
        position: 0,
        dueOn: null,
        createdAt: '2026-10-10',
        updatedAt: '2026-10-10',
        completedAt: null,
        details: { evidence: [], conclusionStatus: null, conclusionNote: null, todoTitle: '' },
      },
    ],
  }) as ToolboxWorkspace;
function mount(
  initial = workspace(),
  callback?: (command: BoardCommand, version?: number) => Promise<ToolboxWorkspace | undefined>,
  creation?: { key: string; title: string; command: BoardCommand },
) {
  const current = ref(initial),
    busy = ref(false);
  const commit = vi.fn(
    callback ||
      (async (command: BoardCommand) => {
        const updated = JSON.parse(JSON.stringify(current.value)) as ToolboxWorkspace;
        updated.boardVersion = (updated.boardVersion || 0) + 1;
        Object.assign(updated.items[0], {
          title: command.title,
          content: command.content,
          todoId: command.todoId,
          details: {
            evidence: command.details?.evidence || [],
            conclusionStatus: command.details?.conclusionStatus,
            conclusionNote: command.details?.conclusionNoteId
              ? { id: command.details.conclusionNoteId, title: 'Saved note', version: 'v1' }
              : null,
            todoTitle: '',
          },
        });
        current.value = updated;
        return updated;
      }),
  );
  const close = vi.fn();
  host = document.createElement('div');
  document.body.append(host);
  app = createApp({
    render: () =>
      h(Detail, {
        item: current.value.items[0],
        workspace: current.value,
        mobile: false,
        busy: busy.value,
        commit,
        creation,
        onClose: close,
      }),
  });
  app.component('svg-icon', { render: () => h('span') });
  app.mount(host);
  return { current, busy, commit, close };
}
const button = (key: string) =>
  [...host.querySelectorAll('button')].find((button) => button.textContent?.trim() === key)!;
function input(selector: string, value: string) {
  const element = host.querySelector(selector) as HTMLInputElement;
  element.value = value;
  element.dispatchEvent(new Event('input', { bubbles: true }));
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('crypto', webcrypto);
  mocks.todos.mockResolvedValue({
    status: 200,
    data: {
      items: [{ id: 'task', title: 'Concrete task', status: 'pending', dueAt: '2026-10-15 23:59:59' }],
      nextCursor: null,
    },
  });
});
afterEach(() => {
  app?.unmount();
  host?.remove();
  vi.unstubAllGlobals();
});

it('只提交引用身份与解释；不会把客户端标题或版本当作权威输入', async () => {
  const { commit } = mount();
  button('toolbox.itemDetail.addEvidence').click();
  await flush();
  [...host.querySelectorAll<HTMLButtonElement>('.reference-picker__row')][0].click();
  await flush();
  button('toolbox.itemDetail.confirmLink').click();
  await flush();
  input('textarea[aria-label="toolbox.itemDetail.explanation"]', 'Supports the finding');
  await flush();
  button('common.save').click();
  await flush();
  expect(commit).toHaveBeenCalledWith(
    expect.objectContaining({
      type: 'details',
      details: {
        evidence: [{ type: 'note', resourceId: 'e', explanation: 'Supports the finding' }],
        conclusionStatus: null,
        conclusionNoteId: null,
      },
    }),
    0,
  );
  expect(button('common.save').disabled).toBe(true);
});
it('失败保留草稿，外部版本更新不会悄悄覆盖或自动确认旧结论', async () => {
  const { current, commit } = mount(workspace(), async () => undefined);
  input('textarea', 'Draft survives');
  await flush();
  current.value = {
    ...current.value,
    boardVersion: 4,
    items: [{ ...current.value.items[0], content: 'Remote content' }],
  };
  await flush();
  expect((host.querySelector('textarea') as HTMLTextAreaElement).value).toBe('Draft survives');
  expect(host.textContent).toContain('toolbox.itemDetail.stale');
  button('common.save').click();
  await flush();
  expect(commit).toHaveBeenCalledWith(
    expect.objectContaining({
      content: 'Draft survives',
      details: expect.objectContaining({ conclusionStatus: null }),
    }),
    0,
  );
  expect(button('common.save').disabled).toBe(false);
});
it('笔记创建成功而关联失败时，重试只保存关联', async () => {
  mocks.saveNote.mockResolvedValue({ noteId: 'created-note', openAfterSave: false });
  let attempts = 0;
  const { commit } = mount(workspace(), async () => {
    attempts++;
    return attempts === 1 ? undefined : workspace();
  });
  button('toolbox.itemDetail.saveNote').click();
  await flush();
  expect(mocks.saveNote).toHaveBeenCalledTimes(1);
  expect(host.textContent).toContain('toolbox.itemDetail.noteLinkFailed');
  expect(commit).toHaveBeenLastCalledWith(
    expect.objectContaining({ details: expect.objectContaining({ conclusionNoteId: 'created-note' }) }),
    0,
  );
  button('common.save').click();
  await flush();
  expect(commit).toHaveBeenCalledTimes(2);
  expect(mocks.saveNote).toHaveBeenCalledTimes(1);
});
it('绑定待办后的摘要保存不发送项目日期；具体任务的完成状态独立展示', async () => {
  const initial = workspace();
  Object.assign(initial.items[0], {
    lane: 'action',
    todoId: 't',
    linkedTodo: {
      id: 't',
      title: 'Task',
      available: true,
      status: 'completed',
      dueOn: '2026-10-12',
      completedAt: '2026-10-10',
    },
  });
  const { commit } = mount(initial);
  expect(host.textContent).toContain('toolbox.itemDetail.completed');
  expect(host.textContent).not.toContain('date-picker');
  input('textarea', 'Action notes');
  await flush();
  button('common.save').click();
  await flush();
  expect(commit.mock.calls[0][0]).not.toHaveProperty('dueOn');
  expect(commit.mock.calls[0][0]).toMatchObject({ todoId: 't', details: { conclusionStatus: null } });
});
it('关闭有修改的详情需确认，取消不会丢草稿', async () => {
  const { close } = mount();
  input('textarea', 'Keep this draft');
  await flush();
  button('common.close').click();
  await flush();
  expect(mocks.alert).toHaveBeenCalledTimes(1);
  expect(close).not.toHaveBeenCalled();
  expect((host.querySelector('textarea') as HTMLTextAreaElement).value).toBe('Keep this draft');
  mocks.alert.mock.calls[0][0].onOk();
  expect(close).not.toHaveBeenCalled();
  await flush();
  expect(close).toHaveBeenCalledTimes(1);
});

it('creation stages references and a new todo without writing until save', async () => {
  const initial = workspace();
  initial.items[0].lane = 'action';
  const { commit } = mount(initial, undefined, {
    key: 'draft',
    title: 'Create',
    command: { type: 'create', lane: 'action' },
  });
  input('textarea', 'Unsaved action');
  button('toolbox.itemDetail.createTodo').click();
  await flush();
  button('toolbox.itemDetail.linkNote').click();
  await flush();
  button('choose-reference').click();
  await flush();
  button('toolbox.itemDetail.confirmLink').click();
  await flush();
  expect(commit).not.toHaveBeenCalled();
  expect((host.querySelector('textarea') as HTMLTextAreaElement).value).toBe('Unsaved action');
  button('toolbox.itemDetail.createItem').click();
  await flush();
  expect(commit).toHaveBeenCalledWith(
    expect.objectContaining({
      type: 'create',
      lane: 'action',
      content: 'Unsaved action',
      createLinkedTodo: true,
      todoId: null,
      details: expect.objectContaining({ conclusionNoteId: 'selected' }),
    }),
    0,
  );
});
it('todo selection requires confirmation, shows state and date, and supersedes staged creation', async () => {
  const initial = workspace();
  initial.items[0].lane = 'action';
  const { commit } = mount(initial, undefined, {
    key: 'draft',
    title: 'Create',
    command: { type: 'create', lane: 'action' },
  });
  button('toolbox.itemDetail.createTodo').click();
  await flush();
  button('toolbox.itemDetail.linkTodo').click();
  await flush();
  expect(mocks.todos).toHaveBeenCalledWith(expect.objectContaining({ status: 'pending', cursor: null }));
  expect(mocks.todos.mock.calls[0][0]).not.toHaveProperty('presentation');
  expect(host.textContent).toContain('2026-10-15');
  host.querySelector<HTMLButtonElement>('.reference-picker__row')!.click();
  await flush();
  expect(host.querySelector('.reference-picker')).not.toBeNull();
  button('toolbox.itemDetail.confirmLink').click();
  await flush();
  expect(host.querySelector('.reference-picker')).toBeNull();
  expect(host.textContent).toContain('Concrete task');
  expect(host.textContent).toContain('2026-10-15');
  expect(commit).not.toHaveBeenCalled();
  button('toolbox.itemDetail.createItem').click();
  await flush();
  expect(commit.mock.calls[0][0]).toMatchObject({ todoId: 'task', createLinkedTodo: false });
});
it('canceling a picker keeps the item draft and does not link the highlighted todo', async () => {
  const initial = workspace();
  initial.items[0].lane = 'action';
  const { commit } = mount(initial);
  input('textarea', 'Draft text');
  button('toolbox.itemDetail.linkTodo').click();
  await flush();
  host.querySelector<HTMLButtonElement>('.reference-picker__row')!.click();
  await flush();
  host.querySelector<HTMLButtonElement>('[aria-label="toolbox.itemDetail.backToItem"]')!.click();
  await flush();
  expect((host.querySelector('textarea') as HTMLTextAreaElement).value).toBe('Draft text');
  button('common.save').click();
  await flush();
  expect(commit.mock.calls[0][0].todoId).toBeNull();
});
it('saving a note during creation only creates the independent note, not an empty item', async () => {
  mocks.saveNote.mockResolvedValue({ noteId: 'saved-note', openAfterSave: false });
  const { commit } = mount(workspace(), undefined, {
    key: 'draft',
    title: 'Create',
    command: { type: 'create', lane: 'knowledge' },
  });
  button('toolbox.itemDetail.saveNote').click();
  await flush();
  expect(mocks.saveNote).toHaveBeenCalledTimes(1);
  expect(commit).not.toHaveBeenCalled();
  button('toolbox.itemDetail.createItem').click();
  await flush();
  expect(commit.mock.calls[0][0].details?.conclusionNoteId).toBe('saved-note');
});

it('todo pagination deduplicates rows and allows retry after a failed next page', async () => {
  let intersect!: () => void;
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      constructor(callback: (entries: { isIntersecting: boolean }[]) => void) {
        intersect = () => callback([{ isIntersecting: true }]);
      }
      observe() {}
      disconnect() {}
    },
  );
  mocks.todos.mockResolvedValueOnce({
    status: 200,
    data: { items: [{ id: 'one', title: 'First task', status: 'pending' }], nextCursor: 'next' },
  });
  const initial = workspace();
  initial.items[0].lane = 'action';
  mount(initial);
  button('toolbox.itemDetail.linkTodo').click();
  await flush();
  mocks.todos.mockRejectedValueOnce(new Error('offline'));
  intersect();
  await flush();
  expect(host.textContent).toContain('toolbox.itemDetail.pickerFailed');
  expect(host.querySelectorAll('.reference-picker__row')).toHaveLength(1);
  mocks.todos.mockResolvedValueOnce({
    status: 200,
    data: {
      items: [
        { id: 'one', title: 'First task', status: 'pending' },
        { id: 'two', title: 'Second task', status: 'pending' },
      ],
      nextCursor: null,
    },
  });
  button('toolbox.itemDetail.retryPicker').click();
  await flush();
  expect(mocks.todos.mock.calls.at(-1)?.[0]).toMatchObject({ cursor: 'next' });
  expect(host.querySelectorAll('.reference-picker__row')).toHaveLength(2);
  expect(host.textContent).not.toContain('toolbox.itemDetail.pickerFailed');
});
it('a slow earlier todo search cannot overwrite the latest search results', async () => {
  let resolveOld!: (value: unknown) => void;
  mocks.todos.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        resolveOld = resolve;
      }),
  );
  const initial = workspace();
  initial.items[0].lane = 'action';
  mount(initial);
  button('toolbox.itemDetail.linkTodo').click();
  await flush();
  mocks.todos.mockResolvedValueOnce({
    status: 200,
    data: { items: [{ id: 'new', title: 'New result', status: 'completed' }], nextCursor: null },
  });
  input('.reference-picker input', 'new');
  await new Promise((resolve) => setTimeout(resolve, 300));
  await flush();
  resolveOld({
    status: 200,
    data: { items: [{ id: 'old', title: 'Stale result', status: 'pending' }], nextCursor: null },
  });
  await flush();
  expect(host.textContent).toContain('New result');
  expect(host.textContent).not.toContain('Stale result');
  expect(mocks.todos.mock.calls.at(-1)?.[0]).toMatchObject({ keyword: 'new', cursor: null });
});

it('empty project can add a library resource, retry failure, and stage evidence until save', async () => {
  const initial = workspace();
  initial.resources = [];
  const { commit } = mount(initial);
  mocks.addResource.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({
    ...initial,
    resources: [{ id: 7, type: 'note', resourceId: 'selected', title: 'Selected source', available: true }],
  });
  button('toolbox.itemDetail.addEvidence').click();
  await flush();
  expect(host.textContent).toContain('toolbox.itemDetail.emptyProjectTitle');
  button('toolbox.itemDetail.addFromLibrary').click();
  await flush();
  button('choose-reference').click();
  await flush();
  button('toolbox.itemDetail.addAndLink').click();
  await flush();
  expect(host.textContent).toContain('toolbox.itemDetail.addResourceFailed');
  button('toolbox.itemDetail.addAndLink').click();
  await flush();
  expect(mocks.addResource).toHaveBeenLastCalledWith('w', [{ type: 'note', id: 'selected' }]);
  expect(host.textContent).toContain('Selected source');
  expect(commit).not.toHaveBeenCalled();
  button('common.save').click();
  await flush();
  expect(commit.mock.calls[0][0].details.evidence).toEqual([
    expect.objectContaining({ resourceId: 'selected', type: 'note' }),
  ]);
});

it('source metadata uses the current source title and falls back to a snapshot without guessing a lane', async () => {
  const initial = workspace();
  initial.items[0].sourceItemId = 'origin';
  initial.items[0].sourceTitle = 'Stored title';
  initial.items.push({ ...initial.items[0], id: 'origin', title: 'Renamed source', lane: 'inbox', sourceItemId: null });
  const { current } = mount(initial);
  expect(host.querySelector('.item-source')?.textContent).toContain('Renamed source');
  expect(host.querySelector('.item-source')?.textContent).toContain('toolbox.board.sourceTypes.research.inbox');
  current.value.items.splice(1, 1);
  await flush();
  expect(host.querySelector('.item-source')?.textContent).toContain('Stored title');
  expect(host.querySelector('.item-source')?.textContent).toContain('toolbox.board.sourceSnapshot');
});
it('switching resource scopes preserves independent selections and confirms only the active scope', async () => {
  const { commit } = mount();
  button('toolbox.itemDetail.addEvidence').click();
  await flush();
  host.querySelector<HTMLButtonElement>('.reference-picker__row')!.click();
  const scope = (key: string) =>
    [...host.querySelectorAll<HTMLElement>('[role="tab"]')].find((tab) => tab.textContent?.includes(key))!;
  scope('toolbox.itemDetail.libraryScope').click();
  await flush();
  button('choose-reference').click();
  await flush();
  scope('toolbox.itemDetail.projectScope').click();
  await flush();
  expect(host.querySelector('.reference-picker__selection')?.textContent).toContain('Evidence');
  button('toolbox.itemDetail.confirmLink').click();
  await flush();
  button('common.save').click();
  await flush();
  expect(commit.mock.calls[0][0].details.evidence[0].resourceId).toBe('e');
  expect(mocks.addResource).not.toHaveBeenCalled();
});

it.each(['research', 'learning', 'writing'] as const)(
  '同步 %s 项目的干净表单在忙碌期间收到的最新版本',
  async (kind) => {
    const initial = workspace();
    initial.kind = kind;
    const { current, busy, commit } = mount(initial);
    busy.value = true;
    await flush();
    current.value = {
      ...current.value,
      boardVersion: 4,
      items: [{ ...current.value.items[0], content: 'Latest content' }],
    };
    await flush();
    busy.value = false;
    await flush();
    expect((host.querySelector('textarea') as HTMLTextAreaElement).value).toBe('Latest content');
    input('textarea', 'Next edit');
    await flush();
    button('common.save').click();
    await flush();
    expect(commit).toHaveBeenCalledWith(expect.objectContaining({ content: 'Next edit' }), 4);
  },
);

it('打开资料只确认一次，导航取消或失败时恢复原抽屉和草稿', async () => {
  const initial = workspace();
  initial.items[0].details!.conclusionNote = { id: 'n', title: 'Note', version: 'v1', available: true };
  const { close } = mount(initial);
  input('textarea', 'Keep my edit');
  await flush();
  mocks.push.mockImplementation(async () => {
    expect(await mocks.routeLeave.mock.calls.at(-1)![0]()).toBe(true);
    return { type: 4 }; // Vue Router navigation aborted by another guard.
  });
  button('toolbox.itemDetail.openNote').click();
  await flush();
  expect(mocks.alert).toHaveBeenCalledTimes(1);
  mocks.alert.mock.calls[0][0].onOk();
  await flush();
  expect(mocks.alert).toHaveBeenCalledTimes(1);
  expect(close).not.toHaveBeenCalled();
  expect(host.querySelector('[data-drawer-open="true"]')).not.toBeNull();
  expect((host.querySelector('textarea') as HTMLTextAreaElement).value).toBe('Keep my edit');
  mocks.push.mockRejectedValueOnce(new Error('route unavailable'));
  button('toolbox.itemDetail.openNote').click();
  await flush();
  mocks.alert.mock.calls.at(-1)![0].onOk();
  await flush();
  expect(close).not.toHaveBeenCalled();
  expect(host.textContent).toContain('toolbox.itemDetail.openResourceFailed');
});

it('保存为笔记并打开时等待导航完成，成功后不会重新显示事项抽屉', async () => {
  mocks.saveNote.mockResolvedValue({ noteId: 'saved-note', openAfterSave: true });
  let complete!: () => void;
  mocks.push.mockImplementation(
    () =>
      new Promise<void>((resolve) => {
        complete = resolve;
      }),
  );
  const { close } = mount();
  button('toolbox.itemDetail.saveNote').click();
  await flush();
  expect(mocks.push).toHaveBeenCalledTimes(1);
  expect(host.querySelector('[data-drawer-open="false"]')).not.toBeNull();
  expect(close).not.toHaveBeenCalled();
  complete();
  await flush();
  expect(close).toHaveBeenCalledTimes(1);
  expect(host.querySelector('[data-drawer-open="false"]')).not.toBeNull();
});
