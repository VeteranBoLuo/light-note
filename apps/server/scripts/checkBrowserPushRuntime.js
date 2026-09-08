import pool from '../db/index.js';
import { assertBrowserPushRuntime } from '../util/browserPushRuntime.js';
try {
  // Read-only: explicitly apply the authorized migration before this check.
  await assertBrowserPushRuntime(pool);
  console.log('[browser-push] schema/config ready; transport delivery not tested');
} catch {
  console.error('[browser-push] BROWSER_PUSH_RUNTIME_NOT_READY');
  process.exitCode = 1;
} finally {
  await pool.end();
}
