import pool from '../db/index.js';
import { insertData } from './common.js';

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

// 应用启动时确保通知表存在(免手动跑 migration,与 ensureSecurityTables 同思路)
export async function ensureNotificationTable() {
  await pool.query(CREATE_SQL);
}

/**
 * 写一条通知。
 * - 调用方应 fire-and-forget(.catch 吞错):通知失败绝不该阻断/回滚主业务。
 * - 传 conn 时复用外部事务(升级通知与经验同事务,要么都成功要么都回滚,保证"升级即有通知")。
 * - userId 为空或游客直接跳过。
 * @param {string} userId 接收者
 * @param {{type:string,title:string,content?:string,link?:string,meta?:object}} payload
 * @param {import('mysql2/promise').PoolConnection|null} conn
 */
export async function createNotification(userId, { type, title, content = null, link = null, meta = null }, conn = null) {
  if (!userId || userId === 'visitor') return;
  const db = conn || pool;
  const row = insertData({
    userId,
    type,
    title,
    content,
    link,
    meta: meta ? JSON.stringify(meta) : null,
    isRead: 0,
  });
  await db.query('INSERT INTO notification SET ?', [row]);
}
