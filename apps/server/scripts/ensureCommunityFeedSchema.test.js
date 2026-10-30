import { execFile } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, expect, it } from 'vitest';

const run = promisify(execFile);
let fixture;
beforeAll(async () => {
  fixture = await mkdtemp(join(tmpdir(), 'ln-community-schema-cli-'));
  await writeFile(
    join(fixture, 'loader.mjs'),
    `export async function resolve(specifier, context, nextResolve) {
      if (specifier === 'redis' || specifier === 'nodemailer')
        throw new Error('Migration must not load notification transports');
      const result = await nextResolve(specifier, context);
      if (result.url === ${JSON.stringify(new URL('../db/index.js', import.meta.url).href)})
        return { url: new URL('./database.mjs', import.meta.url).href, shortCircuit: true };
      return result;
    }`,
  );
  await writeFile(
    join(fixture, 'database.mjs'),
    `import * as schemas from ${JSON.stringify(new URL('../util/communityFeed/schemaContract.js', import.meta.url).href)};
    export default {
      async query(sql) {
        if (process.env.SCHEMA_CLI_CASE === 'database-error')
          throw Object.assign(new Error('private database detail'), { code: 'ER_TEST_FAILURE' });
        const { REVIEW_SCHEMA } = await import(${JSON.stringify(new URL('../util/communityFeed/reviewQueue.js', import.meta.url).href)});
        const contracts = [...Object.values(schemas), REVIEW_SCHEMA];
        if (sql.includes('information_schema.columns'))
          return [contracts.flatMap(contract => Object.entries(contract).flatMap(([tableName, spec]) =>
            spec.columns.filter(columnName => process.env.SCHEMA_CLI_CASE !== 'missing-schema' || columnName !== 'preview_width')
              .map(columnName => ({tableName, columnName}))))];
        if (sql.includes('information_schema.statistics'))
          return [contracts.flatMap(contract => Object.entries(contract).flatMap(([tableName, spec]) =>
            spec.indexes.map(([indexName, fields, nonUnique]) => ({tableName, indexName, fields, nonUnique}))))];
        return [[]];
      },
      async end() { console.log('SQL_CONNECTION_CLOSED'); }
    };`,
  );
});
afterAll(async () => rm(fixture, { recursive: true, force: true }));

const migrate = (scenario) =>
  run(
    process.execPath,
    [
      '--experimental-loader',
      join(fixture, 'loader.mjs'),
      fileURLToPath(new URL('./ensureCommunityFeedSchema.js', import.meta.url)),
    ],
    { env: { ...process.env, NODE_ENV: 'production', SCHEMA_CLI_CASE: scenario }, timeout: 5000 },
  );
it('installs the schema and exits naturally without loading Redis or notification transports', async () => {
  const result = await migrate('ready');
  expect(result.stdout).toContain('schema ready; feature flags are unchanged');
  expect(result.stdout).toContain('SQL_CONNECTION_CLOSED');
});
it.each([
  ['missing-schema', 'SCHEMA_CONTRACT_MISMATCH'],
  ['database-error', 'ER_TEST_FAILURE'],
])('%s closes SQL and exits with a bounded, sanitized failure', async (scenario, code) => {
  const error = await migrate(scenario).catch((failure) => failure);
  expect(error.code).toBe(1);
  expect(error.killed).toBe(false);
  expect(error.stdout).toContain('SQL_CONNECTION_CLOSED');
  expect(error.stderr).toContain(code);
  expect(error.stderr).not.toContain('private database detail');
});
