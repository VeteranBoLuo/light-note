import { describe, expect, it, vi } from 'vitest';

vi.mock('../db/index.js', () => ({ default: {} }));

const { toolboxSchemaInternals } = await import('./toolboxSchema.js');

function createBackfillDatabase({ lastId = null, completedAt = null } = {}) {
  const state = {
    migration: { last_id: lastId, completed_at: completedAt },
    revisions: [
      { id: 'a', content_bytes: lastId && lastId >= 'a' ? 10 : 0 },
      { id: 'b', content_bytes: lastId && lastId >= 'b' ? 10 : 0 },
      { id: 'c', content_bytes: 0 },
    ],
  };
  const query = vi.fn(async (rawSql, params = []) => {
    const sql = String(rawSql).replace(/\s+/gu, ' ').trim();
    if (sql.startsWith('INSERT IGNORE INTO toolbox_schema_migrations')) return [{ affectedRows: 1 }];
    if (sql.startsWith('SELECT last_id, completed_at FROM toolbox_schema_migrations')) {
      return [[{ ...state.migration }]];
    }
    if (sql.startsWith('SELECT id FROM toolbox_project_revisions WHERE id > ?')) {
      return [
        state.revisions
          .filter((row) => row.id > params[0])
          .slice(0, params[1])
          .map(({ id }) => ({ id })),
      ];
    }
    if (sql.startsWith('SELECT id FROM toolbox_project_revisions ORDER BY id ASC')) {
      return [state.revisions.slice(0, params[0]).map(({ id }) => ({ id }))];
    }
    if (sql.startsWith('SELECT id FROM toolbox_project_revisions WHERE content_bytes = 0')) {
      return [
        state.revisions
          .filter((row) => row.content_bytes === 0)
          .slice(0, 1)
          .map(({ id }) => ({ id })),
      ];
    }
    if (sql.startsWith('UPDATE toolbox_project_revisions')) {
      const lower = params.length === 2 ? params[0] : '';
      const upper = params.at(-1);
      let affectedRows = 0;
      for (const row of state.revisions) {
        if (row.id > lower && row.id <= upper && row.content_bytes === 0) {
          row.content_bytes = 10;
          affectedRows += 1;
        }
      }
      return [{ affectedRows }];
    }
    if (sql.startsWith('UPDATE toolbox_schema_migrations SET last_id = ?')) {
      state.migration.last_id = params[0];
      state.migration.completed_at = null;
      return [{ affectedRows: 1 }];
    }
    if (sql.includes('SET last_id = NULL, completed_at = NULL')) {
      state.migration.last_id = null;
      state.migration.completed_at = null;
      return [{ affectedRows: 1 }];
    }
    if (sql.includes('SET last_id = NULL, completed_at = CURRENT_TIMESTAMP')) {
      state.migration.last_id = null;
      state.migration.completed_at = new Date();
      return [{ affectedRows: 1 }];
    }
    throw new Error(`未覆盖的测试 SQL: ${sql}`);
  });
  return { state, database: { query } };
}

describe('工具箱生产项目 content_bytes 回填', () => {
  it('从已持久化游标继续分批回填，并只在无零值后写完成标记', async () => {
    const { state, database } = createBackfillDatabase({ lastId: 'b' });

    const result = await toolboxSchemaInternals.backfillToolboxProjectContentBytes(database, 1);

    expect(result).toEqual({ completed: true, updatedRows: 1 });
    expect(state.revisions.map((row) => row.content_bytes)).toEqual([10, 10, 10]);
    expect(state.migration.last_id).toBeNull();
    expect(state.migration.completed_at).toBeInstanceOf(Date);
  });

  it('完成标记存在时不再扫描修订大表', async () => {
    const { database } = createBackfillDatabase({ completedAt: new Date() });

    await expect(toolboxSchemaInternals.backfillToolboxProjectContentBytes(database, 1)).resolves.toEqual({
      completed: true,
      updatedRows: 0,
    });
    expect(database.query.mock.calls.some(([sql]) => String(sql).includes('FROM toolbox_project_revisions'))).toBe(
      false,
    );
  });
});
