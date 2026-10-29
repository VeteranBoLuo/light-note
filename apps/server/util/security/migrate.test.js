import { beforeEach, describe, expect, it, vi } from 'vitest';

const query = vi.fn();
const connection = {
  beginTransaction: vi.fn(),
  commit: vi.fn(),
  rollback: vi.fn(),
  release: vi.fn(),
  query: vi.fn(async () => [[]]),
};
vi.mock('../../db/index.js', () => ({ default: { query, getConnection: vi.fn(async () => connection) } }));

const { ensureSecurityTables } = await import('./migrate.js');

const FINAL_TYPE = "enum('unhandled','processed','false_positive','authorized_test')";
const LEGACY_TYPE = "enum('unhandled','processed','confirmed','false_positive','authorized_test','ignored','resolved')";

function respondWithHandledStatusType(columnType) {
  query.mockImplementation(async (sql) => {
    if (sql.includes('COLUMN_TYPE')) return [[{ columnType }]];
    // 其余列与索引均已存在，只观察枚举收敛分支。
    if (sql.includes('INFORMATION_SCHEMA')) return [[{ name: 'present' }]];
    return [[]];
  });
}

const handledStatusRewrites = () => query.mock.calls.filter(([sql]) => /MODIFY handled_status/.test(sql));

describe('安全事件启动迁移', () => {
  beforeEach(() => {
    query.mockReset();
  });

  it('处置状态已是最终枚举时不重建 security_events', async () => {
    respondWithHandledStatusType(FINAL_TYPE);
    await ensureSecurityTables();
    expect(handledStatusRewrites()).toHaveLength(0);
    expect(
      query.mock.calls.some(([sql]) => /WHERE handled_status IN \('confirmed','resolved','ignored'\)/.test(sql)),
    ).toBe(false);
  });

  it('仍是历史枚举时先扩容收敛旧状态，再收窄为最终枚举', async () => {
    respondWithHandledStatusType(LEGACY_TYPE);
    await ensureSecurityTables();
    const rewrites = handledStatusRewrites().map(([sql]) => sql);
    expect(rewrites).toHaveLength(2);
    expect(rewrites[0]).toContain("'confirmed'");
    expect(rewrites[1]).not.toContain("'confirmed'");
    const statements = query.mock.calls.map(([sql]) => sql);
    const legacyUpdate = statements.findIndex((sql) => /SET handled_status = 'processed'/.test(sql));
    expect(legacyUpdate).toBeGreaterThan(statements.indexOf(rewrites[0]));
    expect(legacyUpdate).toBeLessThan(statements.indexOf(rewrites[1]));
  });
});
