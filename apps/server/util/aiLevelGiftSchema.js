import pool from '../db/index.js';
import { readFile } from 'node:fs/promises';
import { localSqlStatements } from './localSqlStatements.js';

export const AI_LEVEL_GIFT_CONTROL_SQL = `CREATE TABLE IF NOT EXISTS ai_level_gift_controls (
  id tinyint unsigned NOT NULL,
  paused_from datetime(3) DEFAULT NULL,
  reviewed_at datetime(3) DEFAULT NULL,
  reason varchar(500) DEFAULT NULL,
  updated_by varchar(64) DEFAULT NULL,
  updated_at datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`;

export async function ensureAiLevelGiftSchema(database = pool) {
  const connection = await database.getConnection();
  try {
    await connection.query(AI_LEVEL_GIFT_CONTROL_SQL);
    const [[column]] = await connection.query(
      "SELECT column_name FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='ai_level_gift_controls' AND column_name='reviewed_at'",
    );
    if (!column) await connection.query('ALTER TABLE ai_level_gift_controls ADD reviewed_at datetime(3) DEFAULT NULL');
    await connection.query('INSERT IGNORE INTO ai_level_gift_controls (id) VALUES (1)');
    const facts = await readFile(new URL('../migrations/20261106_ai_gift_risk_facts.sql', import.meta.url), 'utf8');
    // 显式迁移含会话级预处理语句，必须在同一条连接上完整执行。
    for (const statement of localSqlStatements(facts)) await connection.query(statement);
  } finally {
    connection.release();
  }
}
