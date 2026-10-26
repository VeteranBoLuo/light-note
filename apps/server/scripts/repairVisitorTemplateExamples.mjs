#!/usr/bin/env node
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const args = process.argv.slice(2);
const apply = args.includes('--apply');
const option = (name, fallback) => {
  const i = args.indexOf(name);
  if (i < 0) return fallback;
  if (!args[i + 1] || args[i + 1].startsWith('--')) throw new Error('VISITOR_OPTION_INVALID');
  return args[i + 1];
};
const stateDir = path.resolve(
  option('--state-dir', path.join(os.homedir(), '.local/state/light-note/visitor-template-fix')),
);
// Explicit invocation only; dry-run cannot write to a remote database.
process.env.ALLOW_REMOTE_DATABASE_READS = apply ? 'false' : 'true';
process.env.ALLOW_REMOTE_DATABASE_WRITES = apply ? 'true' : 'false';
const { default: pool } = await import('../db/index.js');
const { readVisitorTemplateExamples, applyVisitorTemplateExamples } =
  await import('../util/services/visitorTemplateExampleService.js');
async function save(name, value) {
  await fs.mkdir(stateDir, { recursive: true, mode: 0o700 });
  await fs.chmod(stateDir, 0o700);
  const target = path.join(stateDir, name);
  await fs.writeFile(target, JSON.stringify(value, null, 2), { flag: 'wx', mode: 0o600 });
  return target;
}
let connection;
try {
  const [users] = await pool.query("SELECT id FROM user WHERE role='visitor' AND del_flag=0 LIMIT 2");
  const owner = option('--owner', users.length === 1 ? String(users[0].id) : null);
  if (!owner) throw new Error('VISITOR_OWNER_REQUIRED');
  const plan = await readVisitorTemplateExamples(pool, owner);
  const changed = plan.filter((item) => item.changed);
  const stamp = `${Date.now()}-${process.pid}`;
  const planFile = await save(`plan-${stamp}.json`, { owner, plan });
  if (apply && changed.length) {
    connection = await pool.getConnection();
    await connection.beginTransaction();
    await applyVisitorTemplateExamples(connection, owner, plan);
    await save(`candidate-${stamp}.json`, { owner, plan });
    if (args.includes('--test-rollback')) throw new Error('VISITOR_TEST_ROLLBACK');
    await connection.commit();
    connection.release();
    connection = null;
    await save(`completed-${stamp}.json`, { owner, changed: changed.map((n) => n.id) });
    const { invalidatePersonalKnowledgeCache } = await import('../util/personalKnowledgeSearch.js');
    await invalidatePersonalKnowledgeCache(owner, { persist: true }).catch(() => {});
  }
  console.log(
    JSON.stringify({
      mode: apply ? 'applied' : 'dry-run',
      planFile,
      notes: plan.map((n) => ({ title: n.title, from: n.before.type, to: n.after.type, changed: n.changed })),
    }),
  );
} catch (error) {
  if (connection) await connection.rollback();
  console.error(
    '[visitor-template-fix] stopped code=%s',
    /^[A-Z][A-Z0-9_]+$/.test(error?.code || error?.message || '')
      ? error.code || error.message
      : 'VISITOR_TEMPLATE_FIX_FAILED',
  );
  process.exitCode = 1;
} finally {
  if (connection) connection.release();
  await pool.end();
  const { default: redis } = await import('../util/redisClient.js');
  if (redis.isOpen) redis.destroy();
}
