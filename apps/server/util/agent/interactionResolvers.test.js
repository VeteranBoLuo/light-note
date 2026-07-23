import { beforeEach, describe, expect, it, vi } from 'vitest';

const createAgentInteraction = vi.fn();
vi.mock('./interactionStore.js', () => {
  class AgentInteractionError extends Error {
    constructor(code, message, status = 400) {
      super(message);
      this.code = code;
      this.status = status;
    }
  }
  return { createAgentInteraction, AgentInteractionError };
});

const {
  canResolveFolderInteraction,
  canResolveBookmarkUrlInteraction,
  canResolveTodoStatusInteraction,
  createBookmarkUrlResolutionInteraction,
  createFolderResolutionInteraction,
  createTodoStatusResolutionInteraction,
  resolveAgentInteractionAction,
} = await import('./interactionResolvers.js');

describe('agent interactionResolvers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createAgentInteraction.mockImplementation(async (input) => input);
  });

  it('把书签分享文案候选转换成通用单选交互', async () => {
    const error = {
      code: 'CANDIDATE_CONFIRMATION_REQUIRED',
      normalizedToolArgs: { url: 'example.com 或 openai.com', name: '资料' },
      data: {
        urlResolution: {
          candidates: [
            { url: 'https://example.com', source: 'domain' },
            { url: 'https://openai.com', source: 'domain' },
          ],
        },
      },
    };
    expect(canResolveBookmarkUrlInteraction(error, 'create_bookmark')).toBe(true);
    expect(canResolveBookmarkUrlInteraction(error, 'create_note')).toBe(false);

    const result = await createBookmarkUrlResolutionInteraction({
      error,
      toolName: 'create_bookmark',
      ownerKey: 'user:user-1',
      sessionId: 'session-1',
      context: { resourceUserId: 'user-1', resourceUserRole: 'user' },
    });
    expect(result.spec).toMatchObject({
      code: 'bookmark_url_candidate_selection',
      type: 'single_choice',
      minSelections: 1,
      maxSelections: 1,
    });
    expect(result.spec.options.map((option) => option.id)).toEqual(['candidate_1', 'candidate_2']);
    expect(result.action.candidates).toEqual([
      { id: 'candidate_1', url: 'https://example.com' },
      { id: 'candidate_2', url: 'https://openai.com' },
    ]);
  });

  it('书签候选选择只使用服务端保存的白名单 URL', () => {
    const interaction = {
      action: {
        resolver: 'create_bookmark_url_resolution',
        toolName: 'create_bookmark',
        args: { url: '原始文案', name: '资料' },
        candidates: [{ id: 'candidate_1', url: 'https://example.com' }],
      },
    };
    expect(resolveAgentInteractionAction(interaction, { cancelled: false, selectedIds: ['candidate_1'] })).toEqual({
      state: 'confirmation_required',
      toolName: 'create_bookmark',
      args: { url: 'https://example.com', name: '资料' },
    });
    expect(() =>
      resolveAgentInteractionAction(interaction, {
        cancelled: false,
        selectedIds: ['https://attacker.example'],
      }),
    ).toThrow('请选择一个可用的网址');
  });

  it('多个待办匹配会先转换为单选卡，选择本身不直接写入', async () => {
    const error = {
      code: 'TODO_SELECTION_REQUIRED',
      normalizedToolArgs: { keyword: '周报', status: 'completed' },
      data: {
        candidates: [
          { todoId: 'todo-1', title: '周报', status: 'pending', dueAt: '2026-07-24 10:00:00' },
          { todoId: 'todo-2', title: '周报', status: 'completed', dueAt: null },
        ],
      },
    };
    expect(canResolveTodoStatusInteraction(error, 'set_todo_status')).toBe(true);
    expect(canResolveTodoStatusInteraction(error, 'create_note')).toBe(false);

    const result = await createTodoStatusResolutionInteraction({
      error,
      toolName: 'set_todo_status',
      ownerKey: 'user:user-1',
      sessionId: 'session-1',
      context: { resourceUserId: 'user-1', resourceUserRole: 'user' },
    });
    expect(result.spec).toMatchObject({
      code: 'todo_status_target_selection',
      type: 'single_choice',
      purpose: 'choice_confirmation',
      minSelections: 1,
      maxSelections: 1,
    });
    expect(result.spec.options.map((option) => option.id)).toEqual(['todo_1', 'todo_2']);
    expect(result.action).toEqual({
      resolver: 'set_todo_status_target_selection',
      toolName: 'set_todo_status',
      args: { status: 'completed' },
      candidates: [
        { id: 'todo_1', todoId: 'todo-1' },
        { id: 'todo_2', todoId: 'todo-2' },
      ],
    });
  });

  it('待办选择只信任服务端缓存的 todoId，随后仍需标准确认', () => {
    const interaction = {
      action: {
        resolver: 'set_todo_status_target_selection',
        toolName: 'set_todo_status',
        args: { status: 'pending' },
        candidates: [{ id: 'todo_1', todoId: 'todo-1' }],
      },
    };
    expect(resolveAgentInteractionAction(interaction, { cancelled: false, selectedIds: ['todo_1'] })).toEqual({
      state: 'confirmation_required',
      toolName: 'set_todo_status',
      args: { todoId: 'todo-1', status: 'pending' },
    });
    expect(() =>
      resolveAgentInteractionAction(interaction, { cancelled: false, selectedIds: ['todo-attacker'] }),
    ).toThrow('请选择一个可用的待办');
  });

  it('只处理保存附件工具的文件夹缺失/重名错误', () => {
    expect(
      canResolveFolderInteraction(
        { code: 'FOLDER_NOT_FOUND', normalizedToolArgs: { folderName: '项目资料' } },
        'save_attachment_to_cloud',
      ),
    ).toBe(true);
    expect(
      canResolveFolderInteraction(
        { code: 'FOLDER_NOT_FOUND', normalizedToolArgs: { folderName: '项目资料' } },
        'create_note',
      ),
    ).toBe(false);
    expect(
      canResolveFolderInteraction(
        { code: 'FILE_NAME_INVALID', normalizedToolArgs: { folderName: '项目资料' } },
        'save_attachment_to_cloud',
      ),
    ).toBe(false);
  });

  it('文件夹不存在时给出新建、根目录和重选三个稳定选项', async () => {
    const result = await createFolderResolutionInteraction({
      error: {
        code: 'FOLDER_NOT_FOUND',
        normalizedToolArgs: {
          attachmentId: 'attachment-1',
          fileName: '测试.png',
          folderName: '项目资料',
          folderStrategy: 'existing',
        },
      },
      toolName: 'save_attachment_to_cloud',
      ownerKey: 'user:user-1',
      sessionId: 'session-1',
      context: { resourceUserId: 'user-1', resourceUserRole: 'user' },
    });

    expect(result.spec).toMatchObject({
      type: 'single_choice',
      purpose: 'choice_confirmation',
      minSelections: 1,
      maxSelections: 1,
    });
    expect(result.spec.options.map((option) => option.id)).toEqual([
      'create_and_save',
      'save_to_root',
      'choose_other_folder',
    ]);
    expect(result.action).toMatchObject({
      resolver: 'save_attachment_folder_resolution',
      toolName: 'save_attachment_to_cloud',
      folderName: '项目资料',
    });
  });

  it('重名时不提供创建同名文件夹，只允许根目录或重新选择', async () => {
    const result = await createFolderResolutionInteraction({
      error: {
        code: 'FOLDER_AMBIGUOUS',
        normalizedToolArgs: { attachmentId: 'attachment-1', folderName: '资料' },
      },
      toolName: 'save_attachment_to_cloud',
      ownerKey: 'user:user-1',
      sessionId: 'session-1',
      context: { resourceUserId: 'user-1', resourceUserRole: 'user' },
    });
    expect(result.spec.options.map((option) => option.id)).toEqual(['save_to_root', 'choose_other_folder']);
  });

  it.each([
    [
      'create_and_save',
      {
        state: 'confirmation_required',
        args: { folderId: '', folderName: '项目资料', folderStrategy: 'create_if_missing' },
      },
    ],
    [
      'save_to_root',
      {
        state: 'confirmation_required',
        args: { folderId: '', folderName: '', folderStrategy: 'root' },
      },
    ],
    [
      'choose_other_folder',
      {
        state: 'edit_required',
        args: { folderId: '', folderName: '', folderStrategy: 'existing' },
      },
    ],
  ])('把选项 %s 解析成服务端白名单参数', (choice, expected) => {
    const interaction = {
      action: {
        resolver: 'save_attachment_folder_resolution',
        toolName: 'save_attachment_to_cloud',
        folderName: '项目资料',
        args: { attachmentId: 'attachment-1', fileName: '测试.png', folderName: '项目资料' },
      },
    };
    expect(
      resolveAgentInteractionAction(interaction, {
        cancelled: false,
        selectedIds: [choice],
        customValue: '',
      }),
    ).toMatchObject(expected);
  });

  it('取消不会生成后续动作，伪造 resolver 或选项会被拒绝', () => {
    expect(resolveAgentInteractionAction({}, { cancelled: true, selectedIds: [] })).toEqual({ state: 'cancelled' });
    expect(() =>
      resolveAgentInteractionAction(
        { action: { resolver: 'unknown', toolName: 'save_attachment_to_cloud' } },
        { cancelled: false, selectedIds: ['save_to_root'] },
      ),
    ).toThrow(/无法继续/);
  });
});
