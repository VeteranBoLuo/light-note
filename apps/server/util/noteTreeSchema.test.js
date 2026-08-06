import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ query: vi.fn() }));

vi.mock('../db/index.js', () => ({ default: { query: mocks.query } }));

import { ensureNoteTreeSchema } from './noteTreeSchema.js';

describe('ensureNoteTreeSchema', () => {
  beforeEach(() => {
    mocks.query.mockReset();
  });

  it('MySQL 5.7 下按 information_schema 结果幂等补齐两列与三个索引', async () => {
    mocks.query.mockImplementation(async (sql) => {
      if (String(sql).includes('information_schema.')) return [[]];
      return [{ affectedRows: 0 }];
    });

    await ensureNoteTreeSchema();

    const ddl = mocks.query.mock.calls.map(([sql]) => String(sql)).filter((sql) => /^ALTER TABLE/i.test(sql));
    expect(ddl).toHaveLength(5);
    expect(ddl).toEqual(
      expect.arrayContaining([
        expect.stringContaining('ADD COLUMN `parent_id` varchar(255) NULL'),
        expect.stringContaining('ADD COLUMN `tree_delete_batch_id` varchar(255) NULL'),
        expect.stringContaining('ADD KEY `idx_note_owner_parent_order`'),
        expect.stringContaining('ADD KEY `idx_note_tree_delete_batch`'),
        expect.stringContaining('ADD KEY `idx_note_parent`'),
      ]),
    );
  });

  it('列与索引已完整存在时不执行任何 DDL', async () => {
    const indexColumns = {
      idx_note_owner_parent_order: [
        { columnName: 'create_by', subPart: 64 },
        { columnName: 'parent_id', subPart: 64 },
        { columnName: 'del_flag', subPart: 8 },
        { columnName: 'is_top', subPart: null },
        { columnName: 'sort', subPart: null },
        { columnName: 'update_time', subPart: null },
        { columnName: 'id', subPart: 64 },
      ],
      idx_note_tree_delete_batch: [
        { columnName: 'create_by', subPart: 64 },
        { columnName: 'tree_delete_batch_id', subPart: 64 },
        { columnName: 'del_flag', subPart: 8 },
      ],
      idx_note_parent: [{ columnName: 'parent_id', subPart: null }],
    };
    mocks.query.mockImplementation(async (sql, params = []) => {
      if (String(sql).includes('information_schema.COLUMNS')) {
        return [[{ columnType: 'varchar(255)', isNullable: 'YES' }]];
      }
      if (String(sql).includes('information_schema.STATISTICS')) {
        return [indexColumns[params[0]] || []];
      }
      throw new Error(`unexpected DDL: ${sql}`);
    });

    await ensureNoteTreeSchema();

    expect(mocks.query).toHaveBeenCalledTimes(5);
    expect(mocks.query.mock.calls.every(([sql]) => String(sql).includes('information_schema.'))).toBe(true);
  });

  it('已存在但形状不符时失败关闭，不在启动期破坏性重建', async () => {
    mocks.query.mockImplementation(async (sql, params = []) => {
      if (String(sql).includes('information_schema.COLUMNS')) {
        return [[{ columnType: 'varchar(255)', isNullable: 'YES' }]];
      }
      if (params[0] === 'idx_note_owner_parent_order') return [[{ columnName: 'create_by' }]];
      return [[]];
    });

    await expect(ensureNoteTreeSchema()).rejects.toMatchObject({ code: 'NOTE_TREE_SCHEMA_MISMATCH' });
    expect(mocks.query.mock.calls.some(([sql]) => /^ALTER TABLE/i.test(String(sql)))).toBe(false);
  });
});
