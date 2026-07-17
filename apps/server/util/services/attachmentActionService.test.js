import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const pool = { query: vi.fn(), getConnection: vi.fn() };
const getUserSpaceMb = vi.fn();
const copyObjectInObs = vi.fn();
const deleteObjectFromObs = vi.fn();
const getObjectBufferFromObs = vi.fn();
const getObjectMetadataFromObs = vi.fn();
const createNote = vi.fn();
const triggerResourceCreateEffects = vi.fn();

vi.mock('../../db/index.js', () => ({ default: pool }));
vi.mock('../growth.js', () => ({ getUserSpaceMb }));
vi.mock('../obsClient.js', () => ({
  bucketBaseUrl: 'https://bucket.example',
  buildObjectKey: (userId, fileName) => `files/${userId}/${fileName}`,
  copyObjectInObs,
  deleteObjectFromObs,
  getObjectBufferFromObs,
  getObjectMetadataFromObs,
}));
vi.mock('./noteService.js', () => ({ createNote }));
vi.mock('./resourceCreateEffects.js', () => ({ triggerResourceCreateEffects }));

const {
  createImageNoteFromAttachment,
  prepareCreateImageNoteFromAttachment,
  prepareSaveAttachmentToCloud,
  saveAttachmentToCloud,
} = await import('./attachmentActionService.js');

const ONE_PIXEL_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
);

function attachment(overrides = {}) {
  return {
    id: 'attachment-1',
    user_id: 'user-1',
    source_type: 'temporary',
    file_id: null,
    file_name: 'avatar.png',
    file_type: 'image/png',
    file_size: ONE_PIXEL_PNG.length,
    object_key: 'ai-temp/user-1/attachment-1/avatar.png',
    status: 'ready',
    expires_at: new Date(Date.now() + 60_000),
    ...overrides,
  };
}

describe('attachmentActionService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getUserSpaceMb.mockResolvedValue(512);
    copyObjectInObs.mockResolvedValue({});
    deleteObjectFromObs.mockResolvedValue({});
  });

  it('把临时附件复制到云空间并登记文件，文字解析状态不参与限制', async () => {
    const source = attachment({ status: 'failed', error_code: 'OCR_RECOGNITION_FAILED' });
    const connection = {
      beginTransaction: vi.fn(),
      commit: vi.fn(),
      rollback: vi.fn(),
      release: vi.fn(),
      query: vi.fn(async (sql) => {
        const text = String(sql);
        if (text.includes('SELECT * FROM ai_document_sources')) return [[source]];
        if (text.includes('SUM(file_size)')) return [[{ used: 0 }]];
        if (text.includes('SELECT id FROM files')) return [[]];
        if (text === 'INSERT INTO files SET ?') return [{ insertId: 42 }];
        return [{ affectedRows: 1 }];
      }),
    };
    pool.query.mockResolvedValueOnce([[source]]);
    pool.getConnection.mockResolvedValue(connection);

    const result = await saveAttachmentToCloud({
      userId: 'user-1',
      userRole: 'user',
      attachmentId: 'attachment-1',
      fileName: '我的头像',
    });

    expect(result).toEqual(expect.objectContaining({ id: '42', fileName: '我的头像.png', alreadySaved: false }));
    const copiedObjectKey = copyObjectInObs.mock.calls[0][1];
    expect(copiedObjectKey).toMatch(/^files\/user-1\/ai\/[0-9a-f-]{36}\.png$/);
    expect(copiedObjectKey).not.toBe('files/user-1/我的头像.png');
    expect(connection.query).toHaveBeenCalledWith('INSERT INTO files SET ?', [
      expect.objectContaining({ file_name: '我的头像.png', obs_key: copiedObjectKey }),
    ]);
    expect(connection.query).toHaveBeenCalledWith(
      'UPDATE ai_document_sources SET file_id = ? WHERE id = ? AND user_id = ?',
      [42, 'attachment-1', 'user-1'],
    );
    expect(triggerResourceCreateEffects).toHaveBeenCalledWith(
      expect.objectContaining({ resourceType: 'file', resourceId: 42 }),
    );
  });

  it('OBS 复制成功但数据库写入失败时回滚并删除随机对象', async () => {
    const source = attachment();
    const connection = {
      beginTransaction: vi.fn(),
      commit: vi.fn(),
      rollback: vi.fn(),
      release: vi.fn(),
      query: vi.fn(async (sql) => {
        const text = String(sql);
        if (text.includes('SELECT * FROM ai_document_sources')) return [[source]];
        if (text.includes('SUM(file_size)')) return [[{ used: 0 }]];
        if (text.includes('SELECT id FROM files')) return [[]];
        if (text === 'INSERT INTO files SET ?') throw new Error('insert failed');
        return [{ affectedRows: 1 }];
      }),
    };
    pool.query.mockResolvedValueOnce([[source]]);
    pool.getConnection.mockResolvedValue(connection);

    await expect(
      saveAttachmentToCloud({
        userId: 'user-1',
        userRole: 'user',
        attachmentId: 'attachment-1',
      }),
    ).rejects.toThrow('insert failed');

    const copiedObjectKey = copyObjectInObs.mock.calls[0][1];
    expect(copiedObjectKey).toMatch(/^files\/user-1\/ai\/[0-9a-f-]{36}\.png$/);
    expect(deleteObjectFromObs).toHaveBeenCalledWith(copiedObjectKey);
    expect(connection.rollback).toHaveBeenCalledTimes(1);
    expect(connection.release).toHaveBeenCalledTimes(1);
    expect(triggerResourceCreateEffects).not.toHaveBeenCalled();
  });

  it('OBS 复制回包异常时也删除可能已经生成的随机对象', async () => {
    const source = attachment();
    copyObjectInObs.mockRejectedValueOnce(new Error('copy response lost'));
    const connection = {
      beginTransaction: vi.fn(),
      commit: vi.fn(),
      rollback: vi.fn(),
      release: vi.fn(),
      query: vi.fn(async (sql) => {
        const text = String(sql);
        if (text.includes('SELECT * FROM ai_document_sources')) return [[source]];
        if (text.includes('SUM(file_size)')) return [[{ used: 0 }]];
        if (text.includes('SELECT id FROM files')) return [[]];
        return [{ affectedRows: 1 }];
      }),
    };
    pool.query.mockResolvedValueOnce([[source]]);
    pool.getConnection.mockResolvedValue(connection);

    await expect(
      saveAttachmentToCloud({ userId: 'user-1', userRole: 'user', attachmentId: 'attachment-1' }),
    ).rejects.toThrow('copy response lost');

    const attemptedObjectKey = copyObjectInObs.mock.calls[0][1];
    expect(deleteObjectFromObs).toHaveBeenCalledWith(attemptedObjectKey);
    expect(connection.commit).not.toHaveBeenCalled();
  });

  it('云空间事务已提交但 commit 回包异常时按对象键和用户核验，不误删已落库对象', async () => {
    const source = attachment();
    const commitError = new Error('commit response lost');
    const connection = {
      beginTransaction: vi.fn(),
      commit: vi.fn().mockRejectedValue(commitError),
      rollback: vi.fn(),
      release: vi.fn(),
      query: vi.fn(async (sql) => {
        const text = String(sql);
        if (text.includes('SELECT * FROM ai_document_sources')) return [[source]];
        if (text.includes('SUM(file_size)')) return [[{ used: 0 }]];
        if (text.includes('SELECT id FROM files')) return [[]];
        if (text === 'INSERT INTO files SET ?') return [{ insertId: 44 }];
        return [{ affectedRows: 1 }];
      }),
    };
    pool.query.mockResolvedValueOnce([[source]]).mockImplementationOnce(async (sql, params) => {
      expect(String(sql)).toContain('WHERE f.create_by = ? AND f.obs_key = ?');
      expect(params[0]).toBe('user-1');
      expect(params[1]).toMatch(/^files\/user-1\/ai\/[0-9a-f-]{36}\.png$/);
      return [
        [
          {
            id: 44,
            file_name: 'avatar.png',
            file_type: 'image/png',
            file_size: ONE_PIXEL_PNG.length,
            obs_key: params[1],
            folder_id: null,
            folder_name: null,
          },
        ],
      ];
    });
    pool.getConnection.mockResolvedValue(connection);

    await expect(
      saveAttachmentToCloud({ userId: 'user-1', userRole: 'user', attachmentId: 'attachment-1' }),
    ).resolves.toEqual(expect.objectContaining({ id: '44', alreadySaved: false }));

    expect(connection.rollback).toHaveBeenCalledTimes(1);
    expect(deleteObjectFromObs).not.toHaveBeenCalled();
    expect(triggerResourceCreateEffects).toHaveBeenCalledWith(expect.objectContaining({ resourceId: 44 }));
  });

  it('云空间 commit 失败且事务外无当前用户记录时判定回滚并清理对象', async () => {
    const source = attachment();
    const commitError = new Error('commit rejected');
    const connection = {
      beginTransaction: vi.fn(),
      commit: vi.fn().mockRejectedValue(commitError),
      rollback: vi.fn(),
      release: vi.fn(),
      query: vi.fn(async (sql) => {
        const text = String(sql);
        if (text.includes('SELECT * FROM ai_document_sources')) return [[source]];
        if (text.includes('SUM(file_size)')) return [[{ used: 0 }]];
        if (text.includes('SELECT id FROM files')) return [[]];
        if (text === 'INSERT INTO files SET ?') return [{ insertId: 45 }];
        return [{ affectedRows: 1 }];
      }),
    };
    pool.query.mockResolvedValueOnce([[source]]).mockResolvedValueOnce([[]]);
    pool.getConnection.mockResolvedValue(connection);

    await expect(
      saveAttachmentToCloud({ userId: 'user-1', userRole: 'user', attachmentId: 'attachment-1' }),
    ).rejects.toBe(commitError);

    const copiedObjectKey = copyObjectInObs.mock.calls[0][1];
    expect(deleteObjectFromObs).toHaveBeenCalledWith(copiedObjectKey);
    expect(connection.rollback).toHaveBeenCalledTimes(1);
    expect(triggerResourceCreateEffects).not.toHaveBeenCalled();
  });

  it('云空间 commit 后核验不可用时保留对象并标记提交结果不明', async () => {
    const source = attachment();
    const connection = {
      beginTransaction: vi.fn(),
      commit: vi.fn().mockRejectedValue('commit response lost'),
      rollback: vi.fn(),
      release: vi.fn(),
      query: vi.fn(async (sql) => {
        const text = String(sql);
        if (text.includes('SELECT * FROM ai_document_sources')) return [[source]];
        if (text.includes('SUM(file_size)')) return [[{ used: 0 }]];
        if (text.includes('SELECT id FROM files')) return [[]];
        if (text === 'INSERT INTO files SET ?') return [{ insertId: 46 }];
        return [{ affectedRows: 1 }];
      }),
    };
    pool.query.mockResolvedValueOnce([[source]]).mockRejectedValueOnce(new Error('verification unavailable'));
    pool.getConnection.mockResolvedValue(connection);

    await expect(
      saveAttachmentToCloud({ userId: 'user-1', userRole: 'user', attachmentId: 'attachment-1' }),
    ).rejects.toMatchObject({ commitOutcomeUnknown: true, cause: 'commit response lost' });

    expect(deleteObjectFromObs).not.toHaveBeenCalled();
    expect(triggerResourceCreateEffects).not.toHaveBeenCalled();
  });

  it('云空间已有对应文件时幂等返回，不再复制对象', async () => {
    const source = attachment({ source_type: 'cloud', file_id: 8, expires_at: null });
    pool.query
      .mockResolvedValueOnce([[source]])
      .mockResolvedValueOnce([
        [{ id: 8, file_name: 'avatar.png', file_type: 'image/png', file_size: ONE_PIXEL_PNG.length }],
      ]);

    await expect(
      saveAttachmentToCloud({ userId: 'user-1', userRole: 'user', attachmentId: 'attachment-1' }),
    ).resolves.toEqual(expect.objectContaining({ id: '8', alreadySaved: true }));
    expect(pool.query.mock.calls[1][0]).toContain('folders.create_by = f.create_by');
    expect(copyObjectInObs).not.toHaveBeenCalled();
    expect(pool.getConnection).not.toHaveBeenCalled();
  });

  it('按文件夹精确名称解析，并在事务内重新校验后写入 folder_id', async () => {
    const source = attachment();
    pool.query.mockResolvedValueOnce([[source]]).mockResolvedValueOnce([[{ id: 7, name: '图片资料' }]]);
    const connection = {
      beginTransaction: vi.fn(),
      commit: vi.fn(),
      rollback: vi.fn(),
      release: vi.fn(),
      query: vi.fn(async (sql) => {
        const text = String(sql);
        if (text.includes('SELECT * FROM ai_document_sources')) return [[source]];
        if (text.includes('SELECT id, name FROM folders')) return [[{ id: 7, name: '图片资料' }]];
        if (text.includes('SUM(file_size)')) return [[{ used: 0 }]];
        if (text.includes('SELECT id FROM files')) return [[]];
        if (text === 'INSERT INTO files SET ?') return [{ insertId: 43 }];
        return [{ affectedRows: 1 }];
      }),
    };
    pool.getConnection.mockResolvedValue(connection);

    const result = await saveAttachmentToCloud({
      userId: 'user-1',
      userRole: 'user',
      attachmentId: 'attachment-1',
      folderName: '图片资料',
    });

    expect(connection.query).toHaveBeenCalledWith('INSERT INTO files SET ?', [
      expect.objectContaining({ folder_id: 7 }),
    ]);
    expect(result).toMatchObject({ folderId: '7', folderName: '图片资料' });
  });

  it('folderId 是权威参数，不会被同时传入的 folderName 覆盖', async () => {
    pool.query.mockResolvedValueOnce([[attachment()]]).mockResolvedValueOnce([[{ id: 8, name: '服务端真实名称' }]]);

    const prepared = await prepareSaveAttachmentToCloud({
      userId: 'user-1',
      attachmentId: 'attachment-1',
      folderId: '8',
      folderName: '过期的界面名称',
    });

    expect(pool.query.mock.calls[1][1]).toEqual([8, 'user-1']);
    expect(prepared).toMatchObject({ folderId: '8', folderName: '服务端真实名称' });
  });

  it('文件夹名称无匹配、重名或跨用户 ID 时拒绝保存', async () => {
    pool.query.mockResolvedValueOnce([[attachment()]]).mockResolvedValueOnce([[]]);
    await expect(
      prepareSaveAttachmentToCloud({
        userId: 'user-1',
        attachmentId: 'attachment-1',
        folderName: '不存在',
      }),
    ).rejects.toThrow(/FOLDER_NOT_FOUND/);

    vi.clearAllMocks();
    pool.query.mockResolvedValueOnce([[attachment()]]).mockResolvedValueOnce([
      [
        { id: 1, name: '资料' },
        { id: 2, name: '资料' },
      ],
    ]);
    await expect(
      prepareSaveAttachmentToCloud({
        userId: 'user-1',
        attachmentId: 'attachment-1',
        folderName: '资料',
      }),
    ).rejects.toThrow(/FOLDER_AMBIGUOUS/);

    vi.clearAllMocks();
    pool.query.mockResolvedValueOnce([[attachment()]]).mockResolvedValueOnce([[]]);
    await expect(
      prepareSaveAttachmentToCloud({
        userId: 'user-1',
        attachmentId: 'attachment-1',
        folderId: 99,
      }),
    ).rejects.toThrow(/FOLDER_NOT_FOUND/);
    expect(pool.query.mock.calls[1][1]).toEqual([99, 'user-1']);
  });

  it('显式拒绝文件名中的路径分隔符', async () => {
    pool.query.mockResolvedValueOnce([[attachment()]]);
    await expect(
      prepareSaveAttachmentToCloud({
        userId: 'user-1',
        attachmentId: 'attachment-1',
        fileName: '../测试.png',
      }),
    ).rejects.toThrow(/FILE_NAME_INVALID/);
  });

  it('图片笔记预处理使用真实文件信息和文件名默认标题', async () => {
    pool.query.mockResolvedValueOnce([[attachment({ file_name: '旅行照片.png' })]]);
    await expect(
      prepareCreateImageNoteFromAttachment({ userId: 'user-1', attachmentId: 'attachment-1' }),
    ).resolves.toMatchObject({
      title: '旅行照片',
      description: '',
      sourceFileName: '旅行照片.png',
      fileType: 'image/png',
      fileSize: ONE_PIXEL_PNG.length,
    });
  });

  it('无文字图片可以直接写入图片目录并创建带原图引用的笔记', async () => {
    const imageDir = await mkdtemp(path.join(os.tmpdir(), 'light-note-image-note-'));
    const source = attachment({ status: 'ready', error_code: 'NO_TEXT_CONTENT' });
    pool.query.mockResolvedValueOnce([[source]]).mockResolvedValueOnce([[source]]);
    getObjectMetadataFromObs.mockResolvedValue({ contentLength: ONE_PIXEL_PNG.length });
    getObjectBufferFromObs.mockResolvedValue(ONE_PIXEL_PNG);
    createNote.mockResolvedValue({ id: 'note-1', title: '我的头像', type: 'html' });

    try {
      const result = await createImageNoteFromAttachment({
        userId: 'user-1',
        userRole: 'user',
        attachmentId: 'attachment-1',
        title: '我的头像',
        description: '新的个人头像',
        imageDir,
      });
      expect(result).toEqual(expect.objectContaining({ id: 'note-1', title: '我的头像' }));
      const savedName = new URL(result.imageUrl).pathname.split('/').pop();
      expect(await readFile(path.join(imageDir, savedName))).toEqual(ONE_PIXEL_PNG);
      expect(createNote).toHaveBeenCalledWith(
        expect.objectContaining({
          trustedImageUrls: [result.imageUrl],
          note: expect.objectContaining({ type: 'html', content: expect.stringContaining(result.imageUrl) }),
        }),
      );
    } finally {
      await rm(imageDir, { recursive: true, force: true });
    }
  });

  it('图片笔记提交结果不明后重试时复用图片路径，并把幂等键传给笔记创建', async () => {
    const imageDir = await mkdtemp(path.join(os.tmpdir(), 'light-note-image-note-'));
    const source = attachment();
    pool.query.mockImplementation(async () => [[source]]);
    getObjectMetadataFromObs.mockResolvedValue({ contentLength: ONE_PIXEL_PNG.length });
    getObjectBufferFromObs.mockResolvedValue(ONE_PIXEL_PNG);
    createNote
      .mockRejectedValueOnce(Object.assign(new Error('commit response lost'), { commitOutcomeUnknown: true }))
      .mockResolvedValueOnce({ id: 'note-stable', title: '我的头像', type: 'html' });
    const idempotencyKey = 'agent-write-v1:stable-image-note';

    try {
      await expect(
        createImageNoteFromAttachment({
          userId: 'user-1',
          attachmentId: 'attachment-1',
          title: '我的头像',
          imageDir,
          idempotencyKey,
        }),
      ).rejects.toMatchObject({ commitOutcomeUnknown: true });
      const storedBeforeRetry = await readdir(imageDir);
      const second = await createImageNoteFromAttachment({
        userId: 'user-1',
        attachmentId: 'attachment-1',
        title: '我的头像',
        imageDir,
        idempotencyKey,
      });

      expect(storedBeforeRetry).toHaveLength(1);
      expect(await readdir(imageDir)).toEqual(storedBeforeRetry);
      expect(second.imageUrl.endsWith(`/${storedBeforeRetry[0]}`)).toBe(true);
      expect(createNote).toHaveBeenCalledTimes(2);
      expect(createNote).toHaveBeenLastCalledWith(expect.objectContaining({ idempotencyKey }));
    } finally {
      await rm(imageDir, { recursive: true, force: true });
    }
  });

  it('图片笔记 commit 结果不明时保留可能已被落库笔记引用的图片', async () => {
    const imageDir = await mkdtemp(path.join(os.tmpdir(), 'light-note-image-note-'));
    const source = attachment();
    pool.query.mockResolvedValueOnce([[source]]).mockResolvedValueOnce([[source]]);
    getObjectMetadataFromObs.mockResolvedValue({ contentLength: ONE_PIXEL_PNG.length });
    getObjectBufferFromObs.mockResolvedValue(ONE_PIXEL_PNG);
    const commitError = Object.assign(new Error('commit response lost'), { commitOutcomeUnknown: true });
    createNote.mockRejectedValue(commitError);

    try {
      await expect(
        createImageNoteFromAttachment({ userId: 'user-1', attachmentId: 'attachment-1', imageDir }),
      ).rejects.toBe(commitError);
      expect(await readdir(imageDir)).toHaveLength(1);
    } finally {
      await rm(imageDir, { recursive: true, force: true });
    }
  });

  it('图片笔记真实回滚时删除尚未被笔记引用的图片', async () => {
    const imageDir = await mkdtemp(path.join(os.tmpdir(), 'light-note-image-note-'));
    const source = attachment();
    pool.query.mockResolvedValueOnce([[source]]).mockResolvedValueOnce([[source]]);
    getObjectMetadataFromObs.mockResolvedValue({ contentLength: ONE_PIXEL_PNG.length });
    getObjectBufferFromObs.mockResolvedValue(ONE_PIXEL_PNG);
    createNote.mockRejectedValue(new Error('insert failed'));

    try {
      await expect(
        createImageNoteFromAttachment({ userId: 'user-1', attachmentId: 'attachment-1', imageDir }),
      ).rejects.toThrow('insert failed');
      expect(await readdir(imageDir)).toHaveLength(0);
    } finally {
      await rm(imageDir, { recursive: true, force: true });
    }
  });
});
