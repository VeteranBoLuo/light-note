import { beforeEach, describe, expect, it, vi } from 'vitest';

const poolQuery = vi.fn();
const getConnection = vi.fn();
const redisValues = new Map();
const redisClient = {
  get: vi.fn(async (key) => redisValues.get(key) || null),
  setEx: vi.fn(async (key, _ttl, value) => {
    redisValues.set(key, value);
    return 'OK';
  }),
  del: vi.fn(async (key) => {
    redisValues.delete(key);
    return 1;
  }),
};
const sendTrackedEmail = vi.fn();
const deleteObjectFromObs = vi.fn();
const cleanupOrphanNoteImages = vi.fn();
const extractNoteImageUrls = vi.fn();
const cleanupBookmarkIconFiles = vi.fn();

vi.mock('../db/index.js', () => ({ default: { query: poolQuery, getConnection } }));
vi.mock('./redisClient.js', () => ({ default: redisClient }));
vi.mock('./emailDelivery.js', () => ({ sendTrackedEmail }));
vi.mock('./obsClient.js', () => ({
  buildObjectKey: vi.fn((userId, fileName) => `files/${userId}/${fileName}`),
  deleteObjectFromObs,
}));
vi.mock('./noteImages.js', () => ({
  cleanupOrphanNoteImages,
  extractNoteImageUrls,
}));
vi.mock('./bookmarkIconService.js', () => ({ cleanupBookmarkIconFiles }));

const {
  ACCOUNT_DELETION_CONFIRMATION_TEXT,
  cleanupCompletedAccountDeletionRequests,
  processAccountDeletionRequest,
  purgeOwnedResources,
  requestAccountDeletion,
  sendAccountDeletionCode,
} = await import('./accountDeletion.js');

function createConnection(queryImplementation) {
  return {
    beginTransaction: vi.fn().mockResolvedValue(undefined),
    commit: vi.fn().mockResolvedValue(undefined),
    rollback: vi.fn().mockResolvedValue(undefined),
    release: vi.fn(),
    query: vi.fn(queryImplementation),
  };
}

function extractCodeFromEmail() {
  const html = String(sendTrackedEmail.mock.calls.at(-1)?.[0]?.html || '');
  const match = html.match(/<strong[^>]*>(\d{6})<\/strong>/);
  if (!match) throw new Error('测试邮件中没有验证码');
  return match[1];
}

beforeEach(() => {
  vi.clearAllMocks();
  redisValues.clear();
  cleanupOrphanNoteImages.mockResolvedValue({ deleted: 0, kept: 0, skipped: 0, failed: 0 });
  cleanupBookmarkIconFiles.mockResolvedValue({ deleted: 0, kept: 0, skipped: 0, failed: 0 });
  deleteObjectFromObs.mockResolvedValue(undefined);
});

describe('账号注销验证码', () => {
  it('只发到当前账号邮箱，Redis 只保存加盐摘要', async () => {
    poolQuery.mockResolvedValueOnce([[{ id: 'user-1', email: 'Owner@Example.com', role: 'user', del_flag: 0 }]]);

    const result = await sendAccountDeletionCode({ userId: 'user-1' });
    const code = extractCodeFromEmail();
    const [key, ttl, rawChallenge] = redisClient.setEx.mock.calls[0];
    const challenge = JSON.parse(rawChallenge);

    expect(result).toEqual({ maskedEmail: 'ow***@example.com', expiresIn: 300 });
    expect(sendTrackedEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        recipient: 'owner@example.com',
        emailType: 'account_deletion',
      }),
    );
    expect(key).toBe('account:deletion:code:user-1');
    expect(ttl).toBe(300);
    expect(challenge).not.toHaveProperty('code');
    expect(challenge.digest).toMatch(/^[a-f0-9]{64}$/);
    expect(challenge.digest).not.toBe(code);
    expect(challenge.emailHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('邮件发送失败会同步销毁未投递的验证码', async () => {
    poolQuery.mockResolvedValueOnce([[{ id: 'user-1', email: 'owner@example.com', role: 'user', del_flag: 0 }]]);
    sendTrackedEmail.mockRejectedValueOnce(Object.assign(new Error('smtp unavailable'), { code: 'SMTP_DOWN' }));

    await expect(sendAccountDeletionCode({ userId: 'user-1' })).rejects.toMatchObject({ code: 'SMTP_DOWN' });
    expect(redisClient.del).toHaveBeenCalledWith('account:deletion:code:user-1');
    expect(redisValues.has('account:deletion:code:user-1')).toBe(false);
  });
});

describe('账号注销提交', () => {
  it('必须输入精确确认文字', async () => {
    await expect(
      requestAccountDeletion({ userId: 'user-1', code: '123456', confirmation: '确认注销' }),
    ).rejects.toMatchObject({ code: 'ACCOUNT_DELETION_CONFIRMATION_MISMATCH' });
    expect(redisClient.get).not.toHaveBeenCalled();
    expect(getConnection).not.toHaveBeenCalled();
  });

  it('验证码错误时不会进入数据库注销事务', async () => {
    poolQuery.mockResolvedValueOnce([[{ id: 'user-1', email: 'owner@example.com', role: 'user', del_flag: 0 }]]);
    await sendAccountDeletionCode({ userId: 'user-1' });
    const issuedCode = extractCodeFromEmail();
    const wrongCode = issuedCode === '000000' ? '000001' : '000000';

    await expect(
      requestAccountDeletion({
        userId: 'user-1',
        code: wrongCode,
        confirmation: ACCOUNT_DELETION_CONFIRMATION_TEXT,
      }),
    ).rejects.toMatchObject({ code: 'ACCOUNT_DELETION_CODE_MISMATCH' });
    expect(getConnection).not.toHaveBeenCalled();
  });

  it('验证码通过后同事务创建清理任务并去标识化账号', async () => {
    poolQuery.mockResolvedValueOnce([[{ id: 'user-1', email: 'owner@example.com', role: 'user', del_flag: 0 }]]);
    await sendAccountDeletionCode({ userId: 'user-1' });
    const code = extractCodeFromEmail();

    const connection = createConnection(async (sql) => {
      if (sql.includes('FROM user') && sql.includes('FOR UPDATE')) {
        return [[{ id: 'user-1', email: 'owner@example.com', role: 'user', del_flag: 0 }]];
      }
      if (sql.includes('information_schema.TABLES')) {
        return [
          [{ tableName: 'account_deletion_requests' }, { tableName: 'email_delivery_logs' }, { tableName: 'user' }],
        ];
      }
      if (sql.includes('INSERT INTO account_deletion_requests')) return [{ affectedRows: 1 }];
      if (sql.includes('DELETE FROM email_delivery_logs')) return [{ affectedRows: 1 }];
      if (sql.includes('UPDATE user')) return [{ affectedRows: 1 }];
      throw new Error(`未覆盖的测试 SQL: ${sql}`);
    });
    getConnection.mockResolvedValue(connection);

    const result = await requestAccountDeletion({
      userId: 'user-1',
      code,
      confirmation: ACCOUNT_DELETION_CONFIRMATION_TEXT,
    });

    expect(result.requestId).toMatch(/^[a-f0-9-]{36}$/);
    expect(result.status).toBe('pending');
    expect(connection.beginTransaction).toHaveBeenCalledTimes(1);
    expect(connection.commit).toHaveBeenCalledTimes(1);
    expect(connection.rollback).not.toHaveBeenCalled();
    expect(connection.release).toHaveBeenCalledTimes(1);
    expect(connection.query.mock.calls.some(([sql]) => sql.includes("role = 'deleted'"))).toBe(true);
    expect(connection.query.mock.calls.some(([sql]) => sql.includes('email = NULL'))).toBe(true);
    expect(redisValues.has('account:deletion:code:user-1')).toBe(false);
  });
});

describe('账号注销后台清理', () => {
  it('跨排序规则清理引用时显式统一 utf8mb4_unicode_ci，避免注销任务卡在 retry_wait', async () => {
    const connection = createConnection(async () => [{ affectedRows: 0 }]);
    const tables = new Set(['note_resource_refs', 'bookmark', 'note', 'files', 'note_versions']);

    await purgeOwnedResources(connection, tables, 'user-1');

    const refSql = connection.query.mock.calls.find(([sql]) => sql.includes('DELETE FROM note_resource_refs'))?.[0];
    const versionSql = connection.query.mock.calls.find(([sql]) => sql.includes('DELETE FROM note_versions'))?.[0];
    expect(refSql).toContain('CONVERT(target_id USING utf8mb4) COLLATE utf8mb4_unicode_ci');
    expect(refSql).toContain('CONVERT(id USING utf8mb4) COLLATE utf8mb4_unicode_ci');
    expect(versionSql).toContain('CONVERT(note_id USING utf8mb4) COLLATE utf8mb4_unicode_ci');
  });

  it('已完成的清理任务记录只保留 180 天并分批删除', async () => {
    poolQuery.mockResolvedValueOnce([{ affectedRows: 12 }]);

    await expect(cleanupCompletedAccountDeletionRequests()).resolves.toBe(12);
    expect(poolQuery).toHaveBeenCalledWith(expect.stringContaining('INTERVAL 180 DAY'));
    expect(poolQuery.mock.calls[0][0]).toContain('LIMIT 500');
  });

  it('数据库与物理文件均清理成功后才标记 completed 并清空重试载荷', async () => {
    const requestId = 'request-1';
    poolQuery.mockImplementation(async (sql) => {
      if (sql.includes("SET status = 'processing'")) return [{ affectedRows: 1 }];
      if (sql.includes('SELECT id, user_id, object_keys_json')) {
        return [
          [
            {
              id: requestId,
              user_id: 'user-1',
              object_keys_json: '["files/user-1/a.png"]',
              note_image_urls_json: '["https://boluo66.top/uploads/note-a.png"]',
              bookmark_icons_json: '[{"id":"bookmark-1","iconUrl":"/uploads/bookmark-icon-a.png"}]',
              attempts: 1,
            },
          ],
        ];
      }
      if (sql.includes("SET status = 'completed'")) return [{ affectedRows: 1 }];
      throw new Error(`未覆盖的测试 SQL: ${sql}`);
    });

    const connection = createConnection(async (sql) => {
      if (sql.includes('SELECT role, del_flag') && sql.includes('FOR UPDATE')) {
        return [[{ role: 'deleted', del_flag: 1 }]];
      }
      if (sql.includes('information_schema.TABLES')) {
        return [
          [
            { tableName: 'ai_token_reservations' },
            { tableName: 'admin_user_remarks' },
            { tableName: 'note' },
            { tableName: 'folders' },
            { tableName: 'user' },
          ],
        ];
      }
      if (sql.includes('DELETE FROM ai_token_reservations')) return [{ affectedRows: 1 }];
      if (sql.includes('DELETE FROM admin_user_remarks')) return [{ affectedRows: 1 }];
      if (sql.includes('DELETE FROM note WHERE create_by')) return [{ affectedRows: 3 }];
      if (sql.includes('DELETE FROM folders')) return [{ affectedRows: 1 }];
      if (sql.includes('DELETE FROM user')) return [{ affectedRows: 1 }];
      throw new Error(`未覆盖的测试 SQL: ${sql}`);
    });
    getConnection.mockResolvedValue(connection);

    const result = await processAccountDeletionRequest(requestId);

    expect(result).toEqual({ claimed: true, completed: true });
    expect(deleteObjectFromObs).toHaveBeenCalledWith('files/user-1/a.png');
    expect(cleanupOrphanNoteImages).toHaveBeenCalledWith(['https://boluo66.top/uploads/note-a.png'], { strict: true });
    expect(cleanupBookmarkIconFiles).toHaveBeenCalledWith([
      { id: 'bookmark-1', iconUrl: '/uploads/bookmark-icon-a.png' },
    ]);
    const reservationCall = connection.query.mock.calls.find(([sql]) =>
      sql.includes('DELETE FROM ai_token_reservations'),
    );
    expect(reservationCall?.[0]).toContain('JSON_VALID(subjects_json)');
    expect(reservationCall?.[0]).toContain('JSON_CONTAINS');
    expect(reservationCall?.[1]).toEqual(['user-1']);
    const remarkCall = connection.query.mock.calls.find(([sql]) => sql.includes('DELETE FROM admin_user_remarks'));
    expect(remarkCall?.[1]).toEqual(['user-1', 'user-1']);
    expect(connection.query.mock.calls.some(([sql]) => sql.includes('DELETE FROM folders'))).toBe(true);
    expect(connection.query.mock.calls.some(([sql]) => sql.includes('DELETE FROM note WHERE create_by'))).toBe(true);
    const completeCall = poolQuery.mock.calls.find(([sql]) => sql.includes("SET status = 'completed'"));
    expect(completeCall?.[0]).toContain("object_keys_json = '[]'");
    expect(completeCall?.[0]).toContain("note_image_urls_json = '[]'");
    expect(completeCall?.[0]).toContain("bookmark_icons_json = '[]'");
    expect(completeCall?.[0]).toContain("status = 'processing'");
  });

  it('对象存储失败时进入 retry_wait，不会伪装成已完成', async () => {
    const requestId = 'request-retry';
    poolQuery.mockImplementation(async (sql) => {
      if (sql.includes("SET status = 'processing'")) return [{ affectedRows: 1 }];
      if (sql.includes('SELECT id, user_id, object_keys_json')) {
        return [
          [
            {
              id: requestId,
              user_id: 'user-1',
              object_keys_json: '["files/user-1/a.png"]',
              note_image_urls_json: '[]',
              bookmark_icons_json: '[]',
              attempts: 1,
            },
          ],
        ];
      }
      if (sql.includes("SET status = 'retry_wait'")) return [{ affectedRows: 1 }];
      throw new Error(`未覆盖的测试 SQL: ${sql}`);
    });
    const connection = createConnection(async (sql) => {
      if (sql.includes('SELECT role, del_flag') && sql.includes('FOR UPDATE')) {
        return [[{ role: 'deleted', del_flag: 1 }]];
      }
      if (sql.includes('information_schema.TABLES')) return [[{ tableName: 'user' }]];
      if (sql.includes('DELETE FROM user')) return [{ affectedRows: 1 }];
      throw new Error(`未覆盖的测试 SQL: ${sql}`);
    });
    getConnection.mockResolvedValue(connection);
    deleteObjectFromObs.mockRejectedValueOnce(Object.assign(new Error('OBS timeout'), { code: 'OBS_TIMEOUT' }));

    await expect(processAccountDeletionRequest(requestId)).rejects.toMatchObject({
      code: 'ACCOUNT_DELETION_OBJECT_CLEANUP_FAILED',
    });
    expect(poolQuery.mock.calls.some(([sql]) => sql.includes("SET status = 'retry_wait'"))).toBe(true);
    expect(poolQuery.mock.calls.some(([sql]) => sql.includes("SET status = 'completed'"))).toBe(false);
  });

  it('注销任务数据异常指向正常账号时强制阻断，不删除任何账号资源', async () => {
    const requestId = 'request-active-account';
    poolQuery.mockImplementation(async (sql) => {
      if (sql.includes("SET status = 'processing'")) return [{ affectedRows: 1 }];
      if (sql.includes('SELECT id, user_id, object_keys_json')) {
        return [
          [
            {
              id: requestId,
              user_id: 'user-1',
              object_keys_json: '[]',
              note_image_urls_json: '[]',
              bookmark_icons_json: '[]',
              attempts: 1,
            },
          ],
        ];
      }
      if (sql.includes("SET status = 'retry_wait'")) return [{ affectedRows: 1 }];
      throw new Error(`未覆盖的测试 SQL: ${sql}`);
    });
    const connection = createConnection(async (sql) => {
      if (sql.includes('SELECT role, del_flag') && sql.includes('FOR UPDATE')) {
        return [[{ role: 'user', del_flag: 0 }]];
      }
      throw new Error(`正常账号阻断后不应继续执行 SQL: ${sql}`);
    });
    getConnection.mockResolvedValue(connection);

    await expect(processAccountDeletionRequest(requestId)).rejects.toMatchObject({
      code: 'ACCOUNT_DELETION_ACTIVE_ACCOUNT_BLOCKED',
    });
    expect(connection.query.mock.calls.some(([sql]) => sql.includes('DELETE FROM note'))).toBe(false);
    expect(connection.query.mock.calls.some(([sql]) => sql.includes('DELETE FROM user'))).toBe(false);
    expect(connection.rollback).toHaveBeenCalledTimes(1);
    expect(poolQuery.mock.calls.some(([sql]) => sql.includes("SET status = 'retry_wait'"))).toBe(true);
  });

  it('后台软删除账号允许清理资源，但用户行删除条件仍只匹配正式注销账号', async () => {
    const requestId = 'request-soft-deleted-account';
    poolQuery.mockImplementation(async (sql) => {
      if (sql.includes("SET status = 'processing'")) return [{ affectedRows: 1 }];
      if (sql.includes('SELECT id, user_id, object_keys_json')) {
        return [
          [
            {
              id: requestId,
              user_id: 'user-1',
              object_keys_json: '[]',
              note_image_urls_json: '[]',
              bookmark_icons_json: '[]',
              attempts: 1,
            },
          ],
        ];
      }
      if (sql.includes("SET status = 'completed'")) return [{ affectedRows: 1 }];
      throw new Error(`未覆盖的测试 SQL: ${sql}`);
    });
    const connection = createConnection(async (sql) => {
      if (sql.includes('SELECT role, del_flag') && sql.includes('FOR UPDATE')) {
        return [[{ role: 'user', del_flag: 1 }]];
      }
      if (sql.includes('information_schema.TABLES')) return [[{ tableName: 'note' }, { tableName: 'user' }]];
      if (sql.includes('DELETE FROM note WHERE create_by')) return [{ affectedRows: 2 }];
      if (sql.includes('DELETE FROM user')) return [{ affectedRows: 0 }];
      throw new Error(`未覆盖的测试 SQL: ${sql}`);
    });
    getConnection.mockResolvedValue(connection);

    await expect(processAccountDeletionRequest(requestId)).resolves.toEqual({ claimed: true, completed: true });
    expect(connection.query.mock.calls.some(([sql]) => sql.includes('DELETE FROM note WHERE create_by'))).toBe(true);
    const userDeleteSql = connection.query.mock.calls.find(([sql]) => sql.includes('DELETE FROM user'))?.[0];
    expect(userDeleteSql).toContain("role = 'deleted'");
    expect(userDeleteSql).toContain('del_flag = 1');
  });

  it('清理任务载荷损坏时进入 retry_wait，不会丢弃待删除对象', async () => {
    const requestId = 'request-invalid-payload';
    poolQuery.mockImplementation(async (sql) => {
      if (sql.includes("SET status = 'processing'")) return [{ affectedRows: 1 }];
      if (sql.includes('SELECT id, user_id, object_keys_json')) {
        return [
          [
            {
              id: requestId,
              user_id: 'user-1',
              object_keys_json: '{invalid-json',
              note_image_urls_json: '[]',
              bookmark_icons_json: '[]',
              attempts: 1,
            },
          ],
        ];
      }
      if (sql.includes("SET status = 'retry_wait'")) return [{ affectedRows: 1 }];
      throw new Error(`未覆盖的测试 SQL: ${sql}`);
    });

    await expect(processAccountDeletionRequest(requestId)).rejects.toMatchObject({
      code: 'ACCOUNT_DELETION_TASK_PAYLOAD_INVALID',
      fieldName: 'object_keys_json',
    });
    expect(getConnection).not.toHaveBeenCalled();
    expect(deleteObjectFromObs).not.toHaveBeenCalled();
    expect(poolQuery.mock.calls.some(([sql]) => sql.includes("SET status = 'retry_wait'"))).toBe(true);
    expect(poolQuery.mock.calls.some(([sql]) => sql.includes("SET status = 'completed'"))).toBe(false);
  });
});
