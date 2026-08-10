import { beforeEach, describe, expect, it, vi } from 'vitest';

const poolQuery = vi.fn();
const lstat = vi.fn();
const unlink = vi.fn();

vi.mock('../../db/index.js', () => ({
  default: {
    query: poolQuery,
    getConnection: vi.fn(),
  },
}));
vi.mock('node:fs', () => ({ promises: { lstat, unlink } }));

const { createCleanupJob, executeCleanupItem, previewCleanupJob, verifyPreview } = await import('./jobService.js');
const { evidenceHash } = await import('./safety.js');

const env = {
  RESOURCE_GOVERNANCE_CLEANUP_ENABLED: 'true',
  RESOURCE_GOVERNANCE_TOKEN_SECRET: 'resource-governance-test-secret-32-chars',
};

function finding() {
  return {
    id: 'finding-1',
    issue_code: 'LOCAL_IMAGE_UNREFERENCED',
    resource_type: 'image',
    target_id: 'note-old.png',
    target_locator: JSON.stringify({ root: '/www/wwwroot/images', fileName: 'note-old.png' }),
    risk_level: 'safe',
    state: 'open',
    estimated_bytes: 128,
    evidence_json: JSON.stringify({ fileName: 'note-old.png', referenced: false }),
    observation_count: 2,
    last_verified_at: '2026-08-09T00:00:00.000Z',
  };
}

function queuedItem() {
  const item = { ...finding(), state: 'queued', finding_id: 'finding-1' };
  return { ...item, precondition_hash: evidenceHash(item) };
}

function createDb({ referencedAt = -1 } = {}) {
  let referenceQuery = 0;
  return {
    query: vi.fn(async (sql) => {
      const statement = String(sql).trim();
      if (statement.startsWith('CREATE TABLE')) return [{ affectedRows: 0 }];
      if (statement.startsWith('SELECT id, issue_code')) return [[finding()]];
      if (statement.startsWith('SELECT 1 FROM')) {
        const response = referenceQuery === referencedAt ? [[{ one: 1 }]] : [[]];
        referenceQuery += 1;
        return response;
      }
      throw new Error(`unexpected query: ${statement}`);
    }),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  lstat.mockResolvedValue({
    isSymbolicLink: () => false,
    isFile: () => true,
    size: 128,
    mtimeMs: new Date('2026-08-01T00:00:00.000Z').getTime(),
    mtime: new Date('2026-08-01T00:00:00.000Z'),
  });
});

describe('resource governance cleanup preview', () => {
  it('短时确认绑定 Root 与登录会话，不能跨会话复用', async () => {
    const db = createDb();
    const preview = await previewCleanupJob({
      findingIds: ['finding-1'],
      actorUserId: 'root-1',
      sessionId: 'session-1',
      db,
      env,
    });

    expect(preview).toMatchObject({ count: 1, estimatedBytes: 128, confirmationPhrase: '清理 1 项' });
    expect(verifyPreview(preview.previewToken, env)).toMatchObject({
      actorUserId: 'root-1',
      sessionId: 'session-1',
      riskLevel: 'safe',
    });
    await expect(
      createCleanupJob({
        previewToken: preview.previewToken,
        confirmationPhrase: preview.confirmationPhrase,
        actorUserId: 'root-1',
        sessionId: 'session-2',
        db,
        env,
      }),
    ).rejects.toMatchObject({ code: 'RESOURCE_GOVERNANCE_PREVIEW_OWNER_MISMATCH', status: 403 });
  });

  it('任一正文或关系重新出现引用时 preview 立即失败关闭', async () => {
    const db = createDb({ referencedAt: 1 });
    await expect(
      previewCleanupJob({
        findingIds: ['finding-1'],
        actorUserId: 'root-1',
        sessionId: 'session-1',
        db,
        env,
      }),
    ).rejects.toMatchObject({ code: 'IMAGE_REFERENCED', status: 409 });
    expect(unlink).not.toHaveBeenCalled();
  });
});

describe('resource governance cleanup execution', () => {
  it('unlink 前第二轮引用检查命中时跳过，绝不删除文件', async () => {
    const db = createDb({ referencedAt: 5 });
    const outcome = await executeCleanupItem({ id: 'job-1' }, queuedItem(), db);

    expect(outcome).toMatchObject({ status: 'skipped_referenced', resultCode: 'IMAGE_REFERENCED' });
    expect(lstat).toHaveBeenCalledTimes(2);
    expect(unlink).not.toHaveBeenCalled();
  });

  it('引用检查后同名文件身份变化时跳过，绝不删除替换后的文件', async () => {
    lstat
      .mockResolvedValueOnce({
        isSymbolicLink: () => false,
        isFile: () => true,
        size: 128,
        mtimeMs: new Date('2026-08-01T00:00:00.000Z').getTime(),
        mtime: new Date('2026-08-01T00:00:00.000Z'),
        ino: 10,
        dev: 1,
      })
      .mockResolvedValueOnce({
        isSymbolicLink: () => false,
        isFile: () => true,
        size: 128,
        mtimeMs: new Date('2026-08-02T00:00:00.000Z').getTime(),
        mtime: new Date('2026-08-02T00:00:00.000Z'),
        ino: 11,
        dev: 1,
      });

    const outcome = await executeCleanupItem({ id: 'job-1' }, queuedItem(), createDb());

    expect(outcome).toMatchObject({ status: 'skipped_changed', resultCode: 'IMAGE_IDENTITY_CHANGED' });
    expect(unlink).not.toHaveBeenCalled();
  });
});
