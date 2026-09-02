import { beforeEach, describe, expect, it, vi } from 'vitest';

const query = vi.fn();
const cleanupInvalidOwnerResourcesNow = vi.fn();
const ensureResourceGovernanceSchema = vi.fn();

vi.mock('../../db/index.js', () => ({ default: { query } }));
vi.mock('../accountDeletion.js', () => ({ cleanupInvalidOwnerResourcesNow }));
vi.mock('../resourceGovernanceSchema.js', () => ({ ensureResourceGovernanceSchema }));

const { cleanupInvalidOwnerFindings } = await import('./invalidOwnerCleanupService.js');

beforeEach(() => {
  vi.clearAllMocks();
  ensureResourceGovernanceSchema.mockResolvedValue(undefined);
  cleanupInvalidOwnerResourcesNow.mockResolvedValue({ requestId: 'request-1', claimed: true, completed: true });
});

describe('失效账号资源治理清理', () => {
  it('必须输入与候选数量匹配的二次确认短语', async () => {
    await expect(
      cleanupInvalidOwnerFindings({
        findingIds: ['finding-1'],
        confirmationPhrase: '删除失效资源',
        actorUserId: 'root-1',
      }),
    ).rejects.toMatchObject({ code: 'RESOURCE_GOVERNANCE_CONFIRMATION_MISMATCH' });
    expect(query).not.toHaveBeenCalled();
    expect(cleanupInvalidOwnerResourcesNow).not.toHaveBeenCalled();
  });

  it('同一失效账号的多条候选只执行一次账号级清理并统一关闭候选', async () => {
    query.mockImplementation(async (sql) => {
      if (sql.includes('FROM resource_governance_findings')) {
        return [
          [
            {
              id: 'finding-note',
              issue_code: 'FORMALLY_DELETED_OWNER_HAS_RESOURCES',
              resource_type: 'note',
              target_id: 'owner-1',
              owner_id: 'owner-1',
              state: 'open',
            },
            {
              id: 'finding-job',
              issue_code: 'ACCOUNT_DELETION_STALLED',
              resource_type: 'account_job',
              target_id: 'request-1',
              owner_id: 'owner-1',
              state: 'open',
            },
          ],
        ];
      }
      if (sql.includes('UPDATE resource_governance_findings')) return [{ affectedRows: 2 }];
      if (sql.includes('INSERT INTO resource_governance_audit')) return [{ affectedRows: 1 }];
      throw new Error(`未覆盖的测试 SQL: ${sql}`);
    });

    const result = await cleanupInvalidOwnerFindings({
      findingIds: ['finding-note', 'finding-job'],
      confirmationPhrase: '删除 2 项失效资源',
      actorUserId: 'root-1',
    });

    expect(cleanupInvalidOwnerResourcesNow).toHaveBeenCalledTimes(1);
    expect(cleanupInvalidOwnerResourcesNow).toHaveBeenCalledWith({
      userId: 'owner-1',
      expectedRequestId: 'request-1',
      db: expect.any(Object),
    });
    expect(result).toMatchObject({ total: 2, ownerTotal: 1, completed: 2, failed: 0 });
    const resolveCall = query.mock.calls.find(([sql]) => sql.includes('UPDATE resource_governance_findings'));
    expect(resolveCall?.[1]).toEqual([
      'root-1',
      'owner-1',
      'OWNER_MISSING',
      'FORMALLY_DELETED_OWNER_HAS_RESOURCES',
      'ACCOUNT_DELETION_STALLED',
    ]);
  });

  it('历史软删除误报不再拥有清理授权', async () => {
    query.mockResolvedValueOnce([
      [
        {
          id: 'legacy-finding',
          issue_code: 'SOFT_DELETED_OWNER_HAS_RESOURCES',
          resource_type: 'note',
          target_id: 'owner-1',
          owner_id: 'owner-1',
          state: 'open',
        },
      ],
    ]);

    await expect(
      cleanupInvalidOwnerFindings({
        findingIds: ['legacy-finding'],
        confirmationPhrase: '删除 1 项失效资源',
        actorUserId: 'root-1',
      }),
    ).rejects.toMatchObject({ code: 'RESOURCE_GOVERNANCE_FINDING_SCOPE_CHANGED' });
    expect(cleanupInvalidOwnerResourcesNow).not.toHaveBeenCalled();
  });
});
