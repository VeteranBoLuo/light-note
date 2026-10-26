#!/usr/bin/env node
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const args = process.argv.slice(2);
const apply = args.includes('--apply');
const option = (name, fallback) => {
  const i = args.indexOf(name);
  if (i < 0) return fallback;
  if (!args[i + 1] || args[i + 1].startsWith('--')) throw new Error('VISITOR_SHOWCASE_OPTION_INVALID');
  return args[i + 1];
};
const planPath = option('--plan', null);
if (apply && !planPath) throw new Error('VISITOR_SHOWCASE_PLAN_REQUIRED');
const stateDir = path.resolve(
  option('--state-dir', path.join(os.homedir(), '.local/state/light-note/visitor-showcase')),
);
process.env.ALLOW_REMOTE_DATABASE_READS = apply ? 'false' : 'true';
process.env.ALLOW_REMOTE_DATABASE_WRITES = apply ? 'true' : 'false';
const { default: pool } = await import('../db/index.js');
const { readVisitorShowcasePlan, applyVisitorShowcasePlan, validateVisitorShowcasePlan } =
  await import('../util/services/visitorNoteShowcaseService.js');
async function save(name, value) {
  await fs.mkdir(stateDir, { recursive: true, mode: 0o700 });
  await fs.chmod(stateDir, 0o700);
  const target = path.join(stateDir, name);
  await fs.writeFile(target, JSON.stringify(value, null, 2), { flag: 'wx', mode: 0o600 });
  return target;
}
let connection;
try {
  const stamp = `${Date.now()}-${process.pid}`;
  if (!apply) {
    const [users] = await pool.query("SELECT id FROM user WHERE role='visitor' AND del_flag=0 LIMIT 2");
    const owner = option('--owner', users.length === 1 ? String(users[0].id) : null);
    if (!owner) throw new Error('VISITOR_OWNER_REQUIRED');
    const plan = await readVisitorShowcasePlan(pool, owner);
    const planFile = await save(`plan-${stamp}.json`, plan);
    console.log(
      JSON.stringify({
        mode: 'dry-run',
        planFile,
        notes: plan.changes.map((n) => ({
          title: n.title,
          from: n.before.type,
          to: n.after.type,
          changed: n.before.type !== n.after.type || n.before.content !== n.after.content,
        })),
      }),
    );
  } else {
    const plan = validateVisitorShowcasePlan(JSON.parse(await fs.readFile(path.resolve(planPath), 'utf8')));
    if (option('--owner', plan.owner) !== plan.owner) throw new Error('VISITOR_SHOWCASE_OWNER_CONFLICT');
    await save(`before-${stamp}.json`, plan);
    connection = await pool.getConnection();
    await connection.beginTransaction();
    const changed = await applyVisitorShowcasePlan(connection, plan);
    await save(`candidate-${stamp}.json`, { planHash: plan.hash, changed });
    if (args.includes('--test-rollback')) throw new Error('VISITOR_TEST_ROLLBACK');
    await connection.commit();
    connection.release();
    connection = null;
    await save(`completed-${stamp}.json`, { planHash: plan.hash, changed });
    if (changed.length) {
      const { invalidatePersonalKnowledgeCache } = await import('../util/personalKnowledgeSearch.js');
      await invalidatePersonalKnowledgeCache(plan.owner, { persist: true }).catch(() => {});
    }
    console.log(JSON.stringify({ mode: 'applied', planHash: plan.hash, changed: changed.length }));
  }
} catch (error) {
  if (connection) await connection.rollback();
  console.error(
    '[visitor-showcase] stopped code=%s',
    /^[A-Z][A-Z0-9_]+$/.test(error?.code || error?.message || '')
      ? error.code || error.message
      : 'VISITOR_SHOWCASE_FAILED',
  );
  process.exitCode = 1;
} finally {
  if (connection) connection.release();
  await pool.end();
  const { default: redis } = await import('../util/redisClient.js');
  if (redis.isOpen) redis.destroy();
}
