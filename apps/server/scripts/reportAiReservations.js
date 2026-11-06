#!/usr/bin/env node
import { generateReservationReport, normalizeReservationReportOptions } from '../util/aiQuotaReservationReport.js';
import { stableAgentErrorCode } from '../util/agent/logSafety.js';

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 1 && args[0] === '--help') {
    process.stdout.write(
      'Usage: node scripts/reportAiReservations.js [--days=90] [--limit=20000]\nRead-only aggregate report; no account IDs, inputs or file writes.\n',
    );
    return;
  }
  const options = {};
  for (const argument of args) {
    const match = /^--(days|limit)=(\d+)$/.exec(argument);
    if (!match || Object.hasOwn(options, match[1])) {
      throw Object.assign(new Error('AI_RESERVATION_REPORT_OPTIONS_INVALID'), {
        code: 'AI_RESERVATION_REPORT_OPTIONS_INVALID',
      });
    }
    options[match[1]] = Number(match[2]);
  }
  normalizeReservationReportOptions(options);
  const dotenv = (await import('dotenv')).default;
  dotenv.config({ path: process.env.DOTENV_CONFIG_PATH || new URL('../.env', import.meta.url).pathname, quiet: true });
  if (process.env.LIGHTNOTE_LOCAL_TEST !== '1' && process.env.LIGHTNOTE_DATABASE_SCOPE !== 'local')
    process.env.ALLOW_REMOTE_DATABASE_READS = 'true';
  process.env.ALLOW_REMOTE_DATABASE_WRITES = 'false';
  console.log = (...values) => console.error(...values);
  const { default: database } = await import('../db/index.js');
  try {
    process.stdout.write(JSON.stringify(await generateReservationReport(database, options), null, 2) + '\n');
  } finally {
    await database.end();
  }
}
main().catch((error) => {
  console.error(JSON.stringify({ code: stableAgentErrorCode(error) }));
  process.exitCode = 1;
});
