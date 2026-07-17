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
  createFolderResolutionInteraction,
  resolveAgentInteractionAction,
} = await import('./interactionResolvers.js');

describe('agent interactionResolvers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createAgentInteraction.mockImplementation(async (input) => input);
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
