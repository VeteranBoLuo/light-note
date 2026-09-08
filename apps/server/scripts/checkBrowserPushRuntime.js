import pool from '../db/index.js';
import { browserPushEnabled } from '../util/browserPushPolicy.js';
import { assertBrowserPushRuntime } from '../util/browserPushRuntime.js';
try {
  // Read-only: explicitly apply the authorized migration before this check.
  await assertBrowserPushRuntime(pool);
  console.log(
    browserPushEnabled()
      ? '[browser-push] schema/config ready; transport delivery not tested'
      : '[browser-push] disabled; schema ready, push delivery unavailable',
  );
} catch {
  console.error('[browser-push] BROWSER_PUSH_RUNTIME_NOT_READY');
  process.exitCode = 1;
} finally {
  await pool.end();
}
