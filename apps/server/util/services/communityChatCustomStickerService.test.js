import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  poolQuery: vi.fn(),
  getConnection: vi.fn(),
  assertMessagingAccess: vi.fn(),
  assertReadAccess: vi.fn(),
  assertPostingAllowed: vi.fn(),
  validateImage: vi.fn(),
  putObject: vi.fn(),
  copyObject: vi.fn(),
  deleteObject: vi.fn(),
  createSignedUrl: vi.fn(),
}));

vi.mock('../../db/index.js', () => ({
  default: { query: mocks.poolQuery, getConnection: mocks.getConnection },
}));
vi.mock('./communityChatAccessService.js', () => {
  class CommunityChatError extends Error {
    constructor(code, status, zhMessage, enMessage) {
      super(zhMessage);
      this.code = code;
      this.status = status;
      this.zhMessage = zhMessage;
      this.enMessage = enMessage;
    }
  }
  return {
    CommunityChatError,
    assertCommunityChatMessagingAccess: mocks.assertMessagingAccess,
    assertCommunityChatReadAccess: mocks.assertReadAccess,
  };
});
vi.mock('./communityChatModerationService.js', () => ({
  assertCommunityChatPostingAllowed: mocks.assertPostingAllowed,
}));
vi.mock('./communityChatImageService.js', () => ({
  validateCommunityChatImage: mocks.validateImage,
}));
vi.mock('../obsClient.js', () => ({
  putObjectToObs: mocks.putObject,
  copyObjectInObs: mocks.copyObject,
  deleteObjectFromObs: mocks.deleteObject,
  createDownloadSignedUrl: mocks.createSignedUrl,
}));

const {
  cleanupCommunityChatCustomStickers,
  getCommunityChatCustomStickerDownload,
  listCommunityChatCustomStickers,
  removeCommunityChatCustomSticker,
  saveCommunityChatMessageSticker,
  uploadCommunityChatCustomSticker,
} = await import('./communityChatCustomStickerService.js');

const user = { id: 'user-1', role: 'user' };

function connectionWithQuery(query) {
  return {
    query,
    beginTransaction: vi.fn(async () => {}),
    commit: vi.fn(async () => {}),
    rollback: vi.fn(async () => {}),
    release: vi.fn(),
  };
}

describe('communityChatCustomStickerService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.assertMessagingAccess.mockResolvedValue({ memberRole: 'member' });
    mocks.assertReadAccess.mockResolvedValue({ memberRole: 'member' });
    mocks.assertPostingAllowed.mockResolvedValue(undefined);
    mocks.validateImage.mockResolvedValue({
      contentType: 'image/png',
      extension: 'png',
      fileSize: 1024,
      width: 320,
      height: 240,
      contentSha256: 'a'.repeat(64),
    });
    mocks.putObject.mockResolvedValue({});
    mocks.copyObject.mockResolvedValue({});
    mocks.deleteObject.mockResolvedValue({});
    mocks.poolQuery.mockResolvedValue([{ affectedRows: 1 }, []]);
  });

  it('个人表情列表返回前端预处理需要的完整限制', async () => {
    mocks.poolQuery.mockResolvedValueOnce([[], []]);

    const result = await listCommunityChatCustomStickers({ user });

    expect(result).toEqual({
      items: [],
      maxCount: 40,
      maxBytes: 2 * 1024 * 1024,
      maxEdge: 4096,
      maxPixels: 8_000_000,
    });
    expect(mocks.poolQuery.mock.calls[0][0]).toContain('ORDER BY sort_order DESC, id DESC');
  });

  it('服务端仍拒绝文件体积合格但总像素超限的表情', async () => {
    mocks.validateImage.mockResolvedValueOnce({
      contentType: 'image/jpeg',
      extension: 'jpg',
      fileSize: 1_800_000,
      width: 3072,
      height: 4096,
      contentSha256: 'b'.repeat(64),
    });

    await expect(
      uploadCommunityChatCustomSticker({
        user,
        file: { path: '/tmp/high-resolution-small-file.jpg', size: 1_800_000 },
      }),
    ).rejects.toMatchObject({
      code: 'CUSTOM_STICKER_DIMENSIONS_INVALID',
      status: 400,
      message: '这张图片的画面尺寸太大，请换一张图片，或先裁剪、缩小后重试',
    });
    expect(mocks.getConnection).not.toHaveBeenCalled();
  });

  it('上传图片时先写权威记录再上传对象，成功后激活账号私有表情', async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce([[], []])
      .mockResolvedValueOnce([[{ activeCount: 0, maxSortOrder: 20 }], []])
      .mockResolvedValueOnce([{ insertId: 9 }, []]);
    const connection = connectionWithQuery(query);
    mocks.getConnection.mockResolvedValue(connection);

    const result = await uploadCommunityChatCustomSticker({
      user,
      file: { path: '/tmp/light-note-sticker-test-missing.png', size: 1024 },
      name: '开心',
    });

    expect(result).toMatchObject({
      duplicate: false,
      sticker: {
        name: '开心',
        contentType: 'image/png',
        fileSize: 1024,
        width: 320,
        height: 240,
      },
    });
    expect(result.sticker.publicId).toMatch(/^[0-9a-f-]{36}$/i);
    expect(connection.commit).toHaveBeenCalledTimes(1);
    expect(mocks.putObject).toHaveBeenCalledWith(
      expect.stringMatching(/^community-chat-stickers\/[a-f0-9]{24}\/[0-9a-f-]{36}\.png$/i),
      '/tmp/light-note-sticker-test-missing.png',
      'image/png',
    );
    expect(mocks.poolQuery.mock.calls[0][0]).toContain("SET status = 'active'");
  });

  it('个人表情达到 40 个后拒绝继续添加', async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce([[], []])
      .mockResolvedValueOnce([[{ activeCount: 40, maxSortOrder: 400 }], []]);
    const connection = connectionWithQuery(query);
    mocks.getConnection.mockResolvedValue(connection);

    await expect(
      uploadCommunityChatCustomSticker({
        user,
        file: { path: '/tmp/light-note-sticker-test-limit.png', size: 1024 },
      }),
    ).rejects.toMatchObject({
      code: 'CUSTOM_STICKER_LIMIT_REACHED',
      status: 409,
      message: '个人表情最多保存 40 个',
    });
    expect(mocks.putObject).not.toHaveBeenCalled();
  });

  it('相同账号上传相同图片时直接复用已激活记录，不重复写对象存储', async () => {
    const existing = {
      publicId: 'd9fa2cc6-d314-4709-a37f-05937916842b',
      objectKey: 'community-chat-stickers/owner/existing.png',
      name: '已有表情',
      contentType: 'image/png',
      fileSize: 1024,
      width: 320,
      height: 240,
      status: 'active',
      createdAt: '2026-08-13T10:00:00.000Z',
    };
    const query = vi.fn().mockResolvedValueOnce([[existing], []]);
    const connection = connectionWithQuery(query);
    mocks.getConnection.mockResolvedValue(connection);

    const result = await uploadCommunityChatCustomSticker({
      user,
      file: { path: '/tmp/light-note-sticker-test-duplicate.png', size: 1024 },
    });

    expect(result).toMatchObject({ duplicate: true, sticker: { publicId: existing.publicId } });
    expect(mocks.putObject).not.toHaveBeenCalled();
    expect(connection.commit).toHaveBeenCalledTimes(1);
  });

  it('收藏他人的自定义表情时由服务端复制对象并写入当前账号表情库', async () => {
    const messagePublicId = '2deff89a-0ee2-4bc2-9751-3ef25ff66ab1';
    const source = {
      objectKey: 'community-chat-stickers/source-user/original.png',
      contentSha256: 'c'.repeat(64),
      contentType: 'image/png',
      fileSize: 2048,
      width: 360,
      height: 300,
      name: '收到啦',
    };
    mocks.poolQuery.mockResolvedValueOnce([[source], []]);
    const query = vi
      .fn()
      .mockResolvedValueOnce([[], []])
      .mockResolvedValueOnce([[{ activeCount: 2, maxSortOrder: 30 }], []])
      .mockResolvedValueOnce([{ affectedRows: 1 }, []]);
    const connection = connectionWithQuery(query);
    mocks.getConnection.mockResolvedValue(connection);

    const result = await saveCommunityChatMessageSticker({ user, messagePublicId });

    expect(result).toMatchObject({
      duplicate: false,
      restored: false,
      sticker: { name: '收到啦', contentType: 'image/png', fileSize: 2048, width: 360, height: 300 },
    });
    expect(result.sticker.publicId).toMatch(/^[0-9a-f-]{36}$/i);
    expect(mocks.copyObject).toHaveBeenCalledWith(
      source.objectKey,
      expect.stringMatching(/^community-chat-stickers\/[a-f0-9]{24}\/[0-9a-f-]{36}\.png$/i),
    );
    expect(mocks.copyObject.mock.calls[0][1]).not.toBe(source.objectKey);
    expect(mocks.poolQuery.mock.calls[0][0]).toContain('message.user_id <> ?');
    expect(mocks.poolQuery.mock.calls[1][0]).toContain("SET status = 'active'");
  });

  it('重复收藏同一内容时复用账号内已有表情，不重复复制对象', async () => {
    const source = {
      objectKey: 'community-chat-stickers/source-user/original.webp',
      contentSha256: 'd'.repeat(64),
      contentType: 'image/webp',
      fileSize: 1024,
      width: 240,
      height: 240,
      name: '',
    };
    const existing = {
      publicId: 'd9fa2cc6-d314-4709-a37f-05937916842b',
      objectKey: 'community-chat-stickers/current-user/existing.webp',
      name: '',
      contentType: 'image/webp',
      fileSize: 1024,
      width: 240,
      height: 240,
      status: 'active',
      createdAt: '2026-08-13T10:00:00.000Z',
    };
    mocks.poolQuery.mockResolvedValueOnce([[source], []]);
    const connection = connectionWithQuery(vi.fn().mockResolvedValueOnce([[existing], []]));
    mocks.getConnection.mockResolvedValue(connection);

    const result = await saveCommunityChatMessageSticker({
      user,
      messagePublicId: '2deff89a-0ee2-4bc2-9751-3ef25ff66ab1',
    });

    expect(result).toMatchObject({ duplicate: true, restored: false, sticker: { publicId: existing.publicId } });
    expect(mocks.copyObject).not.toHaveBeenCalled();
    expect(connection.commit).toHaveBeenCalledTimes(1);
  });

  it('不可见、已删除或非他人自定义表情消息不能收藏', async () => {
    mocks.poolQuery.mockResolvedValueOnce([[], []]);

    await expect(
      saveCommunityChatMessageSticker({
        user,
        messagePublicId: '2deff89a-0ee2-4bc2-9751-3ef25ff66ab1',
      }),
    ).rejects.toMatchObject({ code: 'CUSTOM_STICKER_MESSAGE_NOT_FOUND', status: 404 });
    expect(mocks.getConnection).not.toHaveBeenCalled();
    expect(mocks.copyObject).not.toHaveBeenCalled();
  });

  it('重新加入已移除表情时更新为最近顺序，刷新后仍排在最前', async () => {
    const existing = {
      publicId: 'd9fa2cc6-d314-4709-a37f-05937916842b',
      objectKey: 'community-chat-stickers/owner/removed.png',
      name: '旧表情',
      contentType: 'image/png',
      fileSize: 1024,
      width: 320,
      height: 240,
      status: 'removed',
      sortOrder: 10,
      createdAt: '2026-08-13T10:00:00.000Z',
    };
    const query = vi
      .fn()
      .mockResolvedValueOnce([[existing], []])
      .mockResolvedValueOnce([[{ activeCount: 3, maxSortOrder: 40 }], []])
      .mockResolvedValueOnce([{ affectedRows: 1 }, []]);
    const connection = connectionWithQuery(query);
    mocks.getConnection.mockResolvedValue(connection);

    const result = await uploadCommunityChatCustomSticker({
      user,
      file: { path: '/tmp/light-note-sticker-test-restore.png', size: 1024 },
      name: '重新添加',
    });

    expect(result).toMatchObject({ duplicate: true, sticker: { publicId: existing.publicId, name: '重新添加' } });
    expect(query.mock.calls[2][0]).toContain("SET status = 'active', name = ?, sort_order = ?");
    expect(query.mock.calls[2][1]).toEqual(['重新添加', 50, existing.publicId, user.id]);
    expect(mocks.putObject).not.toHaveBeenCalled();
  });

  it('从个人表情库移除时若已有聊天消息引用，只隐藏库入口并保留对象', async () => {
    const publicId = 'd9fa2cc6-d314-4709-a37f-05937916842b';
    const query = vi
      .fn()
      .mockResolvedValueOnce([[{ objectKey: 'stickers/referenced.png', status: 'active' }], []])
      .mockResolvedValueOnce([[{ one: 1 }], []])
      .mockResolvedValueOnce([{ affectedRows: 1 }, []]);
    const connection = connectionWithQuery(query);
    mocks.getConnection.mockResolvedValue(connection);

    const result = await removeCommunityChatCustomSticker({ user, stickerPublicId: publicId });

    expect(result).toEqual({ publicId, removed: true, retainedForMessages: true });
    expect(query.mock.calls[2][1]).toEqual(['removed', publicId, user.id]);
    expect(mocks.deleteObject).not.toHaveBeenCalled();
  });

  it('清理任务只认领无历史引用或待重试记录，对象删除后再删权威行', async () => {
    mocks.poolQuery
      .mockResolvedValueOnce([
        [{ publicId: 'd9fa2cc6-d314-4709-a37f-05937916842b', objectKey: 'stickers/cleanup.png' }],
        [],
      ])
      .mockResolvedValueOnce([{ affectedRows: 1 }, []])
      .mockResolvedValueOnce([{ affectedRows: 1 }, []]);

    const result = await cleanupCommunityChatCustomStickers();

    expect(result).toEqual({ scanned: 1, removed: 1 });
    expect(mocks.deleteObject).toHaveBeenCalledWith('stickers/cleanup.png');
    expect(mocks.poolQuery.mock.calls[2][0]).toContain('DELETE FROM community_chat_custom_stickers');
  });

  it('自定义表情内容只返回短时签名地址，不向客户端暴露对象键', async () => {
    mocks.poolQuery.mockResolvedValueOnce([[{ objectKey: 'stickers/private.png', contentType: 'image/png' }], []]);
    mocks.createSignedUrl.mockReturnValue({ url: 'https://obs.example/signed' });

    const result = await getCommunityChatCustomStickerDownload({
      user,
      stickerPublicId: 'd9fa2cc6-d314-4709-a37f-05937916842b',
    });

    expect(result).toEqual({ signedUrl: 'https://obs.example/signed', contentType: 'image/png' });
    expect(mocks.createSignedUrl).toHaveBeenCalledWith({ objectKey: 'stickers/private.png', expires: 300 });
  });
});
