import pool from '../db/index.js';
import { GROWTH_TASK_DEFINITIONS, RETIRED_GROWTH_TASK_KEYS } from './growthTaskCatalog.js';

const GROWTH_TASK_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS growth_tasks (
    id VARCHAR(64) NOT NULL,
    task_key VARCHAR(64) NOT NULL,
    title VARCHAR(128) NOT NULL COMMENT 'i18n key, not display text',
    description VARCHAR(160) NOT NULL COMMENT 'i18n key, not display text',
    reward_exp INT UNSIGNED NOT NULL DEFAULT 0,
    enabled TINYINT(1) NOT NULL DEFAULT 1,
    sort_order SMALLINT UNSIGNED NOT NULL DEFAULT 0,
    create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uk_growth_tasks_task_key (task_key),
    KEY idx_growth_tasks_enabled_order (enabled, sort_order, task_key)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='成长任务定义'
`;

const USER_GROWTH_TASK_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS user_growth_tasks (
    user_id VARCHAR(64) NOT NULL,
    task_key VARCHAR(64) NOT NULL,
    status VARCHAR(16) NOT NULL DEFAULT 'pending' COMMENT 'pending/completed',
    completed_at DATETIME DEFAULT NULL,
    claimed_at DATETIME DEFAULT NULL COMMENT '用户主动领取经验的时间',
    create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, task_key),
    KEY idx_user_growth_tasks_status (user_id, status, completed_at)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='用户成长任务状态'
`;

async function growthTaskStateTableExists() {
  const [[row]] = await pool.query(
    `SELECT COUNT(*) AS tableCount
     FROM information_schema.tables
     WHERE table_schema = DATABASE()
       AND table_name = 'user_growth_tasks'`,
  );
  return Number(row?.tableCount || 0) > 0;
}

async function ensureGrowthTaskClaimedAtColumn() {
  const [[row]] = await pool.query(
    `SELECT COUNT(*) AS columnCount
     FROM information_schema.columns
     WHERE table_schema = DATABASE()
       AND table_name = 'user_growth_tasks'
       AND column_name = 'claimed_at'`,
  );
  if (Number(row?.columnCount || 0) > 0) return false;

  await pool.query(
    `ALTER TABLE user_growth_tasks
     ADD COLUMN claimed_at DATETIME DEFAULT NULL COMMENT '用户主动领取经验的时间'
     AFTER completed_at`,
  );
  // claimed_at 上线前的 completed 记录都已由旧流程自动发奖，或属于明确不补发的历史回填；
  // 只在新增列的这一刻补齐，后续新达成任务必须保持 NULL，等待用户手动领取。
  await pool.query(
    `UPDATE user_growth_tasks
     SET claimed_at = COALESCE(completed_at, update_time, create_time, CURRENT_TIMESTAMP)
     WHERE status = 'completed' AND claimed_at IS NULL`,
  );
  return true;
}

async function seedGrowthTasks() {
  const placeholders = GROWTH_TASK_DEFINITIONS.map(() => '(?, ?, ?, ?, ?, ?, ?)').join(', ');
  const values = GROWTH_TASK_DEFINITIONS.flatMap((task) => [
    task.id,
    task.taskKey,
    task.titleKey,
    task.descriptionKey,
    task.rewardExp,
    task.enabled ? 1 : 0,
    task.sortOrder,
  ]);

  await pool.query(
    `INSERT INTO growth_tasks
      (id, task_key, title, description, reward_exp, enabled, sort_order)
     VALUES ${placeholders}
     ON DUPLICATE KEY UPDATE
       task_key = VALUES(task_key),
       title = VALUES(title),
       description = VALUES(description),
       reward_exp = VALUES(reward_exp),
       enabled = VALUES(enabled),
       sort_order = VALUES(sort_order)`,
    values,
  );
}

async function disableRetiredGrowthTasks() {
  if (!RETIRED_GROWTH_TASK_KEYS.length) return;
  const placeholders = RETIRED_GROWTH_TASK_KEYS.map(() => '?').join(', ');
  await pool.query(`UPDATE growth_tasks SET enabled = 0 WHERE task_key IN (${placeholders})`, [
    ...RETIRED_GROWTH_TASK_KEYS,
  ]);
}

// root 不参与成长奖励，但任务状态仍必须反映真实业务事实，否则工作台会永久展示无法领取的任务。
// 该修复只处理 root，并把满足条件的任务直接收口为已领取，因此可以在每次启动时安全幂等执行。
async function reconcileRootGrowthTasks() {
  await pool.query(
    `INSERT INTO user_growth_tasks (user_id, task_key, status, completed_at, claimed_at)
     SELECT user_id, task_key, 'completed', completed_at, completed_at
     FROM (
       SELECT u.id AS user_id, 'profile_avatar' AS task_key,
              COALESCE(u.create_time, CURRENT_TIMESTAMP) AS completed_at
       FROM \`user\` u
       WHERE COALESCE(TRIM(u.head_picture), '') <> ''
         AND COALESCE(u.del_flag, 0) = 0
         AND u.role = 'root'
       UNION ALL
       SELECT n.create_by AS user_id, 'first_note' AS task_key, MIN(n.create_time) AS completed_at
       FROM note n
       INNER JOIN \`user\` u ON u.id = n.create_by
       WHERE n.del_flag = 0
         AND COALESCE(u.del_flag, 0) = 0
         AND u.role = 'root'
         AND NOT EXISTS (
           SELECT 1
           FROM onboarding_seed_resources osr
           WHERE osr.user_id = n.create_by
             AND osr.resource_type = 'note'
             AND osr.resource_id = n.id
         )
       GROUP BY n.create_by
       UNION ALL
       SELECT b.user_id, 'first_bookmark' AS task_key, MIN(b.create_time) AS completed_at
       FROM bookmark b
       INNER JOIN \`user\` u ON u.id = b.user_id
       WHERE b.del_flag = 0
         AND COALESCE(u.del_flag, 0) = 0
         AND u.role = 'root'
         AND NOT EXISTS (
           SELECT 1
           FROM onboarding_seed_resources osr
           WHERE osr.user_id = b.user_id
             AND osr.resource_type = 'bookmark'
             AND osr.resource_id = b.id
         )
       GROUP BY b.user_id
       UNION ALL
       SELECT t.user_id, 'first_todo' AS task_key, MIN(t.create_time) AS completed_at
       FROM todo_items t
       INNER JOIN \`user\` u ON u.id = t.user_id
       WHERE t.del_flag = 0
         AND COALESCE(u.del_flag, 0) = 0
         AND u.role = 'root'
       GROUP BY t.user_id
     ) root_tasks
     ON DUPLICATE KEY UPDATE
       status = 'completed',
       completed_at = COALESCE(user_growth_tasks.completed_at, VALUES(completed_at)),
       claimed_at = COALESCE(user_growth_tasks.claimed_at, VALUES(claimed_at))`,
  );
}

// 迁移前已经完成过的激活动作只补齐状态，不重新发放经验；这样新任务不会与旧账本重复奖励。
async function backfillHistoricalGrowthTasks() {
  await pool.query(
    `INSERT IGNORE INTO user_growth_tasks (user_id, task_key, status, completed_at, claimed_at)
     SELECT user_id, task_key, 'completed', completed_at, completed_at
     FROM (
       SELECT u.id AS user_id, 'profile_avatar' AS task_key,
              COALESCE(u.create_time, CURRENT_TIMESTAMP) AS completed_at
       FROM \`user\` u
       WHERE COALESCE(TRIM(u.head_picture), '') <> ''
         AND COALESCE(u.del_flag, 0) = 0
         AND COALESCE(u.role, 'user') NOT IN ('visitor', 'root')
       UNION ALL
       SELECT n.create_by AS user_id, 'first_note' AS task_key, MIN(n.create_time) AS completed_at
       FROM note n
       WHERE n.del_flag = 0
         AND NOT EXISTS (
           SELECT 1
           FROM onboarding_seed_resources osr
           WHERE osr.user_id = n.create_by
             AND osr.resource_type = 'note'
             AND osr.resource_id = n.id
         )
       GROUP BY n.create_by
       UNION ALL
       SELECT b.user_id, 'first_bookmark' AS task_key, MIN(b.create_time) AS completed_at
       FROM bookmark b
       WHERE b.del_flag = 0
         AND NOT EXISTS (
           SELECT 1
           FROM onboarding_seed_resources osr
           WHERE osr.user_id = b.user_id
             AND osr.resource_type = 'bookmark'
             AND osr.resource_id = b.id
         )
       GROUP BY b.user_id
       UNION ALL
       SELECT user_id, 'first_todo' AS task_key, MIN(create_time) AS completed_at
       FROM todo_items
       WHERE del_flag = 0
       GROUP BY user_id
     ) historical_tasks`,
  );
}

let ensurePromise = null;

// 启动时兜底创建表并幂等初始化首批任务；正式环境仍需执行同名 migration 作为发布记录。
export function ensureGrowthTaskSchema() {
  if (!ensurePromise) {
    ensurePromise = (async () => {
      const userStateTableExisted = await growthTaskStateTableExists();
      await pool.query(GROWTH_TASK_TABLE_SQL);
      await pool.query(USER_GROWTH_TASK_TABLE_SQL);
      const claimedAtColumnAdded = await ensureGrowthTaskClaimedAtColumn();
      await seedGrowthTasks();
      await disableRetiredGrowthTasks();
      await reconcileRootGrowthTasks();
      // 历史回填只在旧表首次升级到手动领取模型时执行。若每次启动都跑，未来某次业务钩子
      // 临时失败后会把新达成任务误当历史任务并直接标记已领取。
      if (!userStateTableExisted || claimedAtColumnAdded) await backfillHistoricalGrowthTasks();
    })().catch((error) => {
      ensurePromise = null;
      throw error;
    });
  }
  return ensurePromise;
}

export {
  GROWTH_TASK_TABLE_SQL,
  USER_GROWTH_TASK_TABLE_SQL,
  backfillHistoricalGrowthTasks,
  disableRetiredGrowthTasks,
  ensureGrowthTaskClaimedAtColumn,
  growthTaskStateTableExists,
  reconcileRootGrowthTasks,
};
