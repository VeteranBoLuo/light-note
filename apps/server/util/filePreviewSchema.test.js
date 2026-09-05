import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock('../db/index.js', () => ({ default: { query: mocks.query } }));

const { ensureFilePreviewSchema } = await import('./filePreviewSchema.js');

describe('ensureFilePreviewSchema', () => {
  it('创建统一来源契约，并幂等升级旧云文件预览表的列类型和唯一索引', async () => {
    mocks.query.mockImplementation(async (sql) => {
      const statement = String(sql);
      if (statement.includes('FROM information_schema.COLUMNS')) {
        return [[{ columnName: 'file_id', columnType: 'int(11)' }], []];
      }
      if (statement.includes('FROM information_schema.STATISTICS')) {
        return [[{ columnName: 'file_id' }, { columnName: 'strategy' }, { columnName: 'strategy_version' }], []];
      }
      return [{ affectedRows: 0 }, []];
    });

    await ensureFilePreviewSchema();

    const statements = mocks.query.mock.calls.map(([sql]) => String(sql));
    expect(statements[0]).toContain('source_type VARCHAR(32)');
    expect(statements[0]).toContain('file_id BIGINT UNSIGNED');
    expect(statements[0]).toContain(
      'UNIQUE KEY uk_file_preview_artifact (source_type, file_id, strategy, strategy_version)',
    );
    expect(statements).toContainEqual(
      expect.stringContaining(
        "ADD COLUMN source_type varchar(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL DEFAULT 'cloud_file'",
      ),
    );
    expect(statements).toContainEqual(expect.stringContaining('MODIFY COLUMN file_id bigint unsigned NOT NULL'));
    expect(statements).toContainEqual(expect.stringContaining('DROP INDEX uk_file_preview_artifact'));
    expect(statements).toContainEqual(
      expect.stringContaining(
        'ADD UNIQUE KEY uk_file_preview_artifact (source_type, file_id, strategy, strategy_version)',
      ),
    );
  });
});
