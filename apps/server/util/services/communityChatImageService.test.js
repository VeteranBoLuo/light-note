import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  putObject: vi.fn(),
  deleteObject: vi.fn(),
  createSignedUrl: vi.fn(),
}));

vi.mock('../obsClient.js', () => ({
  putObjectToObs: mocks.putObject,
  deleteObjectFromObs: mocks.deleteObject,
  createDownloadSignedUrl: mocks.createSignedUrl,
}));

const {
  COMMUNITY_CHAT_IMAGE_MAX_PENDING_PER_USER,
  cleanupExpiredCommunityChatImages,
  discardCommunityChatImage,
  getCommunityChatImageDownload,
  uploadCommunityChatImage,
  validateCommunityChatImage,
} = await import('./communityChatImageService.js');

const PUBLIC_ENV = {
  COMMUNITY_CHAT_ACCESS_MODE: 'public',
  COMMUNITY_CHAT_MESSAGING_ENABLED: '1',
  COMMUNITY_CHAT_RULES_VERSION: 'rules-v1',
};

const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
);

let tempDirectory = '';

async function tempImage(mimetype = 'image/png') {
  tempDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'community-chat-image-test-'));
  const filePath = path.join(tempDirectory, 'upload.bin');
  await fs.writeFile(filePath, PNG_1X1);
  return {
    path: filePath,
    size: PNG_1X1.length,
    mimetype,
    originalname: 'photo.png',
  };
}

afterEach(async () => {
  if (tempDirectory) await fs.rm(tempDirectory, { recursive: true, force: true });
  tempDirectory = '';
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.putObject.mockResolvedValue({});
  mocks.deleteObject.mockResolvedValue({});
  mocks.createSignedUrl.mockReturnValue({ url: 'https://signed.example/image', expiresIn: 300 });
});

describe('communityChatImageService', () => {
  it('只信任图片真实内容，并拒绝 MIME 与内容不一致的伪装文件', async () => {
    const file = await tempImage('image/jpeg');

    await expect(validateCommunityChatImage(file)).rejects.toMatchObject({
      code: 'COMMUNITY_CHAT_IMAGE_CONTENT_INVALID',
      status: 400,
    });
  });

  it('上传前复核发言权限，先登记再写 OBS，并只返回图片公有 ID 和鉴权 URL', async () => {
    const file = await tempImage();
    const connection = {
      beginTransaction: vi.fn(async () => {}),
      query: vi.fn(async (sql, params) => {
        const text = String(sql);
        if (text.includes('SELECT id FROM user')) return [[{ id: 'user-1' }], []];
        if (text.includes('COUNT(*) AS pendingCount')) return [[{ pendingCount: 0 }], []];
        if (text.includes('INSERT INTO community_chat_message_images')) return [{ insertId: 8 }, []];
        throw new Error(`unexpected transaction query: ${sql} ${JSON.stringify(params)}`);
      }),
      commit: vi.fn(async () => {}),
      rollback: vi.fn(async () => {}),
      release: vi.fn(),
    };
    const db = {
      getConnection: vi.fn(async () => connection),
      query: vi.fn(async (sql, params) => {
        const text = String(sql);
        if (text.includes('FROM community_chat_members')) return [[], []];
        if (text.includes('FROM community_chat_runtime_policy')) return [[{ postingEnabled: 1 }], []];
        if (text.includes('FROM community_chat_member_sanctions')) return [[], []];
        if (text.includes('FROM community_chat_rooms')) return [[{ id: 2 }], []];
        if (text.includes("SET status = 'pending'")) return [{ affectedRows: 1 }, []];
        throw new Error(`unexpected query: ${sql} ${JSON.stringify(params)}`);
      }),
    };

    const result = await uploadCommunityChatImage({
      user: { id: 'user-1', role: 'user' },
      roomSlug: 'general',
      file,
      env: PUBLIC_ENV,
      db,
      putObject: mocks.putObject,
      deleteObject: mocks.deleteObject,
    });

    expect(result).toMatchObject({
      publicId: expect.any(String),
      url: expect.stringMatching(/^\/api\/community-chat\/images\//),
      contentType: 'image/png',
      fileSize: PNG_1X1.length,
      width: 1,
      height: 1,
    });
    expect(result).not.toHaveProperty('objectKey');
    const insertIndex = connection.query.mock.calls.findIndex(([sql]) => String(sql).includes('INSERT INTO'));
    const uploadIndex = mocks.putObject.mock.invocationCallOrder[0];
    expect(connection.query.mock.invocationCallOrder[insertIndex]).toBeLessThan(uploadIndex);
    expect(connection.commit.mock.invocationCallOrder[0]).toBeLessThan(uploadIndex);
    expect(mocks.putObject).toHaveBeenCalledWith(
      expect.stringMatching(/^community-chat\/[a-f0-9]{24}\/.+\.png$/),
      file.path,
      'image/png',
    );
    await expect(fs.stat(file.path)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('按用户串行预留上传名额，并在待发送图片达到上限时拒绝写入对象存储', async () => {
    const file = await tempImage();
    const connection = {
      beginTransaction: vi.fn(async () => {}),
      query: vi.fn(async (sql, params) => {
        const text = String(sql);
        if (text.includes('SELECT id FROM user')) {
          expect(params).toEqual(['user-1']);
          return [[{ id: 'user-1' }], []];
        }
        if (text.includes('COUNT(*) AS pendingCount')) {
          expect(params).toEqual(['user-1']);
          return [[{ pendingCount: COMMUNITY_CHAT_IMAGE_MAX_PENDING_PER_USER }], []];
        }
        throw new Error(`unexpected transaction query: ${sql} ${JSON.stringify(params)}`);
      }),
      commit: vi.fn(async () => {}),
      rollback: vi.fn(async () => {}),
      release: vi.fn(),
    };
    const db = {
      getConnection: vi.fn(async () => connection),
      query: vi.fn(async (sql, params) => {
        const text = String(sql);
        if (text.includes('FROM community_chat_members')) return [[], []];
        if (text.includes('FROM community_chat_runtime_policy')) return [[{ postingEnabled: 1 }], []];
        if (text.includes('FROM community_chat_member_sanctions')) return [[], []];
        if (text.includes('FROM community_chat_rooms')) return [[{ id: 2 }], []];
        throw new Error(`unexpected query: ${sql} ${JSON.stringify(params)}`);
      }),
    };

    await expect(
      uploadCommunityChatImage({
        user: { id: 'user-1', role: 'user' },
        roomSlug: 'general',
        file,
        env: PUBLIC_ENV,
        db,
        putObject: mocks.putObject,
        deleteObject: mocks.deleteObject,
      }),
    ).rejects.toMatchObject({ code: 'COMMUNITY_CHAT_IMAGE_PENDING_LIMIT', status: 429 });

    expect(connection.query).toHaveBeenCalledWith(expect.stringContaining('LIMIT 1 FOR UPDATE'), ['user-1']);
    expect(connection.query.mock.calls.some(([sql]) => String(sql).includes('INSERT INTO'))).toBe(false);
    expect(connection.commit).not.toHaveBeenCalled();
    expect(connection.rollback).toHaveBeenCalledTimes(1);
    expect(connection.release).toHaveBeenCalledTimes(1);
    expect(mocks.putObject).not.toHaveBeenCalled();
    await expect(fs.stat(file.path)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('读取已绑定图片时复核消息可见性，并把 OBS 路径收敛为短期签名跳转', async () => {
    const db = {
      query: vi.fn(async (sql, params) => {
        const text = String(sql);
        if (text.includes('FROM community_chat_members')) return [[], []];
        if (text.includes('FROM community_chat_message_images image')) {
          expect(params).toEqual(['image-1', 'user-1', 'general', 'user-1']);
          return [
            [
              {
                publicId: 'image-1',
                objectKey: 'community-chat/private/image-1.png',
                contentType: 'image/png',
                fileSize: 100,
                width: 640,
                height: 480,
                status: 'attached',
              },
            ],
            [],
          ];
        }
        throw new Error(`unexpected query: ${sql}`);
      }),
    };

    const result = await getCommunityChatImageDownload({
      user: { id: 'user-1', role: 'user' },
      imagePublicId: 'image-1',
      env: PUBLIC_ENV,
      db,
      createSignedUrl: mocks.createSignedUrl,
    });

    expect(mocks.createSignedUrl).toHaveBeenCalledWith({
      objectKey: 'community-chat/private/image-1.png',
      expires: 300,
    });
    expect(result.signedUrl).toBe('https://signed.example/image');
    expect(result).not.toHaveProperty('objectKey');
  });

  it('待发送图片只能由所有者丢弃，先标记清理状态再删除对象记录', async () => {
    const connection = {
      beginTransaction: vi.fn(async () => {}),
      query: vi.fn(async (sql, params) => {
        const text = String(sql);
        if (text.includes('SELECT object_key')) {
          expect(params).toEqual(['image-1', 'user-1']);
          return [[{ objectKey: 'community-chat/private/image-1.png', status: 'pending' }], []];
        }
        if (text.includes("SET status = 'delete_pending'")) return [{ affectedRows: 1 }, []];
        throw new Error(`unexpected query: ${sql}`);
      }),
      commit: vi.fn(async () => {}),
      rollback: vi.fn(async () => {}),
      release: vi.fn(),
    };
    const db = {
      getConnection: vi.fn(async () => connection),
      query: vi.fn(async (sql) => {
        if (String(sql).includes('DELETE FROM community_chat_message_images')) return [{ affectedRows: 1 }, []];
        throw new Error(`unexpected query: ${sql}`);
      }),
    };

    const result = await discardCommunityChatImage({
      user: { id: 'user-1', role: 'user' },
      imagePublicId: 'image-1',
      db,
      deleteObject: mocks.deleteObject,
    });

    expect(result).toEqual({ publicId: 'image-1', discarded: true, cleanupPending: false });
    expect(connection.commit).toHaveBeenCalledTimes(1);
    expect(mocks.deleteObject).toHaveBeenCalledWith('community-chat/private/image-1.png');
    expect(db.query).toHaveBeenCalledWith(expect.stringContaining("status IN ('delete_pending', 'deleting')"), [
      'image-1',
    ]);
  });

  it('批量回收过期的未发送图片，并保留删除失败记录供下轮重试', async () => {
    const db = {
      query: vi.fn(async (sql, params) => {
        const text = String(sql);
        if (text.includes('SELECT public_id AS publicId')) {
          return [
            [
              { publicId: 'image-ok', objectKey: 'community-chat/private/ok.png' },
              { publicId: 'image-retry', objectKey: 'community-chat/private/retry.png' },
            ],
            [],
          ];
        }
        if (text.includes("SET status = 'deleting'")) return [{ affectedRows: 1 }, []];
        if (text.includes("SET status = 'delete_pending'")) return [{ affectedRows: 1 }, []];
        if (text.includes('DELETE FROM community_chat_message_images')) return [{ affectedRows: 1 }, []];
        throw new Error(`unexpected query: ${sql} ${JSON.stringify(params)}`);
      }),
    };
    const deleteObject = vi.fn(async (objectKey) => {
      if (objectKey.endsWith('retry.png')) throw new Error('OBS unavailable');
    });

    await expect(cleanupExpiredCommunityChatImages({ db, deleteObject, limit: 20 })).resolves.toEqual({
      scanned: 2,
      removed: 1,
    });
    expect(deleteObject).toHaveBeenCalledTimes(2);
    expect(db.query.mock.calls.filter(([sql]) => String(sql).includes('DELETE FROM'))).toHaveLength(1);
  });
});
