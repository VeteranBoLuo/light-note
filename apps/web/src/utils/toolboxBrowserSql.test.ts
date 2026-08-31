import { describe, expect, it } from 'vitest';
import {
  browserSqlResultToCsv,
  buildLimitedBrowserSql,
  internalFileName,
  normalizeArrowRows,
  normalizeReadOnlySql,
  tableNameForIndex,
} from './toolboxBrowserSql';

describe('toolboxBrowserSql', () => {
  it('只接受单条只读分析查询', () => {
    expect(normalizeReadOnlySql(' SELECT * FROM data; ')).toBe('SELECT * FROM data');
    expect(() => normalizeReadOnlySql('DROP TABLE data')).toThrow('READ_ONLY_SQL_REQUIRED');
    expect(() => normalizeReadOnlySql('SELECT 1; SELECT 2')).toThrow('MULTIPLE_STATEMENTS');
    expect(() => normalizeReadOnlySql("SELECT * FROM 'https://example.com/a.csv'")).toThrow('REMOTE_SOURCE_BLOCKED');
    expect(() => normalizeReadOnlySql("SELECT * FROM 'local.csv'")).toThrow('REMOTE_SOURCE_BLOCKED');
    expect(() => normalizeReadOnlySql("SELECT * FROM read_csv_auto('ht' || 'tps://example.com/a.csv')")).toThrow(
      'REMOTE_SOURCE_BLOCKED',
    );
    expect(buildLimitedBrowserSql('WITH t AS (SELECT 1 AS n) SELECT * FROM t')).toContain('LIMIT 5001');
  });

  it('为文件分配固定安全别名', () => {
    expect(tableNameForIndex(0)).toBe('data');
    expect(tableNameForIndex(2)).toBe('data_3');
    expect(internalFileName(new File(['a'], "a'b.csv"), 0)).toBe('lightnote_source_1.csv');
    expect(() => internalFileName(new File(['a'], 'a.txt'), 0)).toThrow('UNSUPPORTED_FILE');
  });

  it('规范化 Arrow 行中的 bigint 和二进制值', () => {
    const table = {
      schema: { fields: [{ name: 'id' }, { name: 'raw' }] },
      toArray: () => [{ id: BigInt('9007199254740993'), raw: new Uint8Array([10, 255]) }],
    };
    expect(normalizeArrowRows(table).rows).toEqual([{ id: '9007199254740993', raw: '0x0aff' }]);
  });

  it('生成可下载的 CSV', () => {
    expect(browserSqlResultToCsv({ columns: ['name', 'note'], rows: [{ name: '轻笺', note: 'a,b' }] })).toBe(
      'name,note\n轻笺,"a,b"',
    );
  });
});
