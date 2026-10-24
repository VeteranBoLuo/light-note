import { execFile } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const run = promisify(execFile);
let fixture;

beforeAll(async () => {
  fixture = await mkdtemp(join(tmpdir(), 'ln-email-schema-cli-'));
  // Run the real CLI in a child process. Only SQL is replaced; importing any
  // notification transport fails, so the migration cannot acquire daemon handles.
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
    `export default {
      async query(sql) {
        if (process.env.SCHEMA_CLI_CASE === 'database-error')
          throw Object.assign(new Error('private database detail'), { code: 'ER_TEST_FAILURE' });
        if (sql.includes('information_schema.columns'))
          return [[{ total: process.env.SCHEMA_CLI_CASE === 'missing-schema' ? 0 : 6 }]];
        if (sql.includes('GROUP_CONCAT')) return [[
          { tableName: 'account_email_health_notices', columns_list: 'user_id,email_hash,issue_code', non_unique: 0, prefixed: 0 },
          { tableName: 'account_email_health_runs', columns_list: 'period', non_unique: 0, prefixed: 0 },
          { tableName: 'email_delivery_logs', columns_list: 'recipient_email,create_time,id', non_unique: 1, prefixed: 0 }
        ]];
        return [[{ installed: 1 }]];
      },
      async end() { console.log('SQL_CONNECTION_CLOSED'); }
    };`,
  );
});
afterAll(async () => rm(fixture, { recursive: true, force: true }));

describe('邮箱健康迁移 CLI 生命周期', () => {
  const migrate = (scenario) =>
    run(
      process.execPath,
      [
        '--experimental-loader',
        join(fixture, 'loader.mjs'),
        fileURLToPath(new URL('./ensureAccountEmailHealthSchema.js', import.meta.url)),
      ],
      { env: { ...process.env, NODE_ENV: 'production', SCHEMA_CLI_CASE: scenario }, timeout: 5000 },
    );

  it('安装后关闭 SQL 连接并自然退出，不加载通知或 Redis', async () => {
    const result = await migrate('ready');
    expect(result.stdout).toContain('schema ready; no accounts scanned or changed');
    expect(result.stdout).toContain('SQL_CONNECTION_CLOSED');
  });
  it.each([
    ['missing-schema', 'SCHEMA_CONTRACT_MISMATCH'],
    ['database-error', 'ER_TEST_FAILURE'],
  ])('%s 仍关闭 SQL 连接并以失败状态退出', async (scenario, code) => {
    const error = await migrate(scenario).catch((failure) => failure);
    expect(error.code).toBe(1);
    expect(error.killed).toBe(false);
    expect(error.stdout).toContain('SQL_CONNECTION_CLOSED');
    expect(error.stderr).toContain(code);
    expect(error.stderr).not.toContain('private database detail');
  });
});
