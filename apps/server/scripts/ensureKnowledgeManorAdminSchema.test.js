import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
const fixture = vi.hoisted(() => ({ missing: false, query: vi.fn(), end: vi.fn() }));
vi.mock('../db/index.js', () => ({ default: fixture }));
const originalArgv = process.argv;
beforeEach(() => {
  vi.resetModules();
  fixture.missing = false;
  fixture.end.mockReset();
  fixture.query.mockReset().mockImplementation(async (sql) => {
    if (sql.includes('information_schema.columns'))
      return [
        fixture.missing
          ? []
          : [
              ...['action', 'effectful', 'resource_delta_json'].map((columnName) => ({
                tableName: 'knowledge_manor_operations',
                columnName,
              })),
              ...['id', 'mode', 'message', 'revision', 'updated_by', 'updated_at', 'coverage_started_at'].map(
                (columnName) => ({ tableName: 'knowledge_manor_runtime', columnName }),
              ),
            ],
      ];
    if (sql.includes('information_schema.tables')) return [[{ engineName: 'InnoDB' }]];
    if (sql.includes('information_schema.statistics'))
      return [
        [
          {
            tableName: 'knowledge_manor_operations',
            name: 'idx_manor_ops_time',
            fields: 'created_at,user_id,request_id',
            prefixed: 0,
          },
          {
            tableName: 'knowledge_manor_operations',
            name: 'idx_manor_ops_user_time',
            fields: 'user_id,created_at,request_id',
            prefixed: 0,
          },
          { tableName: 'knowledge_manors', name: 'idx_manor_updated', fields: 'updated_at,user_id', prefixed: 0 },
          { tableName: 'knowledge_manor_runtime', name: 'PRIMARY', fields: 'id', prefixed: 0 },
        ],
      ];
    if (sql.startsWith('SELECT mode')) return [[{ mode: 'open' }]];
    if (sql.startsWith('UPDATE knowledge_manor_runtime SET coverage_started_at')) return [{ affectedRows: 1 }];
    throw new Error('Unexpected write during check');
  });
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  process.argv = originalArgv;
  process.exitCode = 0;
  vi.restoreAllMocks();
});
describe('庄园后台结构检查和采集边界分离', () => {
  it('--check 只读且关闭连接，不安装或声明覆盖', async () => {
    process.argv = ['node', 'script', '--check'];
    await import('./ensureKnowledgeManorAdminSchema.js');
    expect(fixture.end).toHaveBeenCalledOnce();
    expect(fixture.query.mock.calls.every(([sql]) => sql.startsWith('SELECT'))).toBe(true);
  });
  it('结构缺失明确失败并关闭连接', async () => {
    fixture.missing = true;
    process.argv = ['node', 'script', '--check'];
    await import('./ensureKnowledgeManorAdminSchema.js');
    expect(process.exitCode).toBe(1);
    expect(console.error).toHaveBeenCalledWith('KNOWLEDGE_MANOR_ADMIN_SCHEMA_FAILED');
    expect(fixture.end).toHaveBeenCalledOnce();
  });
  it('显式开始观察只登记尚未设置的边界，不建表或覆盖旧边界', async () => {
    process.argv = ['node', 'script', '--start-observation'];
    await import('./ensureKnowledgeManorAdminSchema.js');
    const writes = fixture.query.mock.calls.filter(([sql]) => !sql.startsWith('SELECT'));
    expect(writes).toHaveLength(1);
    expect(writes[0][0]).toContain('coverage_started_at IS NULL');
    expect(fixture.end).toHaveBeenCalledOnce();
  });
});
