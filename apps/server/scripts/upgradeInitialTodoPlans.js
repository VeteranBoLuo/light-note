import pool from '../db/index.js';
import { upgradeInitialTodoPlans } from '../util/services/initialTodoPlanUpgradeService.js';

const args = process.argv.slice(2);
try {
  if (args.some((arg) => arg !== '--apply')) throw new Error('TODO_SAMPLE_UPGRADE_ARGUMENT_INVALID');
  console.log(
    '[todo-sample-upgrade] %s',
    JSON.stringify(await upgradeInitialTodoPlans(pool, { apply: args.includes('--apply') })),
  );
} catch (error) {
  console.error('[todo-sample-upgrade] failed code=%s', error.code || 'TODO_SAMPLE_UPGRADE_FAILED');
  process.exitCode = 1;
} finally {
  await pool.end();
  process.exit(process.exitCode || 0);
}
