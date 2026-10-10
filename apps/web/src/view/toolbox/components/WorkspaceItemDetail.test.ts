import { webcrypto } from 'node:crypto';
import { createApp, h, nextTick, ref, type App } from 'vue';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { BoardCommand } from '@lightnote/shared/workspace-board';
import type { ToolboxWorkspace } from '@/api/toolbox';
const mocks = vi.hoisted(() => ({ saveNote: vi.fn(), alert: vi.fn(), push: vi.fn() }));
vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (key: string) => key }) }));
vi.mock('vue-router', () => ({
  useRouter: () => ({ push: mocks.push }),
  useRoute: () => ({ fullPath: '/toolbox/research_workspace?workspace=w' }),
  onBeforeRouteLeave: vi.fn(),
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
    setup:
      (_: unknown, { slots }: any) =>
      () =>
        h('div', slots.default?.()),
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
  button('Evidence').click();
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
  expect(close).toHaveBeenCalledTimes(1);
});
