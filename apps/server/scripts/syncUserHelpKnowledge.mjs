/** Explicit, reviewable product-knowledge maintenance; no startup hook or automatic publication. */
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import pool from '../db/index.js';
import redis from '../util/redisClient.js';
import { RANKS } from '../util/growth.js';
import { getStatusForUser } from '../util/aiQuota.js';
import { getActiveEconomyCatalog } from '../util/pointsEconomyCatalog.js';
import { MAKEUP_WINDOW_DAYS } from '@lightnote/shared';
import { buildHelpKnowledgeRefreshEntries } from '../util/helpKnowledgeRefreshContent.js';
import {
  assertKnowledgePlanCurrent,
  buildKnowledgeMaintenancePlan,
  knowledgeMaintenanceHash,
  knowledgeMatches,
  knowledgeSnapshotHash,
  summarizeKnowledgePlan,
} from '../util/knowledgeMaintenancePlan.js';
import { upsertKnowledgeBase, updateKnowledgeBaseById } from '../util/services/knowledgeBaseService.js';
import { beginAdminAction, finishAdminAction } from '../util/adminActionExecution.js';

const args = process.argv.slice(2);
const modes = args.filter((arg) => ['--prepare', '--apply', '--verify', '--restore'].includes(arg));
if (
  modes.length > 1 ||
  args.some(
    (arg) => !['--prepare', '--apply', '--verify', '--restore'].includes(arg) && !arg.startsWith('--state-dir='),
  )
)
  throw new Error('INVALID_ARGUMENTS');
const mode = modes[0] || '--preview';
const directory = args.find((arg) => arg.startsWith('--state-dir='))?.slice('--state-dir='.length);
if (mode !== '--preview' && !path.isAbsolute(directory || '')) throw new Error('PRIVATE_STATE_DIRECTORY_REQUIRED');

const load = async (name) => JSON.parse(await fs.readFile(path.join(directory, name), 'utf8'));
async function save(name, value, exclusive = false) {
  const file = path.join(directory, name);
  if (exclusive) return fs.writeFile(file, JSON.stringify(value, null, 2), { mode: 0o600, flag: 'wx' });
  await fs.writeFile(file + '.tmp', JSON.stringify(value, null, 2), { mode: 0o600 });
  await fs.rename(file + '.tmp', file);
}
async function stateDirectory() {
  await fs.mkdir(directory, { recursive: true, mode: 0o700 });
  if ((await fs.stat(directory)).mode & 0o077) throw new Error('STATE_DIRECTORY_NOT_PRIVATE');
}
async function readRows() {
  const [rows] = await pool.query(
    'SELECT id,title,content,category,help_section,status,type,sort,COALESCE(admin_archived,0) AS admin_archived FROM knowledge_base ORDER BY sort,title LIMIT 501',
  );
  if (rows.length > 500) throw new Error('KNOWLEDGE_SCOPE_TOO_LARGE');
  return rows;
}
async function readFacts() {
  const catalog = getActiveEconomyCatalog();
  const frame = catalog.frameItems.find((item) => item.id === 'frame_galaxy');
  return {
    ranks: RANKS.map(({ level, aiTokenDaily, spaceMb, trashDays }) => ({ level, aiTokenDaily, spaceMb, trashDays })),
    guestQuota: (await getStatusForUser(null, 'visitor')).quota,
    makeupWindowDays: MAKEUP_WINDOW_DAYS,
    galaxyFrame: frame && { cost: frame.cost, minLevel: frame.minLevel },
    economyVersion: catalog.version,
  };
}
async function receipts() {
  try {
    return await load('receipts.json');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    return { items: {} };
  }
}
async function rootUser() {
  const [[user]] = await pool.query(
    "SELECT id,role FROM user WHERE role='root' AND del_flag='0' ORDER BY create_time LIMIT 1",
  );
  if (!user) throw new Error('ROOT_REQUIRED');
  return user;
}
async function mutate(user, input, { id, expectedSnapshot, create = false, requestId, restore = false } = {}) {
  const publishing = create && input.status === 'public';
  let context;
  try {
    context = await beginAdminAction(
      {
        user,
        requestId,
        body: {
          reason: restore ? '按维护快照恢复帮助知识内容' : '同步用户功能帮助并修正过时知识说明',
          confirmed: true,
          confirmText: publishing ? '确认发布知识' : undefined,
        },
      },
      {
        action: publishing ? 'knowledge_base.publish' : create ? 'knowledge_base.create' : 'knowledge_base.update',
        targetId: id || null,
        expectedConfirmText: publishing ? '确认发布知识' : null,
        metadata: {
          operation: create ? 'create' : 'update',
          maintenance: 'user-help-refresh',
          contentLength: input.content?.length || null,
          resultingStatus: input.status,
        },
      },
    );
    return create
      ? await upsertKnowledgeBase({ userId: user.id, input, createOnly: true, actionContext: context })
      : await updateKnowledgeBaseById({ userId: user.id, id, patch: input, expectedSnapshot, actionContext: context });
  } catch (error) {
    if (context)
      await finishAdminAction(context, {
        outcome: 'failed',
        metadata: { errorCode: /^[A-Z_]+$/.test(error.code || '') ? error.code : 'KNOWLEDGE_MAINTENANCE_FAILED' },
      });
    throw error;
  }
}
async function verify(plan) {
  const rows = await readRows();
  const verified = plan.items.map((item) => {
    const row = rows.find((row) => row.title === item.input.title && !Number(row.admin_archived));
    if (!knowledgeMatches(row, item.input) || (item.before && row.id !== item.before.id))
      throw new Error('KNOWLEDGE_VERIFICATION_FAILED');
    return {
      key: item.key,
      id: row.id,
      title: row.title,
      category: row.category,
      status: row.status,
      helpSection: row.help_section,
      hash: knowledgeSnapshotHash(row),
    };
  });
  const unrelatedChanges = plan.untouched.filter((item) => {
    const current = rows.find((row) => row.id === item.id);
    return !current || knowledgeSnapshotHash(current) !== item.hash;
  });
  const result = {
    mode: 'verified',
    articles: verified,
    articleCount: verified.length,
    existingIdsPreserved: true,
    unrelatedChangedCount: unrelatedChanges.length,
    archivedRetained: plan.untouched.filter((item) => item.archived).length,
    verifiedAt: new Date().toISOString(),
  };
  await save('verified.json', result);
  if (unrelatedChanges.length) throw new Error('UNRELATED_KNOWLEDGE_CHANGED');
  console.log(JSON.stringify(result));
}
async function apply(plan, entries, facts) {
  if (knowledgeMaintenanceHash(entries) !== plan.manifestHash || knowledgeMaintenanceHash(facts) !== plan.factsHash)
    throw new Error('KNOWLEDGE_PLAN_OUTDATED');
  assertKnowledgePlanCurrent(plan, await readRows());
  const journal = await receipts();
  if (journal.restored) throw new Error('KNOWLEDGE_PLAN_RESTORED');
  const user = await rootUser();
  for (const item of plan.items) {
    const currentRows = await readRows();
    const current = currentRows.find((row) =>
      item.before ? row.id === item.before.id : row.title === item.input.title,
    );
    if (knowledgeMatches(current, item.input)) {
      journal.items[item.key] = {
        ...journal.items[item.key],
        id: current.id,
        afterHash: knowledgeSnapshotHash(current),
        state: 'verified',
      };
      await save('receipts.json', journal);
      continue;
    }
    if (item.before && (!current || knowledgeSnapshotHash(current) !== item.expectedSnapshot))
      throw new Error('KNOWLEDGE_CHANGED');
    const receipt = journal.items[item.key] || { requestId: randomUUID(), state: 'started', changed: true };
    journal.items[item.key] = receipt;
    await save('receipts.json', journal);
    const result = await mutate(user, item.input, {
      create: !item.before,
      id: item.before?.id,
      expectedSnapshot: item.expectedSnapshot,
      requestId: receipt.requestId,
    });
    const row = (await readRows()).find((row) => row.id === result.id);
    if (!knowledgeMatches(row, item.input)) throw new Error('KNOWLEDGE_WRITE_UNCONFIRMED');
    journal.items[item.key] = {
      ...receipt,
      state: 'verified',
      id: row.id,
      afterHash: knowledgeSnapshotHash(row),
      auditId: result.auditId,
    };
    await save('receipts.json', journal);
  }
  await verify(plan);
}
async function restore(plan) {
  const journal = await receipts();
  if (journal.restored) {
    console.log(JSON.stringify({ mode: 'restored', alreadyRestored: true }));
    return;
  }
  const selected = [...plan.items]
    .reverse()
    .filter((item) => journal.items[item.key]?.changed && !journal.items[item.key].restored);
  const rows = await readRows();
  for (const item of selected) {
    const receipt = journal.items[item.key];
    const current = rows.find((row) => row.id === receipt.id);
    const restoredInput = item.before
      ? { ...item.before, helpSection: item.before.help_section }
      : { ...item.input, status: 'internal' };
    if (knowledgeMatches(current, restoredInput)) {
      receipt.restored = true;
      continue;
    }
    if (!current || knowledgeSnapshotHash(current) !== receipt.afterHash) throw new Error('KNOWLEDGE_RESTORE_CONFLICT');
  }
  const user = await rootUser();
  for (const item of selected) {
    const receipt = journal.items[item.key];
    if (receipt.restored) continue;
    const before = item.before;
    const input = before
      ? {
          title: before.title,
          content: before.content,
          category: before.category,
          helpSection: before.help_section,
          status: before.status,
          type: before.type,
        }
      : { status: 'internal' };
    await mutate(user, input, {
      id: receipt.id,
      expectedSnapshot: receipt.afterHash,
      requestId: randomUUID(),
      restore: true,
    });
    receipt.restored = true;
    receipt.afterHash = knowledgeSnapshotHash((await readRows()).find((row) => row.id === receipt.id));
    await save('receipts.json', journal);
  }
  journal.restored = true;
  await save('receipts.json', journal);
  console.log(
    JSON.stringify({
      mode: 'restored',
      restoredArticles: selected.length,
      newArticlesKeptInternal: selected.filter((item) => !item.before).length,
    }),
  );
}
try {
  if (mode !== '--preview') await stateDirectory();
  if (['--apply', '--verify', '--restore'].includes(mode)) {
    const plan = await load('plan.json');
    if (mode === '--verify') await verify(plan);
    else if (mode === '--restore') await restore(plan);
    else {
      const facts = await readFacts();
      await apply(plan, buildHelpKnowledgeRefreshEntries(facts), facts);
    }
  } else {
    const facts = await readFacts();
    const plan = {
      ...buildKnowledgeMaintenancePlan(await readRows(), buildHelpKnowledgeRefreshEntries(facts)),
      factsHash: knowledgeMaintenanceHash(facts),
      preparedAt: new Date().toISOString(),
    };
    if (mode === '--prepare') await save('plan.json', plan, true);
    console.log(JSON.stringify({ mode: mode.slice(2), ...summarizeKnowledgePlan(plan) }));
  }
} catch (error) {
  const code = error.code || String(error.message || '').split(':')[0];
  console.error(JSON.stringify({ error: /^[A-Z_]+$/.test(code) ? code : 'KNOWLEDGE_MAINTENANCE_FAILED' }));
  process.exitCode = 1;
} finally {
  await pool.end();
  if (redis.isOpen) await redis.quit();
}
