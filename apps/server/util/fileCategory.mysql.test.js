import mysql from 'mysql2/promise';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { FILE_CATEGORY_ORDER, buildFileCategorySql, resolveFileCategory } from './fileCategory.js';
import { FILE_CATEGORY_PARITY_INPUTS } from '../../../packages/shared/fileCategory.cases.js';

const socketPath = process.env.LIGHTNOTE_TEST_MYSQL_SOCKET;
describe.skipIf(!socketPath)('共享分类与真实 MySQL 筛选一致', () => {
  let db;
  beforeAll(async () => {
    if (!/^\/(?:private\/)?tmp\//.test(socketPath)) throw new Error('Temporary socket required');
    db = await mysql.createConnection({ socketPath, user: 'root', charset: 'utf8mb4_unicode_ci' });
    const [[server]] = await db.query('SELECT @@global.skip_networking AS isolated');
    if (Number(server.isolated) !== 1) throw new Error('Isolated MySQL required');
  });
  afterAll(async () => {
    await db?.end();
  });

  const dataset = (files) => ({
    source: files
      .map(() => 'SELECT ? AS id, ? AS file_name, ? AS file_type, ? AS old_category')
      .join(' UNION ALL '),
    params: files.flatMap((file, index) => [
      index,
      file.fileName ?? null,
      file.fileType ?? null,
      file.category ?? null,
    ]),
  });
  it('所有格式别名、冲突元数据和未知后缀在 JS / SQL 中分类一致', async () => {
    for (let index = 0; index < FILE_CATEGORY_PARITY_INPUTS.length; index += 100) {
      const files = FILE_CATEGORY_PARITY_INPUTS.slice(index, index + 100);
      const { source, params } = dataset(files);
      for (const legacy of [false, true]) {
        const expression = buildFileCategorySql(legacy ? { categorySql: 'files.old_category' } : {});
        const [rows] = await db.query(
          `SELECT id, ${expression} AS category FROM (${source}) AS files ORDER BY id`,
          params,
        );
        expect(rows.map((row) => row.category)).toEqual(
          files.map((file) => resolveFileCategory(legacy ? file : { ...file, category: '' })),
        );
      }
    }
  });
  it('分类统计与每个分类的 LIMIT/OFFSET 都和共享解析结果一致', async () => {
    const files = FILE_CATEGORY_PARITY_INPUTS;
    const { source, params } = dataset(files);
    const expression = buildFileCategorySql();
    const expected = files.map((file) => resolveFileCategory({ ...file, category: '' }));
    const [counts] = await db.query(
      `SELECT ${expression} AS category, COUNT(*) AS total FROM (${source}) AS files GROUP BY category`,
      params,
    );
    for (const category of FILE_CATEGORY_ORDER) {
      expect(Number(counts.find((row) => row.category === category)?.total || 0)).toBe(
        expected.filter((value) => value === category).length,
      );
      const [page] = await db.query(
        `SELECT id FROM (${source}) AS files WHERE ${expression} = ? ORDER BY id LIMIT 3 OFFSET 1`,
        [...params, category],
      );
      expect(page.map((row) => row.id)).toEqual(
        expected.flatMap((value, index) => (value === category ? [index] : [])).slice(1, 4),
      );
    }
  });
});
