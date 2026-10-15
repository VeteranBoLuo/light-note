import pool from '../db/index.js';
import { archiveHistoricalAsyncJobs, planHistoricalAsyncJobArchive } from '../util/adminAsyncJobArchive.js';

const args = process.argv.slice(2);
const value = (key) => args.find((arg) => arg.startsWith(`--${key}=`))?.slice(key.length + 3);
try {
  if (args.includes('--apply')) {
    const result = await archiveHistoricalAsyncJobs({
      expectedTotal: Number(value('expected-total')),
      expectedDigest: value('expected-digest'),
      actorUserId: value('actor'),
      reason: value('reason'),
    });
    console.log(JSON.stringify({ applied: true, ...result, taskStatesChanged: false, emailsSent: 0 }));
  } else {
    const { entries: _entries, ...plan } = await planHistoricalAsyncJobArchive();
    console.log(JSON.stringify({ applied: false, ...plan }));
  }
} catch (error) {
  console.error('[async-job-archive] failed code=%s', error?.code || 'ARCHIVE_FAILED');
  process.exitCode = 1;
} finally {
  await pool.end();
}
