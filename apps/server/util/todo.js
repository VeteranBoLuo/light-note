import pool from '../db/index.js';

// 待办事项表(启动时 ensure,与其他模块一致)
export async function ensureTodoTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS todo (
      id VARCHAR(64) NOT NULL,
      user_id VARCHAR(64) NOT NULL,
      content VARCHAR(500) NOT NULL COMMENT '待办内容',
      done TINYINT NOT NULL DEFAULT 0 COMMENT '是否完成',
      priority TINYINT NOT NULL DEFAULT 0 COMMENT '0 普通 / 1 重要',
      due_date DATETIME DEFAULT NULL COMMENT '截止时间(可空)',
      sort INT NOT NULL DEFAULT 0,
      done_time DATETIME DEFAULT NULL,
      create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      del_flag TINYINT NOT NULL DEFAULT 0,
      PRIMARY KEY (id),
      KEY idx_user (user_id, del_flag, done)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='待办事项'
  `);
}
