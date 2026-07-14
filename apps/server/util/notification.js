import pool from '../db/index.js';
// 使用无路由副作用的数据工具，避免业务 service -> common.js -> router -> Agent 的循环依赖。
import { insertData } from './agent/data.js';

const CREATE_SQL = `
  CREATE TABLE IF NOT EXISTS notification (
    id char(36) NOT NULL,
    user_id char(36) NOT NULL COMMENT '接收者',
    type varchar(32) NOT NULL COMMENT '类型:level_up/opinion_reply/system',
    title varchar(255) NOT NULL,
    content text,
    link varchar(255) DEFAULT NULL COMMENT '点击跳转路径',
    meta json DEFAULT NULL COMMENT '额外数据',
    is_read tinyint NOT NULL DEFAULT 0,
    read_time datetime DEFAULT NULL,
    create_time datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
    del_flag tinyint NOT NULL DEFAULT 0,
    PRIMARY KEY (id),
    KEY idx_user_unread (user_id, is_read, del_flag),
    KEY idx_user_time (user_id, create_time)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
`;

// 幂等加列(MySQL 5.7 无 ADD COLUMN IF NOT EXISTS):先查 information_schema 再决定是否 ALTER
async function ensureColumn(table, column, ddl) {
  const [rows] = await pool.query(
    `SELECT 1 FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ? LIMIT 1`,
    [table, column],
  );
  if (!rows.length) await pool.query(`ALTER TABLE ${table} ADD COLUMN ${ddl}`);
}

// 幂等加索引
async function ensureIndex(table, indexName, ddl) {
  const [rows] = await pool.query(
    `SELECT 1 FROM information_schema.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ? LIMIT 1`,
    [table, indexName],
  );
  if (!rows.length) await pool.query(`ALTER TABLE ${table} ADD ${ddl}`);
}

// 应用启动时确保通知表存在 + 补齐后续新增列(免手动 migration,与 ensureSecurityTables 同思路)
export async function ensureNotificationTable() {
  await pool.query(CREATE_SQL);
  // batch_id:群发批次标识(同一次发送共享),供后台「发送记录/撤回」按批聚合与操作
  await ensureColumn('notification', 'batch_id', "batch_id char(36) DEFAULT NULL COMMENT '发送批次(同批同 id)'");
  await ensureIndex('notification', 'idx_batch', 'KEY idx_batch (batch_id)');
  // recalled:管理员撤回标记(区别于用户自行删除的 del_flag —— 二者语义不同,不可混用)
  await ensureColumn('notification', 'recalled', "recalled tinyint NOT NULL DEFAULT 0 COMMENT '管理员是否已撤回'");
}

/**
 * 写一条通知。
 * - 调用方应 fire-and-forget(.catch 吞错):通知失败绝不该阻断/回滚主业务。
 * - 传 conn 时复用外部事务(升级通知与经验同事务,要么都成功要么都回滚,保证"升级即有通知")。
 * - userId 为空或游客直接跳过。
 * @param {string} userId 接收者
 * @param {{type:string,title:string,content?:string,link?:string,meta?:object,batchId?:string}} payload
 * @param {import('mysql2/promise').PoolConnection|null} conn
 */
export async function createNotification(
  userId,
  { type, title, content = null, link = null, meta = null, batchId = null },
  conn = null,
) {
  if (!userId || userId === 'visitor') return;
  const db = conn || pool;
  const row = insertData({
    userId,
    type,
    title,
    content,
    link,
    meta: meta ? JSON.stringify(meta) : null,
    batchId,
    isRead: 0,
  });
  await db.query('INSERT INTO notification SET ?', [row]);
}
