import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createUploadSignedUrl: vi.fn(),
  createDownloadSignedUrl: vi.fn(),
  deleteObject: vi.fn(),
  getMetadata: vi.fn(),
  deletePreviewArtifacts: vi.fn(),
}));

vi.mock('../obsClient.js', () => ({
  createUploadSignedUrl: mocks.createUploadSignedUrl,
  createDownloadSignedUrl: mocks.createDownloadSignedUrl,
  deleteObjectFromObs: mocks.deleteObject,
  getObjectMetadataFromObs: mocks.getMetadata,
}));

vi.mock('../filePreview/service.js', () => ({
  deleteFilePreviewArtifactsForSource: mocks.deletePreviewArtifacts,
}));

const {
  COMMUNITY_CHAT_ATTACHMENT_MAX_PENDING_PER_USER,
  assertCommunityChatFileAllowed,
  cleanupExpiredCommunityChatFiles,
  confirmCommunityChatFileUpload,
  discardCommunityChatFile,
  getCommunityChatFileDownload,
  normalizeCommunityChatFileName,
  prepareCommunityChatFileUpload,
} = await import('./communityChatFileService.js');

const FILES_ENV = {
  COMMUNITY_CHAT_ACCESS_MODE: 'public',
  COMMUNITY_CHAT_MESSAGING_ENABLED: '1',
  COMMUNITY_CHAT_FILES_ENABLED: '1',
  COMMUNITY_CHAT_RULES_VERSION: 'rules-v1',
};

const USER = { id: 'user-1', role: 'user' };
const FILE_PUBLIC_ID = '33333333-3333-4333-8333-333333333333';

function createConnection(queryImplementation) {
  return {
    beginTransaction: vi.fn(async () => {}),
    query: vi.fn(queryImplementation),
    commit: vi.fn(async () => {}),
    rollback: vi.fn(async () => {}),
    release: vi.fn(),
  };
}

function accessQuery(sql) {
  const text = String(sql);
  if (text.includes('FROM community_chat_members')) return [[], []];
  if (text.includes('FROM community_chat_runtime_policy')) return [[{ postingEnabled: 1 }], []];
  if (text.includes('FROM community_chat_member_sanctions')) return [[], []];
  if (text.includes('FROM community_chat_rooms')) return [[{ id: 2 }], []];
  return null;
}

describe('communityChatFileService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createUploadSignedUrl.mockReturnValue({
      url: 'https://upload.example/signed',
      headers: { 'Content-Type': 'text/plain' },
      expiresIn: 900,
    });
    mocks.createDownloadSignedUrl.mockReturnValue({ url: 'https://download.example/signed' });
    mocks.getMetadata.mockResolvedValue({ contentLength: 128, contentType: 'text/plain' });
    mocks.deleteObject.mockResolvedValue({});
    mocks.deletePreviewArtifacts.mockResolvedValue({ deletedArtifacts: 1, deletedObjects: 1 });
  });

  it('拒绝路径、控制字符、空文件名以及可执行或安装类文件', () => {
    for (const fileName of ['', '.', '..', '../secret.txt', 'bad\nname.txt']) {
      expect(() => normalizeCommunityChatFileName(fileName)).toThrow();
    }
    for (const [fileName, fileType] of [
      ['setup.exe', 'application/octet-stream'],
      ['bundle.apk', 'application/zip'],
      ['script.txt', 'application/x-shellscript'],
      ['library.dll', 'application/octet-stream'],
    ]) {
      expect(() => assertCommunityChatFileAllowed(fileName, fileType)).toThrow();
    }
    expect(() => assertCommunityChatFileAllowed('notes.txt', 'text/plain')).not.toThrow();
  });

  it('在事务中合并图片与文件待发送配额，再创建 15 分钟 OBS 直传地址', async () => {
    const connection = createConnection(async (sql, params) => {
      const text = String(sql);
      if (text.includes('SELECT id FROM user')) return [[{ id: USER.id }], []];
      if (text.includes('AS pendingCount')) {
        expect(params).toEqual([USER.id, USER.id]);
        return [[{ pendingCount: COMMUNITY_CHAT_ATTACHMENT_MAX_PENDING_PER_USER - 1 }], []];
      }
      if (text.includes('INSERT INTO community_chat_message_files')) {
        expect(params).toEqual([
          expect.any(String),
          USER.id,
          2,
          expect.stringMatching(/^community-chat\/files\/[a-f0-9]{24}\/.+\.txt$/),
          'notes.txt',
          'text/plain',
          128,
          24,
        ]);
        return [{ insertId: 9 }, []];
      }
      throw new Error(`unexpected transaction query: ${sql}`);
    });
    const db = {
      getConnection: vi.fn(async () => connection),
      query: vi.fn(async (sql) => accessQuery(sql) || Promise.reject(new Error(`unexpected query: ${sql}`))),
    };

    const result = await prepareCommunityChatFileUpload({
      user: USER,
      roomSlug: 'general',
      fileName: 'notes.txt',
      fileType: 'text/plain',
      fileSize: 128,
      env: FILES_ENV,
      db,
      createSignedUrl: mocks.createUploadSignedUrl,
    });

    expect(connection.commit).toHaveBeenCalledTimes(1);
    expect(mocks.createUploadSignedUrl).toHaveBeenCalledWith({
      objectKey: expect.stringMatching(/^community-chat\/files\/[a-f0-9]{24}\/.+\.txt$/),
      contentType: 'text/plain',
      expires: 900,
    });
    expect(result).toMatchObject({
      attachment: {
        publicId: expect.any(String),
        kind: 'file',
        fileName: 'notes.txt',
        fileType: 'text/plain',
        fileSize: 128,
        availability: 'available',
      },
      uploadUrl: 'https://upload.example/signed',
      expiresIn: 900,
    });
    expect(result.attachment).not.toHaveProperty('objectKey');
  });

  it('确认时以 OBS 元数据复核大小和类型，并允许确认响应丢失后的幂等重试', async () => {
    let status = 'uploading';
    const connection = createConnection(async (sql) => {
      const text = String(sql);
      if (text.includes('SELECT id FROM user')) return [[{ id: USER.id }], []];
      if (text.includes('FROM community_chat_message_files')) {
        return [
          [
            {
              id: 9,
              publicId: FILE_PUBLIC_ID,
              objectKey: 'community-chat/files/private/notes.txt',
              fileName: 'notes.txt',
              contentType: 'text/plain',
              fileSize: 128,
              status,
              messageId: null,
              expiresAt: '2099-09-04T10:00:00.000Z',
              isExpired: 0,
            },
          ],
          [],
        ];
      }
      if (text.includes("SET status = 'pending'")) {
        status = 'pending';
        return [{ affectedRows: 1 }, []];
      }
      throw new Error(`unexpected transaction query: ${sql}`);
    });
    const db = {
      getConnection: vi.fn(async () => connection),
      query: vi.fn(async (sql) => accessQuery(sql) || Promise.reject(new Error(`unexpected query: ${sql}`))),
    };

    const first = await confirmCommunityChatFileUpload({
      user: USER,
      filePublicId: FILE_PUBLIC_ID,
      env: FILES_ENV,
      db,
      getMetadata: mocks.getMetadata,
    });
    const replay = await confirmCommunityChatFileUpload({
      user: USER,
      filePublicId: FILE_PUBLIC_ID,
      env: FILES_ENV,
      db,
      getMetadata: mocks.getMetadata,
    });

    expect(first).toMatchObject({ publicId: FILE_PUBLIC_ID, kind: 'file', availability: 'available' });
    expect(replay).toMatchObject({ publicId: FILE_PUBLIC_ID, alreadyConfirmed: true });
    expect(mocks.getMetadata).toHaveBeenCalledTimes(1);
    expect(connection.commit).toHaveBeenCalledTimes(2);
  });

  it('确认上传前重新锁定账号事实，账号已失效时不读取 OBS 对象', async () => {
    const connection = createConnection(async (sql) => {
      if (String(sql).includes('SELECT id FROM user')) return [[], []];
      throw new Error(`unexpected transaction query: ${sql}`);
    });
    const db = {
      getConnection: vi.fn(async () => connection),
      query: vi.fn(async (sql) => accessQuery(sql) || Promise.reject(new Error(`unexpected query: ${sql}`))),
    };

    await expect(
      confirmCommunityChatFileUpload({
        user: USER,
        filePublicId: FILE_PUBLIC_ID,
        env: FILES_ENV,
        db,
        getMetadata: mocks.getMetadata,
      }),
    ).rejects.toMatchObject({ code: 'LOGIN_REQUIRED', status: 403 });

    expect(mocks.getMetadata).not.toHaveBeenCalled();
    expect(connection.rollback).toHaveBeenCalledTimes(1);
    expect(connection.commit).not.toHaveBeenCalled();
  });

  it('下载地址不跨越 30 天到期边界，到期后立即返回 410', async () => {
    let expired = false;
    const db = {
      query: vi.fn(async (sql) => {
        const access = accessQuery(sql);
        if (access) return access;
        if (String(sql).includes('FROM community_chat_message_files file')) {
          return [
            [
              {
                id: 9,
                publicId: FILE_PUBLIC_ID,
                ownerUserId: USER.id,
                objectKey: 'community-chat/files/private/notes.txt',
                fileName: 'notes.txt',
                contentType: 'text/plain',
                fileSize: 128,
                status: 'attached',
                messageId: 44,
                expiresAt: '2099-09-04T10:00:00.000Z',
                isExpired: expired ? 1 : 0,
                remainingSeconds: expired ? 0 : 17,
              },
            ],
            [],
          ];
        }
        throw new Error(`unexpected query: ${sql}`);
      }),
    };

    const available = await getCommunityChatFileDownload({
      user: USER,
      filePublicId: FILE_PUBLIC_ID,
      env: FILES_ENV,
      db,
      createSignedUrl: mocks.createDownloadSignedUrl,
    });
    expect(mocks.createDownloadSignedUrl).toHaveBeenCalledWith({
      objectKey: 'community-chat/files/private/notes.txt',
      expires: 16,
    });
    expect(available.expiresIn).toBe(16);

    expired = true;
    await expect(
      getCommunityChatFileDownload({
        user: USER,
        filePublicId: FILE_PUBLIC_ID,
        env: FILES_ENV,
        db,
        createSignedUrl: mocks.createDownloadSignedUrl,
      }),
    ).rejects.toMatchObject({ code: 'COMMUNITY_CHAT_FILE_EXPIRED', status: 410 });
  });

  it('剩余时间不足完整签名秒时提前拒绝，避免下载链接越过过期边界', async () => {
    const db = {
      query: vi.fn(async (sql) => {
        const access = accessQuery(sql);
        if (access) return access;
        if (String(sql).includes('FROM community_chat_message_files file')) {
          return [
            [
              {
                id: 9,
                publicId: FILE_PUBLIC_ID,
                ownerUserId: USER.id,
                objectKey: 'community-chat/files/private/notes.txt',
                fileName: 'notes.txt',
                contentType: 'text/plain',
                fileSize: 128,
                status: 'attached',
                messageId: 44,
                expiresAt: '2099-09-04T10:00:00.000Z',
                isExpired: 0,
                remainingSeconds: 1,
              },
            ],
            [],
          ];
        }
        throw new Error(`unexpected query: ${sql}`);
      }),
    };

    await expect(
      getCommunityChatFileDownload({
        user: USER,
        filePublicId: FILE_PUBLIC_ID,
        env: FILES_ENV,
        db,
        createSignedUrl: mocks.createDownloadSignedUrl,
      }),
    ).rejects.toMatchObject({ code: 'COMMUNITY_CHAT_FILE_EXPIRED', status: 410 });
    expect(mocks.createDownloadSignedUrl).not.toHaveBeenCalled();
  });

  it('取消待发送文件时先提交删除状态，再幂等清理 OBS 和数据库记录', async () => {
    const connection = createConnection(async (sql) => {
      const text = String(sql);
      if (text.includes('SELECT object_key')) {
        return [[{ objectKey: 'community-chat/files/private/notes.txt', status: 'pending', messageId: null }], []];
      }
      if (text.includes("SET status = 'delete_pending'")) return [{ affectedRows: 1 }, []];
      throw new Error(`unexpected transaction query: ${sql}`);
    });
    const db = {
      getConnection: vi.fn(async () => connection),
      query: vi.fn(async (sql) => {
        if (String(sql).includes('DELETE FROM community_chat_message_files')) return [{ affectedRows: 1 }, []];
        throw new Error(`unexpected query: ${sql}`);
      }),
    };

    await expect(
      discardCommunityChatFile({ user: USER, filePublicId: FILE_PUBLIC_ID, db, deleteObject: mocks.deleteObject }),
    ).resolves.toEqual({ publicId: FILE_PUBLIC_ID, discarded: true, cleanupPending: false });
    expect(connection.commit).toHaveBeenCalledBefore(mocks.deleteObject);
    expect(
      connection.query.mock.calls.some(([sql]) =>
        String(sql).includes("SET status = 'delete_pending', expires_at = NOW()"),
      ),
    ).toBe(true);
    expect(mocks.deleteObject).toHaveBeenCalledWith('community-chat/files/private/notes.txt');
  });

  it('24 小时临时文件直接删除，30 天已发送文件删除原件和预览但保留元数据，失败可重试', async () => {
    const db = {
      query: vi.fn(async (sql, params) => {
        const text = String(sql);
        if (text.includes('SELECT id, public_id AS publicId')) {
          return [
            [
              { id: 1, publicId: 'pending-file', objectKey: 'pending.bin', messageId: null },
              { id: 2, publicId: 'attached-file', objectKey: 'attached.pdf', messageId: 20 },
              { id: 3, publicId: 'retry-file', objectKey: 'retry.pdf', messageId: 21 },
            ],
            [],
          ];
        }
        if (text.includes("SET status = 'deleting'")) return [{ affectedRows: 1 }, []];
        if (text.includes('DELETE FROM community_chat_message_files')) return [{ affectedRows: 1 }, []];
        if (text.includes("SET status = 'expired'")) return [{ affectedRows: 1 }, []];
        if (text.includes("SET status = 'delete_pending'")) return [{ affectedRows: 1 }, []];
        throw new Error(`unexpected query: ${sql} ${JSON.stringify(params)}`);
      }),
    };
    const deleteObject = vi.fn(async (objectKey) => {
      if (objectKey === 'retry.pdf') throw new Error('OBS unavailable');
    });

    await expect(cleanupExpiredCommunityChatFiles({ db, deleteObject, limit: 20 })).resolves.toEqual({
      scanned: 3,
      removed: 1,
      expired: 1,
    });
    expect(mocks.deletePreviewArtifacts).toHaveBeenCalledTimes(2);
    expect(mocks.deletePreviewArtifacts).toHaveBeenNthCalledWith(1, {
      sourceType: 'community_chat_file',
      fileId: 2,
      db,
      deleteObject,
    });
    expect(db.query.mock.calls.some(([sql]) => String(sql).includes("SET status = 'delete_pending'"))).toBe(true);
  });
});
