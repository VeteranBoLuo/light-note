import { buildNewUserSeedContent, newUserSeedResourceId } from './newUserSeedService.js';
import { ONBOARDING_SEED_VERSION } from '../onboardingSeed.js';
import { invalidatePersonalKnowledgeCache } from '../personalKnowledgeSearch.js';
import { upgradePlainTodoPlan } from './todoSingleTaskService.js';
import {
  VISITOR_EXAMPLE_VERSION,
  exampleHash,
  matchesRollingObject,
  parseExampleManifest,
  readRollingObject,
} from './visitorExampleScheduleService.js';

function emptyChecklist(value) {
  try {
    const parsed = typeof value === 'string' ? JSON.parse(value) : value;
    return Array.isArray(parsed) && parsed.length === 0;
  } catch {
    return false;
  }
}

/** 来源标记之外，再核对原始内容和归属；不按标题猜测普通用户的任务。 */
export function isUnchangedOnboardingTodo(row, { userId, list = null, tagIds = [], references = [] }) {
  if (!row || String(row.user_id) !== String(userId) || Number(row.del_flag) !== 0 || row.status !== 'pending')
    return false;
  if (
    Number(row.plan_version || 1) !== 1 ||
    row.series_id ||
    row.recurrence_rule ||
    row.generated_by_todo_id ||
    Number(row.is_exception || 0)
  )
    return false;
  if (row.due_at || row.start_at || row.completed_at || !emptyChecklist(row.checklist) || references.length)
    return false;
  for (const lang of ['zh-CN', 'en-US']) {
    const seed = buildNewUserSeedContent({ lang });
    for (const [index, todo] of seed.todos.entries()) {
      if (
        row.title !== todo.title ||
        String(row.description || '') !== todo.description ||
        Number(row.priority) !== todo.priority ||
        Number(row.sort_order) !== (index + 1) * 1000
      )
        continue;
      const expectedTags = todo.tagKeys.map((key) => newUserSeedResourceId(userId, `tag:${key}`)).sort();
      if (JSON.stringify([...new Set(tagIds.map(String))].sort()) !== JSON.stringify(expectedTags)) continue;
      if (!todo.listKey) return row.list_id == null;
      const expectedList = seed.todoLists.find((item) => item.key === todo.listKey);
      return Boolean(list && String(list.id) === String(row.list_id) && list.name === expectedList.name);
    }
  }
  return false;
}

async function* owners(database, table, condition, params, { userId, batchSize }) {
  let cursor = '';
  for (;;) {
    const [rows] = await database.query(
      `SELECT DISTINCT user_id FROM ${table} WHERE ${condition} AND user_id>?${userId ? ' AND user_id=?' : ''} ORDER BY user_id LIMIT ?`,
      [...params, cursor, ...(userId ? [userId] : []), batchSize],
    );
    if (!rows.length) return;
    for (const row of rows) yield String(row.user_id);
    cursor = String(rows.at(-1).user_id);
    if (rows.length < batchSize) return;
  }
}

async function withOwner(database, userId, apply, work) {
  const connection = await database.getConnection();
  try {
    if (apply) await connection.beginTransaction();
    const [[user]] = await connection.query(
      `SELECT id,role,del_flag FROM user WHERE id=?${apply ? ' FOR UPDATE' : ''}`,
      [userId],
    );
    const changed = user && Number(user.del_flag) === 0 ? await work(connection, user) : 0;
    if (apply) {
      if (changed) await invalidatePersonalKnowledgeCache(userId, { database: connection });
      await connection.commit();
    }
  } catch (error) {
    if (apply) await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

/** 显式迁移入口与本机启动共用；默认只读。历史任务及修改过的示例不在升级范围。 */
export async function upgradeInitialTodoPlans(database, { apply = false, userId, batchSize = 100, now } = {}) {
  if (!Number.isSafeInteger(batchSize) || batchSize < 1 || batchSize > 200)
    throw new Error('TODO_SAMPLE_UPGRADE_BATCH_INVALID');
  const result = {
    apply,
    onboarding: { scanned: 0, eligible: 0, upgraded: 0, skipped: 0 },
    visitor: { scanned: 0, eligible: 0, upgraded: 0, skipped: 0 },
  };
  const options = { userId, batchSize };
  for await (const owner of owners(
    database,
    'onboarding_seed_resources',
    "resource_type='todo' AND seed_version=?",
    [ONBOARDING_SEED_VERSION],
    options,
  )) {
    await withOwner(database, owner, apply, async (connection) => {
      let changed = 0;
      const [markers] = await connection.query(
        "SELECT resource_id FROM onboarding_seed_resources WHERE user_id=? AND resource_type='todo' AND seed_version=? ORDER BY resource_id",
        [owner, ONBOARDING_SEED_VERSION],
      );
      for (const marker of markers) {
        result.onboarding.scanned++;
        const [[row]] = await connection.query(
          `SELECT * FROM todo_items WHERE id=? AND user_id=?${apply ? ' FOR UPDATE' : ''}`,
          [marker.resource_id, owner],
        );
        let eligible = false;
        if (row && Number(row.plan_version || 1) === 1) {
          const [lists] = row.list_id
            ? await connection.query('SELECT id,name FROM todo_lists WHERE id=? AND user_id=?', [row.list_id, owner])
            : [[]];
          const [tags] = await connection.query(
            "SELECT tag_id FROM todo_tag_relations WHERE user_id=? AND target_type='todo' AND target_id=? ORDER BY tag_id",
            [owner, row.id],
          );
          const [references] = await connection.query(
            'SELECT target_id FROM todo_resource_refs WHERE user_id=? AND todo_id=?',
            [owner, row.id],
          );
          if (
            isUnchangedOnboardingTodo(row, {
              userId: owner,
              list: lists[0],
              tagIds: tags.map((item) => item.tag_id),
              references,
            })
          ) {
            eligible = await upgradePlainTodoPlan(connection, owner, row.id, { apply, now });
          }
        }
        if (eligible) {
          result.onboarding.eligible++;
          if (apply) {
            result.onboarding.upgraded++;
            changed++;
          }
        } else result.onboarding.skipped++;
      }
      return changed;
    });
  }
  for await (const owner of owners(
    database,
    'visitor_example_maintenance',
    'enabled=1 AND version=?',
    [VISITOR_EXAMPLE_VERSION],
    options,
  )) {
    await withOwner(database, owner, apply, async (connection, user) => {
      if (user.role !== 'visitor') return 0;
      const [[state]] = await connection.query(
        `SELECT manifest_json FROM visitor_example_maintenance WHERE user_id=? AND enabled=1 AND version=?${apply ? ' FOR UPDATE' : ''}`,
        [owner, VISITOR_EXAMPLE_VERSION],
      );
      if (!state) return 0;
      const manifest = parseExampleManifest(state.manifest_json);
      let changed = 0;
      for (const entry of manifest.rolling.filter((item) => item.type === 'todo')) {
        result.visitor.scanned++;
        let row;
        try {
          row = await readRollingObject(connection, owner, entry, { lock: apply });
        } catch (error) {
          if (error.code !== 'VISITOR_OBJECT_UNAVAILABLE') throw error;
        }
        const eligible =
          row &&
          matchesRollingObject(entry, row) &&
          (await upgradePlainTodoPlan(connection, owner, entry.id, { apply, allowCompleted: true, now }));
        if (!eligible) {
          result.visitor.skipped++;
          continue;
        }
        result.visitor.eligible++;
        if (apply) {
          entry.offsets.occurrence_date = entry.offsets.due_at ?? entry.offsets.start_at ?? null;
          entry.expected = exampleHash(await readRollingObject(connection, owner, entry));
          result.visitor.upgraded++;
          changed++;
        }
      }
      if (changed)
        await connection.query('UPDATE visitor_example_maintenance SET manifest_json=? WHERE user_id=? AND version=?', [
          JSON.stringify(manifest),
          owner,
          VISITOR_EXAMPLE_VERSION,
        ]);
      return changed;
    });
  }
  return result;
}
