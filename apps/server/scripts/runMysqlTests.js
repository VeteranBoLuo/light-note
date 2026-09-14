import { spawn } from 'node:child_process';
import { mkdtemp, readFile, realpath, rm, stat } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import mysql from 'mysql2/promise';

// These suites create and remove their own random schemas. Never load application .env.
const suites = {
  'util/services/resourceReuseService.mysql.test.js': 'LIGHTNOTE_TEST_MYSQL_SOCKET',
  'router_handle/noteLibraryHandle.persistence.mysql.test.js': 'P01_TEST_MYSQL_SOCKET',
  'router_handle/workbenchRecentNotes.mysql.test.js': 'Q01_TEST_MYSQL_SOCKET',
  'util/services/managedCloudUpload.concurrent.mysql.test.js': 'Q01_TEST_MYSQL_SOCKET',
  'router_handle/noteLibraryHandle.sort.mysql.test.js': 'API_SORT_MYSQL_SOCKET',
  'util/services/noteTreeService.move.mysql.test.js': 'API_SORT_MYSQL_SOCKET',
  'util/services/cloudFolderTreeService.sort.mysql.test.js': 'API_SORT_MYSQL_SOCKET',
  'util/services/growthMeasurement.mysql.test.js': 'M01_TEST_MYSQL_SOCKET',
  'util/services/coreUsageReport.mysql.test.js': 'M02_TEST_MYSQL_SOCKET',
};

async function main() {
  const socket = process.env.LIGHTNOTE_TEST_MYSQL_SOCKET;
  if (!socket || !/^\/(?:private\/)?tmp\//.test(socket)) {
    throw new Error('Set LIGHTNOTE_TEST_MYSQL_SOCKET to a disposable MySQL socket under /tmp.');
  }
  const resolved = await realpath(socket);
  if (!/^\/(?:private\/)?tmp\//.test(resolved) || !(await stat(resolved)).isSocket()) {
    throw new Error('A real temporary Unix socket is required; TCP and non-temporary symlinks are rejected.');
  }
  const db = await mysql.createConnection({ socketPath: resolved, user: 'root', connectTimeout: 5000 });
  try {
    const [[row]] = await db.query('SELECT VERSION() AS version, @@global.skip_networking AS isolated');
    if (!/^(5\.7\.|8\.)/.test(row.version) || /mariadb/i.test(row.version) || Number(row.isolated) !== 1) {
      throw new Error('Use a disposable MySQL 5.7/8 instance started with --skip-networking.');
    }
    if (process.env.CI && !row.version.startsWith('5.7.')) {
      throw new Error('CI must exercise the production MySQL 5.7 compatibility baseline.');
    }
    console.log(`[mysql-tests] MySQL ${row.version}; isolated socket; ${Object.keys(suites).length} suites`);
  } finally {
    await db.end();
  }

  const dir = await mkdtemp('/tmp/light-note-mysql-results-');
  try {
    const reportPath = `${dir}/results.json`;
    const require = createRequire(import.meta.url);
    const vitest = fileURLToPath(new URL('vitest.mjs', pathToFileURL(require.resolve('vitest/package.json'))));
    const code = await new Promise((resolve, reject) => {
      const child = spawn(
        process.execPath,
        [
          vitest,
          'run',
          ...Object.keys(suites),
          '--maxWorkers=2',
          '--minWorkers=1',
          '--reporter=default',
          '--reporter=json',
          `--outputFile.json=${reportPath}`,
        ],
        {
          cwd: fileURLToPath(new URL('../', import.meta.url)),
          stdio: 'inherit',
          env: {
            ...process.env,
            NODE_ENV: 'test',
            ...Object.fromEntries(Object.values(suites).map((key) => [key, resolved])),
          },
        },
      );
      child.once('error', reject);
      child.once('exit', (status) => resolve(status ?? 1));
    });
    if (code !== 0) throw new Error('MySQL integration tests failed.');
    const report = JSON.parse(await readFile(reportPath, 'utf8'));
    if (!report.success) throw new Error('MySQL test report contains failures.');
    // A green run with missing/disabled fixtures must not silently pass the release gate.
    for (const suite of Object.keys(suites)) {
      const result = report.testResults?.find((item) => item.name.endsWith(`/${suite}`));
      if (!result?.assertionResults?.length || result.assertionResults.some((item) => item.status !== 'passed')) {
        throw new Error(`MySQL suite was missing, skipped or failed: ${suite}`);
      }
    }
    console.log(`[mysql-tests] ${report.numPassedTests} tests passed; no skipped suites.`);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(`[mysql-tests] ${error.code || error.message}`);
  process.exitCode = 1;
});
