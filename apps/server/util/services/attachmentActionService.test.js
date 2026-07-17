import { mkdtemp, readFile, rm } from 'node:fs/promises';
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

const { createImageNoteFromAttachment, saveAttachmentToCloud } = await import('./attachmentActionService.js');

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
    expect(copyObjectInObs).toHaveBeenCalledWith(source.object_key, 'files/user-1/我的头像.png');
    expect(connection.query).toHaveBeenCalledWith(
      'UPDATE ai_document_sources SET file_id = ? WHERE id = ? AND user_id = ?',
      [42, 'attachment-1', 'user-1'],
    );
    expect(triggerResourceCreateEffects).toHaveBeenCalledWith(
      expect.objectContaining({ resourceType: 'file', resourceId: 42 }),
    );
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
    expect(copyObjectInObs).not.toHaveBeenCalled();
    expect(pool.getConnection).not.toHaveBeenCalled();
  });

  it('无文字图片可以直接写入图片目录并创建带原图引用的笔记', async () => {
    const imageDir = await mkdtemp(path.join(os.tmpdir(), 'light-note-image-note-'));
    const source = attachment({ status: 'ready', error_code: 'NO_TEXT_CONTENT' });
    pool.query.mockResolvedValueOnce([[source]]);
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
});
