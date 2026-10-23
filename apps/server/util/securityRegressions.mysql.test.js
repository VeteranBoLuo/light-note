import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import mysql from 'mysql2/promise';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ db: null, objects: new Map(), copy: vi.fn(), waiting: 0 }));
vi.mock('../db/index.js', () => ({
  default: {
    query: (...args) => state.db.query(...args),
    getConnection: async () => {
      const connection = await state.db.getConnection();
      return new Proxy(connection, {
        get(target, key) {
          if (key === 'query')
            return (sql, ...args) => {
              if (String(sql).includes('FROM user_growth WHERE user_id = ? FOR UPDATE')) state.waiting++;
              return target.query(sql, ...args);
            };
          return typeof target[key] === 'function' ? target[key].bind(target) : target[key];
        },
      });
    },
  },
}));
vi.mock('./growth.js', () => ({ levelForExp: (exp) => (exp >= 1000 ? 3 : 1), getUserSpaceMb: async () => 1 }));
vi.mock('./items.js', () => ({ grantItem: vi.fn() }));
vi.mock('./aiBonusWallet.js', () => ({ creditAiBonusTokens: vi.fn() }));
vi.mock('./imagePreview/references.js', () => ({ syncCloudImageById: vi.fn() }));
vi.mock('./services/resourceCreateEffects.js', () => ({ triggerResourceCreateEffects: vi.fn() }));
vi.mock('./resourceInbox.js', () => ({ removeInboxRelations: vi.fn(), enqueueResources: vi.fn() }));
vi.mock('./publicResources/lifecycle.js', () => ({ withdrawDeletedSources: vi.fn() }));
vi.mock('./bookmarkIconService.js', () => ({ cleanupBookmarkIconFiles: vi.fn() }));
vi.mock('./personalKnowledgeSearch.js', () => ({ invalidatePersonalKnowledgeCache: vi.fn() }));
vi.mock('./obsClient.js', () => ({
  bucketBaseUrl: 'https://objects.invalid',
  buildObjectKey: (owner, name) => `files/${owner}/${name}`,
  createUploadSignedUrl: ({ objectKey }) => ({ url: `https://upload.invalid/${objectKey}`, expiresIn: 900 }),
  copyObjectInObs: (...args) => state.copy(...args),
  getObjectMetadataFromObs: async (key) => {
    if (!state.objects.has(key)) throw new Error('Synthetic object missing');
    return { contentLength: state.objects.get(key) };
  },
  deleteObjectFromObs: async (key) => {
    state.objects.delete(key);
  },
}));

const { drawLottery, getLotteryStatus } = await import('./lottery.js');
const { updateGrowthPreferences } = await import('./growthPreferences.js');
const { prepareManagedCloudUpload, confirmManagedCloudUpload } =
  await import('./services/managedCloudUploadService.js');
const { publishedUploadKey } = await import('./services/cloudUploadFinalization.js');
const { cleanupLegacyCloudObject } = await import('./services/cloudLegacyObjectLifecycle.js');
const { softDeleteResources } = await import('./services/resourceDeleteService.js');
const socketPath = process.env.LIGHTNOTE_TEST_MYSQL_SOCKET;
const schema = `security_regressions_${randomUUID().replaceAll('-', '')}`;

describe.skipIf(!socketPath)('安全边界回归（隔离 MySQL，模拟对象存储）', () => {
  let admin;
  let created = false;
  let sequence = 0;
  beforeAll(async () => {
    if (!/^\/(?:private\/)?tmp\//.test(socketPath)) throw new Error('Temporary socket required');
    admin = await mysql.createConnection({ socketPath, user: 'root' });
    const [[runtime]] = await admin.query('SELECT @@global.skip_networking AS isolated');
    if (Number(runtime.isolated) !== 1) throw new Error('Isolated MySQL required');
    await admin.query(`CREATE DATABASE ${schema} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    created = true;
    state.db = mysql.createPool({
      socketPath,
      user: 'root',
      database: schema,
      connectionLimit: 12,
      multipleStatements: true,
    });
    await state.db.query(`
      CREATE TABLE user (id VARCHAR(64) PRIMARY KEY, role VARCHAR(16), del_flag INT DEFAULT 0);
      INSERT INTO user VALUES ('owner','user',0),('other','user',0);
      CREATE TABLE user_growth (user_id VARCHAR(64) PRIMARY KEY, points INT DEFAULT 0, exp INT DEFAULT 1000,
        lottery_count INT DEFAULT 0, lottery_paid_count INT DEFAULT 0, lottery_paid_pity_progress INT DEFAULT 0,
        lottery_free_day CHAR(8), lottery_free_used INT DEFAULT 0, storage_bonus_mb INT DEFAULT 0,
        ai_bonus_tokens BIGINT DEFAULT 0, streak_protect_cards INT DEFAULT 0);
      CREATE TABLE user_growth_preferences (user_id VARCHAR(64) PRIMARY KEY, weekly_active_target INT DEFAULT 5,
        streak_reminder_enabled INT DEFAULT 1, celebration_enabled INT DEFAULT 1, low_pressure_mode INT DEFAULT 0,
        timezone VARCHAR(64), utc_offset_minutes INT, points_goal_item_id VARCHAR(64), points_goal_enabled INT DEFAULT 0);
      CREATE TABLE points_log (id BIGINT AUTO_INCREMENT PRIMARY KEY, user_id VARCHAR(64), delta INT, reason VARCHAR(32), ref VARCHAR(64),
        meta JSON, KEY idx_user_reason_ref(user_id,reason,ref));
      CREATE TABLE points_economy_operations (id BIGINT AUTO_INCREMENT PRIMARY KEY, user_id VARCHAR(64), request_id VARCHAR(64),
        operation_type VARCHAR(32), economy_version VARCHAR(64), operation_hash CHAR(64), status VARCHAR(16), result_json JSON,
        replay_count INT DEFAULT 0, last_replayed_at DATETIME, updated_at DATETIME, item_id VARCHAR(64), cost_points INT,
        points_rewarded INT, ai_tokens_granted BIGINT, storage_mb_granted INT, makeup_cards_granted INT, draw_count INT, pity_hits INT,
        UNIQUE KEY receipt(user_id,request_id));
      CREATE TABLE files (id BIGINT AUTO_INCREMENT PRIMARY KEY, create_by VARCHAR(64), file_name VARCHAR(255), file_type VARCHAR(255),
        file_size BIGINT, directory VARCHAR(255), folder_id BIGINT, del_flag INT DEFAULT 0, obs_key VARCHAR(500),
        KEY owner_key(create_by,obs_key(150)), KEY owner_name(create_by,file_name));
      CREATE TABLE image_assets (id INT PRIMARY KEY, storage_kind VARCHAR(20), source_locator VARCHAR(500));
      CREATE TABLE folders (id INT PRIMARY KEY, create_by VARCHAR(64), del_flag INT DEFAULT 0);
      CREATE TABLE note (id VARCHAR(64) PRIMARY KEY, create_by VARCHAR(64), parent_id VARCHAR(64), title VARCHAR(255),
        type VARCHAR(16) DEFAULT 'html', revision INT DEFAULT 1, sort INT DEFAULT 0, is_top INT DEFAULT 0,
        del_flag INT DEFAULT 0, update_time DATETIME DEFAULT CURRENT_TIMESTAMP, deleted_at DATETIME, tree_delete_batch_id CHAR(36));
      CREATE TABLE bookmark (id VARCHAR(64) PRIMARY KEY, user_id VARCHAR(64), del_flag INT DEFAULT 0, deleted_at DATETIME, icon_url VARCHAR(255));
    `);
    await state.db.query(
      await readFile(new URL('../migrations/20260925_cloud_legacy_object_lifecycle.sql', import.meta.url), 'utf8'),
    );
  });
  beforeEach(async () => {
    for (const version of [4, 5, 6, 7, 8, 9])
      vi.stubEnv(`POINTS_ECONOMY_C${version}_ENABLED`, version === 4 ? 'true' : 'false');
    vi.stubEnv('POINTS_LOTTERY_FREE_ENABLED', 'true');
    for (const table of [
      'points_log',
      'points_economy_operations',
      'user_growth_preferences',
      'user_growth',
      'files',
      'image_assets',
      'cloud_legacy_object_lifecycle',
      'note',
      'bookmark',
    ]) {
      await state.db.query(`DELETE FROM ${table}`);
    }
    await state.db.query("INSERT INTO user_growth (user_id) VALUES ('owner')");
    state.objects.clear();
    state.waiting = 0;
    state.copy.mockReset().mockImplementation(async (source, target) => {
      if (!state.objects.has(source)) throw new Error('Synthetic source missing');
      state.objects.set(target, state.objects.get(source));
    });
  });
  afterAll(async () => {
    vi.unstubAllEnvs();
    await state.db?.end();
    try {
      if (created) await admin.query(`DROP DATABASE ${schema}`);
    } finally {
      await admin?.end();
    }
  });
  const draw = (extra = {}) =>
    drawLottery('owner', {
      mode: 'free',
      times: 1,
      clientRequestId: `security-draw-${++sequence}`,
      economyVersion: 'points-economy-c4',
      expectedCost: 0,
      randomIntFn: () => 0,
      ...extra,
    });
  async function upload(bytes = 12) {
    const prepared = await prepareManagedCloudUpload({
      userId: 'owner',
      fileName: 'report.pdf',
      fileSize: Math.min(bytes, 12),
    });
    state.objects.set(prepared.objectKey, bytes);
    return { userId: 'owner', objectKey: prepared.objectKey, fileName: 'report.pdf', fileType: 'application/pdf' };
  }
  async function deleteItems(items) {
    const connection = await state.db.getConnection();
    try {
      await connection.beginTransaction();
      const result = await softDeleteResources(connection, { userId: 'owner', items });
      await connection.commit();
      return result;
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  it('真实偏好接口来回切换日期不会恢复已经消耗的免费次数', async () => {
    const results = [];
    for (let i = 0; i < 8; i++) {
      await updateGrowthPreferences('owner', { timezone: i % 2 ? 'Pacific/Honolulu' : 'Pacific/Kiritimati' });
      results.push(await draw());
      expect((await getLotteryStatus('owner')).free.remaining).toBe(0);
    }
    expect(results.filter((result) => result.ok)).toHaveLength(2);
    expect((await state.db.query('SELECT points FROM user_growth'))[0][0].points).toBe(20);
    expect((await state.db.query("SELECT * FROM points_log WHERE reason='lottery_free'"))[0]).toHaveLength(2);
  });

  it('多个请求在旧 RR 快照下等待账号锁，也只有一个能消耗当天额度', async () => {
    const blocker = await state.db.getConnection();
    let pending;
    try {
      await blocker.beginTransaction();
      await blocker.query("SELECT * FROM user_growth WHERE user_id='owner' FOR UPDATE");
      pending = Promise.all(Array.from({ length: 6 }, () => draw()));
      await vi.waitFor(() => expect(state.waiting).toBe(6));
      await blocker.commit();
      expect((await pending).filter((result) => result.ok)).toHaveLength(1);
    } finally {
      await blocker.rollback();
      blocker.release();
      if (pending) await pending;
    }
    expect((await state.db.query("SELECT * FROM points_log WHERE reason='lottery_free'"))[0]).toHaveLength(1);
  });

  it('发奖失败会回滚次数与收据，重试仍可正常领取', async () => {
    await state.db.query(
      "CREATE TRIGGER fail_reward BEFORE INSERT ON points_log FOR EACH ROW IF NEW.delta>0 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='synthetic reward failure'; END IF",
    );
    try {
      await expect(draw()).rejects.toThrow('synthetic reward failure');
    } finally {
      await state.db.query('DROP TRIGGER fail_reward');
    }
    expect((await state.db.query('SELECT * FROM points_log'))[0]).toHaveLength(0);
    expect((await state.db.query('SELECT * FROM points_economy_operations'))[0]).toHaveLength(0);
    expect(await draw()).toMatchObject({ ok: true });
  });

  it('确认后重写上传对象不改变正式文件或其记账；重试也不重复复制', async () => {
    const item = await upload();
    const first = await confirmManagedCloudUpload(item);
    const [[file]] = await state.db.query('SELECT * FROM files WHERE id=?', [first.fileId]);
    expect(file.obs_key).toBe(publishedUploadKey('owner', item.objectKey));
    state.objects.set(item.objectKey, 5 * 1024 ** 3);
    expect(await confirmManagedCloudUpload(item)).toMatchObject({
      fileId: first.fileId,
      fileSize: 12,
      alreadyConfirmed: true,
    });
    expect(state.objects.get(file.obs_key)).toBe(12);
    expect(Number((await state.db.query('SELECT SUM(file_size) AS bytes FROM files'))[0][0].bytes)).toBe(12);
    expect(state.copy).toHaveBeenCalledOnce();
  });

  it('冻结副本也按实际大小拦截超额，回滚后的副本有持久清理记录', async () => {
    const item = await upload(2 * 1024 ** 2);
    await expect(confirmManagedCloudUpload(item)).rejects.toMatchObject({ code: 'STORAGE_QUOTA_EXCEEDED' });
    expect((await state.db.query('SELECT * FROM files'))[0]).toHaveLength(0);
    await state.db.query("UPDATE cloud_legacy_object_lifecycle SET available_at=NOW() WHERE state='pending'");
    while (await cleanupLegacyCloudObject({ database: state.db, env: { LIGHTNOTE_RUNTIME_ENV: 'test' } })) {
      /* drain disposable copies */
    }
    expect(state.objects.has(publishedUploadKey('owner', item.objectKey))).toBe(false);
  });

  it('并发确认同一上传只冻结一次，并返回同一个文件 ID', async () => {
    const item = await upload();
    const results = await Promise.all(Array.from({ length: 4 }, () => confirmManagedCloudUpload(item)));
    expect(new Set(results.map((result) => result.fileId)).size).toBe(1);
    expect(state.copy).toHaveBeenCalledOnce();
    expect((await state.db.query('SELECT * FROM files'))[0]).toHaveLength(1);
  });

  it('回收站中的正式副本不能被旧上传重新确认或覆盖', async () => {
    const item = await upload();
    await confirmManagedCloudUpload(item);
    await state.db.query('UPDATE files SET del_flag=1');
    state.objects.set(item.objectKey, 5 * 1024 ** 3);
    await expect(confirmManagedCloudUpload(item)).rejects.toMatchObject({ code: 'UPLOAD_FILE_TRASHED' });
    expect(state.objects.get(publishedUploadKey('owner', item.objectKey))).toBe(12);
    expect(state.copy).toHaveBeenCalledOnce();
  });

  it('资源中心删除父页面会拒绝整笔操作，不留下孤儿或部分删除', async () => {
    await state.db.query(
      "INSERT INTO note(id,create_by,parent_id,title) VALUES ('parent','owner',NULL,'parent'),('child','owner','parent','child')",
    );
    await state.db.query("INSERT INTO bookmark(id,user_id) VALUES ('bookmark','owner')");
    await expect(
      deleteItems([
        { type: 'bookmark', id: 'bookmark' },
        { type: 'note', id: 'parent' },
      ]),
    ).rejects.toMatchObject({ code: 'NOTE_HAS_CHILDREN', status: 409 });
    expect((await state.db.query('SELECT del_flag FROM note'))[0].every((row) => row.del_flag === 0)).toBe(true);
    expect((await state.db.query('SELECT del_flag FROM bookmark'))[0][0].del_flag).toBe(0);
    const result = await deleteItems([{ type: 'note', id: 'child' }]);
    expect(result.affectedItemCount).toBe(1);
    expect(
      (await state.db.query("SELECT del_flag,tree_delete_batch_id FROM note WHERE id='child'"))[0][0],
    ).toMatchObject({ del_flag: 1, tree_delete_batch_id: expect.any(String) });
  });

  it('跨账号页面仍不可通过资源中心删除', async () => {
    await state.db.query("INSERT INTO note(id,create_by,title) VALUES ('foreign','other','private')");
    expect(await deleteItems([{ type: 'note', id: 'foreign' }])).toMatchObject({ affectedItemCount: 0 });
    expect((await state.db.query('SELECT del_flag FROM note'))[0][0].del_flag).toBe(0);
  });
});
