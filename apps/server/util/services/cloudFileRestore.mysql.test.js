import { randomUUID } from 'node:crypto';
import mysql from 'mysql2/promise';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ db: null, copy: vi.fn(), remove: vi.fn() }));
vi.mock('../../db/index.js', () => ({ default: { getConnection: (...args) => state.db.getConnection(...args) } }));
vi.mock('../personalKnowledgeSearch.js', () => ({ invalidatePersonalKnowledgeCache: vi.fn() }));
vi.mock('./noteTreeService.js', () => ({ previewOwnedNoteTrashRestore: vi.fn(), restoreOwnedNoteTrash: vi.fn() }));
vi.mock('../obsClient.js', () => ({
  buildObjectKey: (user, name) => `files/${user}/${name}`,
  bucketBaseUrl: 'https://obs.invalid',
  copyObjectInObs: state.copy,
  deleteObjectFromObs: state.remove,
}));
vi.mock('../imagePreview/relocate.js', () => ({ relocateCloudImage: vi.fn() }));
vi.mock('../aiDocument/service.js', () => ({ purgeDocumentSourcesForCloudFiles: vi.fn() }));
import { renameOwnedCloudFile } from './cloudFileRenameService.js';
import { restoreTrashResources } from './trashService.js';
const socketPath = process.env.LIGHTNOTE_TEST_MYSQL_SOCKET;
const schema = `file_restore_${randomUUID().replaceAll('-', '')}`;
let admin;
let created = false;
describe.skipIf(!socketPath)('文件恢复真实 MySQL', () => {
  beforeAll(async () => {
    if (!/^\/(?:private\/)?tmp\//.test(socketPath)) throw new Error('Temporary local socket required');
    admin = await mysql.createConnection({ socketPath, user: 'root' });
    const [[runtime]] = await admin.query('SELECT @@global.skip_networking AS isolated');
    if (Number(runtime.isolated) !== 1) throw new Error('Isolated MySQL required');
    await admin.query(`CREATE DATABASE ${schema} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    created = true;
    state.db = mysql.createPool({ socketPath, user: 'root', database: schema, connectionLimit: 4 });
    await state.db.query('CREATE TABLE user (id VARCHAR(32) PRIMARY KEY) ENGINE=InnoDB');
    await state.db.query("INSERT INTO user VALUES ('u')");
    await state.db.query(`CREATE TABLE files (id INT PRIMARY KEY, create_by VARCHAR(32), file_name VARCHAR(255),
      obs_key VARCHAR(512), del_flag INT, deleted_at DATETIME NULL,
      KEY owner_name(create_by,file_name)) ENGINE=InnoDB`);
    await state.db.query('ALTER TABLE files ADD directory VARCHAR(512) NULL');
  });
  beforeEach(async () => {
    await state.db.query('DELETE FROM files');
    await state.db.query(`INSERT INTO files (id,create_by,file_name,obs_key,del_flag,deleted_at) VALUES
      (1,'u','Plan.PNG','new',0,NULL), (2,'u','plan.png','old-two',1,NOW()),
      (3,'u','plan.png',NULL,1,NOW())`);
  });
  afterAll(async () => {
    await state.db?.end();
    if (created) await admin.query(`DROP DATABASE ${schema}`);
    await admin?.end();
  });
  it.each([null, 'files/u/plan.png'])('重命名避让回收站原件，包括历史缺失键 %s', async (key) => {
    await state.db.query('UPDATE files SET obs_key=? WHERE id=3', [key]);
    state.copy.mockClear();
    const c = await state.db.getConnection();
    try {
      await c.beginTransaction();
      const result = await renameOwnedCloudFile(c, { userId: 'u', id: 1, name: 'plan.png' });
      await c.commit();
      expect(result.name).toBe('plan.png');
    } catch (error) {
      await c.rollback();
      throw error;
    } finally {
      c.release();
    }
    const [rows] = await state.db.query('SELECT * FROM files ORDER BY id');
    expect(rows[0].obs_key).toMatch(/^files\/u\/renamed\//);
    expect(state.copy).toHaveBeenCalledExactlyOnceWith('new', rows[0].obs_key);
    expect(rows[2].obs_key).toBe(key);
    expect(rows[2].del_flag).toBe(1);
  });
  it('并发恢复按数据库大小写规则编号，保留新旧原件', async () => {
    const results = await Promise.all(
      ['2', '3'].map((id) =>
        restoreTrashResources({
          userId: 'u',
          filters: { type: 'file', id },
        }),
      ),
    );
    expect(results).toEqual([[{ type: 'file', count: 1 }], [{ type: 'file', count: 1 }]]);
    const [rows] = await state.db.query('SELECT * FROM files ORDER BY id');
    expect(rows[0]).toMatchObject({ file_name: 'Plan.PNG', obs_key: 'new', del_flag: 0 });
    expect(
      rows
        .slice(1)
        .map((r) => r.file_name)
        .sort(),
    ).toEqual(['plan (1).png', 'plan (2).png']);
    expect(rows[1].obs_key).toBe('old-two');
    expect(rows[2].obs_key).toBe('files/u/plan.png');
  });
  it('批量恢复在同一事务中保留已分配名称', async () => {
    await restoreTrashResources({ userId: 'u', filters: { type: 'file', all: true } });
    const [rows] = await state.db.query('SELECT file_name FROM files ORDER BY id');
    expect(rows.map((r) => r.file_name)).toEqual(['Plan.PNG', 'plan (1).png', 'plan (2).png']);
  });
});
