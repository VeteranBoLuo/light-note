// Independent CLI entry for the shared on-demand read-only report.
import { generateCoreUsageReport, normalizeCoreUsageOptions } from '../util/services/coreUsageReport.js';
const HELP = `Usage: node scripts/reportCoreUsage.js --storage-offset=+08:00 [--days=28] [--as-of=ISO_TIMESTAMP]
  --growth-coverage-start=ISO_TIMESTAMP      Only set after verifying collection coverage.
  --conversion-coverage-start=ISO_TIMESTAMP  Only set after verifying collection coverage.
Dates require an explicit timezone. Missing coverage produces null rates, not zero.
Outputs aggregate JSON on stdout; diagnostics go to stderr. No file or database writes.
`;
async function main() {
  if (process.argv.slice(2).includes('--help')) {
    process.stdout.write(HELP);
    return;
  }
  const names = {
    days: 'days',
    'as-of': 'asOf',
    'storage-offset': 'storageOffset',
    'growth-coverage-start': 'growthCoverageStart',
    'conversion-coverage-start': 'conversionCoverageStart',
  };
  const options = {};
  for (const arg of process.argv.slice(2)) {
    const match = /^--([^=]+)=(.+)$/.exec(arg);
    const key = match && names[match[1]];
    if (!key || Object.hasOwn(options, key))
      throw Object.assign(new Error('CORE_USAGE_INVALID_OPTIONS'), { code: 'CORE_USAGE_INVALID_OPTIONS' });
    options[key] = key === 'days' ? Number(match[2]) : match[2];
  }
  normalizeCoreUsageOptions(options); // Reject invalid input before loading infrastructure.
  process.env.ALLOW_REMOTE_DATABASE_READS = 'true';
  process.env.ALLOW_REMOTE_DATABASE_WRITES = 'false';
  console.log = (...args) => console.error(...args);
  const { default: db } = await import('../db/index.js');
  try {
    const { getOperationalLogRetentionConfig } = await import('../util/operationalLogRetention.js');
    options.conversionRetentionDays = getOperationalLogRetentionConfig().retentionDays;
    const report = await generateCoreUsageReport(db, options);
    process.stdout.write(JSON.stringify(report, null, 2) + '\n');
  } finally {
    await db.end();
  }
}
main().catch((error) => {
  console.error(
    JSON.stringify({ code: /^CORE_USAGE_[A-Z_]+$/.test(error?.code || '') ? error.code : 'CORE_USAGE_REPORT_FAILED' }),
  );
  process.exitCode = 1;
});
