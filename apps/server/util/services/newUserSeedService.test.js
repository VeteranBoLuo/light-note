import { beforeEach, describe, expect, it, vi } from 'vitest';

const poolQuery = vi.fn();
const getConnection = vi.fn();
const putObjectBodyToObs = vi.fn();

vi.mock('../../db/index.js', () => ({
  default: {
    query: poolQuery,
    getConnection,
  },
}));

vi.mock('../obsClient.js', () => ({
  bucketBaseUrl: 'https://example.obs.test',
  putObjectBodyToObs,
}));

const { NEW_USER_SEED_VERSION, buildNewUserSeedContent, seedNewUserCloudFile, seedNewUserWorkspaceData } =
  await import('./newUserSeedService.js');

function createConnection(queryImplementation) {
  return {
    beginTransaction: vi.fn().mockResolvedValue(undefined),
    commit: vi.fn().mockResolvedValue(undefined),
    rollback: vi.fn().mockResolvedValue(undefined),
    release: vi.fn(),
    query: vi.fn(queryImplementation),
  };
}

function compactSql(sql) {
  return String(sql).replace(/\s+/g, ' ').trim();
}

describe('newUserSeedService', () => {
  beforeEach(() => {
    poolQuery.mockReset();
    getConnection.mockReset();
    putObjectBodyToObs.mockReset();
  });

  it('按语言生成小而完整的四类示例内容', () => {
    const zh = buildNewUserSeedContent({ lang: 'zh-CN', siteUrl: 'https://demo.test/' });
    const en = buildNewUserSeedContent({ lang: 'en-US', siteUrl: 'https://demo.test/' });

    expect(zh).toMatchObject({
      lang: 'zh-CN',
      cloud: { folderName: '轻笺示例', fileName: '轻笺使用说明.md' },
    });
    expect(zh.tags).toHaveLength(4);
    expect(zh.bookmarks).toHaveLength(3);
    expect(zh.notes).toHaveLength(2);
    expect(zh.bookmarks[0].url).toBe('https://demo.test/help');

    expect(en).toMatchObject({
      lang: 'en-US',
      cloud: { folderName: 'Light Note Examples', fileName: 'Getting Started.md' },
    });
    expect(en.notes.some((note) => note.type === 'markdown')).toBe(true);
  });

  it('在同一个事务中创建标签、书签、笔记、文件夹及标签关系', async () => {
    const connection = createConnection(async (sql) => {
      const text = compactSql(sql);
      if (text === 'SELECT id FROM user WHERE id = ? LIMIT 1 FOR UPDATE') return [[{ id: 'user-1' }]];
      if (text === 'SELECT id FROM note WHERE id = ? AND create_by = ? LIMIT 1') return [[]];
      if (text === 'INSERT INTO folders SET ?') return [{ insertId: 42 }];
      return [{ affectedRows: 1 }];
    });
    getConnection.mockResolvedValue(connection);

    const result = await seedNewUserWorkspaceData({
      userId: 'user-1',
      lang: 'zh-CN',
      siteUrl: 'https://demo.test',
    });

    expect(result).toEqual({
      created: true,
      version: NEW_USER_SEED_VERSION,
      folderId: 42,
      counts: { tags: 4, bookmarks: 3, notes: 2, folders: 1 },
    });
    expect(connection.beginTransaction).toHaveBeenCalledTimes(1);
    expect(connection.commit).toHaveBeenCalledTimes(1);
    expect(connection.rollback).not.toHaveBeenCalled();
    expect(connection.release).toHaveBeenCalledTimes(1);

    const tagInserts = connection.query.mock.calls.filter(([sql]) => sql === 'INSERT INTO tag SET ?');
    const bookmarkInserts = connection.query.mock.calls.filter(([sql]) => sql === 'INSERT INTO bookmark SET ?');
    const noteInserts = connection.query.mock.calls.filter(([sql]) => sql === 'INSERT INTO note SET ?');
    const relationInserts = connection.query.mock.calls.filter(([sql]) =>
      compactSql(sql).startsWith('INSERT IGNORE INTO resource_tag_relations'),
    );

    expect(tagInserts).toHaveLength(4);
    expect(bookmarkInserts).toHaveLength(3);
    expect(noteInserts).toHaveLength(2);
    expect(relationInserts).toHaveLength(5);
    expect(new Set(tagInserts.map(([, [row]]) => row.id)).size).toBe(4);
    expect(bookmarkInserts[0][1][0]).toMatchObject({
      user_id: 'user-1',
      url: 'https://demo.test/help',
      del_flag: 0,
    });
    expect(noteInserts.map(([, [row]]) => row.type).sort()).toEqual(['html', 'markdown']);
    expect(relationInserts.flatMap(([, [values]]) => values).every((row) => row[4] === 'onboarding')).toBe(true);
  });

  it('欢迎笔记幂等标记已存在时不重复写入', async () => {
    const connection = createConnection(async (sql) => {
      const text = compactSql(sql);
      if (text === 'SELECT id FROM user WHERE id = ? LIMIT 1 FOR UPDATE') return [[{ id: 'user-1' }]];
      if (text === 'SELECT id FROM note WHERE id = ? AND create_by = ? LIMIT 1') return [[{ id: 'marker' }]];
      if (text.startsWith('SELECT id FROM folders')) return [[{ id: 9 }]];
      return [{ affectedRows: 1 }];
    });
    getConnection.mockResolvedValue(connection);

    const result = await seedNewUserWorkspaceData({ userId: 'user-1', lang: 'zh-CN' });

    expect(result).toMatchObject({ created: false, folderId: 9 });
    expect(connection.query.mock.calls.some(([sql]) => compactSql(sql).startsWith('INSERT INTO'))).toBe(false);
    expect(connection.commit).toHaveBeenCalledTimes(1);
  });

  it('任一数据库写入失败时回滚整批示例数据', async () => {
    const expectedError = Object.assign(new Error('tag insert failed'), { code: 'ER_BAD_FIELD_ERROR' });
    const connection = createConnection(async (sql) => {
      const text = compactSql(sql);
      if (text === 'SELECT id FROM user WHERE id = ? LIMIT 1 FOR UPDATE') return [[{ id: 'user-1' }]];
      if (text === 'SELECT id FROM note WHERE id = ? AND create_by = ? LIMIT 1') return [[]];
      if (text === 'INSERT INTO tag SET ?') throw expectedError;
      return [{ affectedRows: 1 }];
    });
    getConnection.mockResolvedValue(connection);

    await expect(seedNewUserWorkspaceData({ userId: 'user-1' })).rejects.toBe(expectedError);
    expect(connection.rollback).toHaveBeenCalledTimes(1);
    expect(connection.commit).not.toHaveBeenCalled();
    expect(connection.release).toHaveBeenCalledTimes(1);
  });

  it('真实示例文件上传成功后才写 files，并关联入门标签', async () => {
    poolQuery.mockResolvedValue([[]]);
    putObjectBodyToObs.mockResolvedValue({});
    const connection = createConnection(async (sql) => {
      const text = compactSql(sql);
      if (text === 'SELECT id FROM user WHERE id = ? LIMIT 1 FOR UPDATE') return [[{ id: 'user-1' }]];
      if (text.startsWith('SELECT id, folder_id FROM files')) return [[]];
      if (text === 'SELECT id FROM folders WHERE id = ? AND create_by = ? AND del_flag = 0 LIMIT 1') {
        return [[{ id: 42 }]];
      }
      if (text === 'INSERT INTO files SET ?') return [{ insertId: 7 }];
      if (text === 'SELECT id FROM tag WHERE id = ? AND user_id = ? AND del_flag = 0 LIMIT 1') {
        return [[{ id: 'tag-1' }]];
      }
      return [{ affectedRows: 1 }];
    });
    getConnection.mockResolvedValue(connection);

    const result = await seedNewUserCloudFile({ userId: 'user-1', lang: 'zh-CN', folderId: 42 });

    expect(result).toEqual({ created: true, id: 7, folderId: 42 });
    expect(putObjectBodyToObs).toHaveBeenCalledTimes(1);
    const [objectKey, body, contentType] = putObjectBodyToObs.mock.calls[0];
    expect(objectKey).toBe(`files/user-1/system/onboarding-${NEW_USER_SEED_VERSION}.md`);
    expect(Buffer.isBuffer(body)).toBe(true);
    expect(body.toString('utf8')).toContain('# 轻笺使用说明');
    expect(contentType).toBe('text/markdown');

    const fileInsert = connection.query.mock.calls.find(([sql]) => sql === 'INSERT INTO files SET ?');
    expect(fileInsert[1][0]).toMatchObject({
      create_by: 'user-1',
      file_name: '轻笺使用说明.md',
      file_type: 'text/markdown',
      file_size: body.length,
      folder_id: 42,
      obs_key: objectKey,
      del_flag: 0,
    });
    expect(fileInsert[1][0].share_token).toMatch(/^[a-f0-9]{32}$/);
    expect(
      connection.query.mock.calls.some(([sql]) =>
        compactSql(sql).startsWith('INSERT IGNORE INTO resource_tag_relations'),
      ),
    ).toBe(true);
    expect(putObjectBodyToObs.mock.invocationCallOrder[0]).toBeLessThan(getConnection.mock.invocationCallOrder[0]);
  });

  it('已有同一 OBS key 的示例文件时跳过上传和写库', async () => {
    poolQuery.mockResolvedValue([[{ id: 8, folder_id: 3 }]]);

    const result = await seedNewUserCloudFile({ userId: 'user-1', lang: 'zh-CN' });

    expect(result).toEqual({ created: false, id: 8, folderId: 3 });
    expect(putObjectBodyToObs).not.toHaveBeenCalled();
    expect(getConnection).not.toHaveBeenCalled();
  });

  it('并发调用在上传后发现文件已提交时不重复插入', async () => {
    poolQuery.mockResolvedValue([[]]);
    putObjectBodyToObs.mockResolvedValue({});
    const connection = createConnection(async (sql) => {
      const text = compactSql(sql);
      if (text === 'SELECT id FROM user WHERE id = ? LIMIT 1 FOR UPDATE') return [[{ id: 'user-1' }]];
      if (text.startsWith('SELECT id, folder_id FROM files')) return [[{ id: 8, folder_id: 3 }]];
      return [{ affectedRows: 1 }];
    });
    getConnection.mockResolvedValue(connection);

    const result = await seedNewUserCloudFile({ userId: 'user-1' });

    expect(result).toEqual({ created: false, id: 8, folderId: 3 });
    expect(putObjectBodyToObs).toHaveBeenCalledTimes(1);
    expect(connection.query.mock.calls.some(([sql]) => sql === 'INSERT INTO files SET ?')).toBe(false);
    expect(connection.commit).toHaveBeenCalledTimes(1);
  });

  it('OBS 上传失败时不创建文件数据库记录', async () => {
    poolQuery.mockResolvedValue([[]]);
    const uploadError = Object.assign(new Error('upload failed'), { code: 'OBS_UPLOAD_FAILED' });
    putObjectBodyToObs.mockRejectedValue(uploadError);

    await expect(seedNewUserCloudFile({ userId: 'user-1' })).rejects.toBe(uploadError);
    expect(getConnection).not.toHaveBeenCalled();
  });
});
