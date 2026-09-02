import { describe, expect, it, vi } from 'vitest';
import { getGovernanceFinding, runGovernanceScan } from './scanService.js';

describe('资源治理账号完整性扫描', () => {
  it('只记录正式注销且不在清理工作流中的账号，停用账号留给下次扫描自动过期', async () => {
    const findingInserts = [];
    const staleUpdates = [];
    const query = vi.fn(async (sql, params = []) => {
      const statement = String(sql);
      if (statement.includes('UPDATE resource_governance_scans') && statement.includes('lease_expires_at')) {
        return [{ affectedRows: 1 }];
      }
      if (statement.includes('FROM information_schema.tables')) {
        return [[{ table_name: 'note' }, { table_name: 'user' }, { table_name: 'account_deletion_requests' }]];
      }
      if (statement.includes('FROM account_deletion_requests') && statement.includes("status IN ('pending'")) {
        return [[{ owner_id: 'owner-in-workflow' }]];
      }
      if (statement.includes('LEFT JOIN user')) return [[]];
      if (statement.includes('JOIN user') && statement.includes('u.del_flag = 1')) {
        return [
          [
            { owner_id: 'owner-disabled', owner_role: 'user', owner_del_flag: 1, resource_count: 2 },
            { owner_id: 'owner-deleted', owner_role: 'deleted', owner_del_flag: 1, resource_count: 3 },
            { owner_id: 'owner-in-workflow', owner_role: 'deleted', owner_del_flag: 1, resource_count: 1 },
          ],
        ];
      }
      if (statement.includes('FROM resource_governance_findings WHERE fingerprint')) return [[]];
      if (statement.includes('INSERT INTO resource_governance_findings')) {
        findingInserts.push(params);
        return [{ affectedRows: 1 }];
      }
      if (statement.includes("SET state = 'stale'")) {
        staleUpdates.push(params);
        return [{ affectedRows: 1 }];
      }
      if (statement.includes('SELECT risk_level, COUNT(*) AS total')) {
        return [[{ risk_level: 'review', total: 1, estimated_bytes: 0 }]];
      }
      if (statement.includes("SET status = 'completed'")) return [{ affectedRows: 1 }];
      if (statement.includes('INSERT INTO resource_governance_audit')) return [{ affectedRows: 1 }];
      throw new Error(`未覆盖的测试 SQL: ${statement}`);
    });
    const db = { query };

    const result = await runGovernanceScan({ id: 'scan-1', createdBy: 'root-1', scopes: ['note'] }, 'worker-1', { db });

    expect(result).toMatchObject({ total: 1, review: 1 });
    expect(findingInserts).toHaveLength(1);
    expect(findingInserts[0][3]).toBe('FORMALLY_DELETED_OWNER_HAS_RESOURCES');
    expect(findingInserts[0][7]).toBe('owner-deleted');
    expect(findingInserts[0][8]).toBe('review');
    expect(JSON.parse(findingInserts[0][10])).toMatchObject({
      ownerRowExists: true,
      ownerFormallyDeleted: true,
      resourceCount: 3,
      cleanupExecutorRegistered: true,
      actionKind: 'cleanup_invalid_owner',
    });
    expect(staleUpdates).toHaveLength(1);
    expect(staleUpdates[0][0]).toBe('note');
  });

  it('历史软删除候选按账号当前状态失败关闭', async () => {
    const query = vi.fn(async (sql) => {
      const statement = String(sql);
      if (statement.startsWith('CREATE TABLE IF NOT EXISTS')) return [{ affectedRows: 0 }];
      if (statement.includes('FROM resource_governance_findings WHERE id')) {
        return [
          [
            {
              id: 'legacy-finding',
              issue_code: 'SOFT_DELETED_OWNER_HAS_RESOURCES',
              owner_id: 'owner-disabled',
              risk_level: 'blocked',
              state: 'open',
              evidence_json: '{}',
            },
          ],
        ];
      }
      if (statement.includes('FROM user') && statement.includes('id IN')) {
        return [[{ id: 'owner-disabled', role: 'user', del_flag: 1 }]];
      }
      throw new Error(`未覆盖的测试 SQL: ${statement}`);
    });

    const finding = await getGovernanceFinding('legacy-finding', { db: { query } });

    expect(finding).toMatchObject({
      owner_cleanup_state: 'disabled',
      action_kind: null,
      action_eligible: false,
      evidence_json: {},
    });
  });

  it('正式注销候选在读取详情时才暴露账号级清理资格', async () => {
    const query = vi.fn(async (sql) => {
      const statement = String(sql);
      if (statement.startsWith('CREATE TABLE IF NOT EXISTS')) return [{ affectedRows: 0 }];
      if (statement.includes('FROM resource_governance_findings WHERE id')) {
        return [
          [
            {
              id: 'formal-finding',
              issue_code: 'FORMALLY_DELETED_OWNER_HAS_RESOURCES',
              owner_id: 'owner-deleted',
              risk_level: 'review',
              state: 'open',
              evidence_json: '{"ownerFormallyDeleted":true}',
            },
          ],
        ];
      }
      if (statement.includes('FROM user') && statement.includes('id IN')) {
        return [[{ id: 'owner-deleted', role: 'deleted', del_flag: 1 }]];
      }
      throw new Error(`未覆盖的测试 SQL: ${statement}`);
    });

    const finding = await getGovernanceFinding('formal-finding', { db: { query } });

    expect(finding).toMatchObject({
      owner_cleanup_state: 'formally_deleted',
      action_kind: 'cleanup_invalid_owner',
      action_eligible: true,
      evidence_json: { ownerFormallyDeleted: true },
    });
  });
});
