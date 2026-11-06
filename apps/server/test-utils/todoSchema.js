import { readFile } from 'node:fs/promises';
import { localSqlStatements } from '../util/localSqlStatements.js';

/** 使用正式 MySQL 5.7 迁移，避免新入口测试继续沿用只有旧字段的夹具。 */
export async function installTodoTestSchema(connection) {
  await connection.query(`CREATE TABLE IF NOT EXISTS tag (
    id varchar(255) CHARACTER SET utf8 COLLATE utf8_general_ci PRIMARY KEY,
    user_id varchar(255) CHARACTER SET utf8 COLLATE utf8_general_ci,
    del_flag tinyint NOT NULL DEFAULT 0
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
  await connection.query(`CREATE TABLE IF NOT EXISTS notification (
    id char(36) PRIMARY KEY, user_id varchar(255) CHARACTER SET utf8 COLLATE utf8_general_ci,
    meta JSON DEFAULT NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
  for (const file of [
    '20260715_todo_action_center.sql',
    '20260806_todo_plan_v2.sql',
    '20260908_todo_workspace.sql',
    '20260731_todo_resource_refs.sql',
    '20260807_todo_single_task_schedule.sql',
  ]) {
    const source = await readFile(new URL(`../migrations/${file}`, import.meta.url), 'utf8');
    for (const statement of localSqlStatements(source)) {
      // 旧迁移依赖 MySQL 5.7 的默认排序规则；MySQL 8 临时实例须显式沿用同一基线。
      const sql = statement.replace(/DEFAULT CHARSET=utf8mb4(?!\s+COLLATE)/i, 'DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci');
      await connection.query(sql);
    }
  }
}
