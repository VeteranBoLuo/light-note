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
  fixture = await mkdtemp(join(tmpdir(), 'ln-manor-schema-cli-'));
  await writeFile(join(fixture, 'loader.mjs'), `export async function resolve(specifier, context, nextResolve) {
    if (['redis','nodemailer'].includes(specifier)) throw new Error('Migration must not load transports');
    const result=await nextResolve(specifier,context);
    if(result.url===${JSON.stringify(new URL('../db/index.js', import.meta.url).href)})
      return {url:new URL('./database.mjs',import.meta.url).href,shortCircuit:true};
    return result;
  }`);
  await writeFile(join(fixture, 'database.mjs'), `export default {
    async query(sql) {
      if(process.env.MANOR_CLI_CASE==='error') throw new Error('private database detail');
      if(sql.includes('information_schema.columns')) {
        if(process.env.MANOR_CLI_CASE==='missing') return [[]];
        return [[...['user_id','revision','state_json'].map(columnName=>({tableName:'knowledge_manors',columnName})),
          ...['user_id','request_id','command_hash','result_json','model_version','revision','points_delta'].map(columnName=>({tableName:'knowledge_manor_operations',columnName}))]];
      }
      if(sql.includes('GROUP_CONCAT')) return [[
        {tableName:'knowledge_manors',keyColumns:'user_id',prefixed:0},
        {tableName:'knowledge_manor_operations',keyColumns:'user_id,request_id',prefixed:0}]];
      if(sql.includes('information_schema.tables')) return [[
        {tableName:'knowledge_manors',engineName:'InnoDB'},
        {tableName:'knowledge_manor_operations',engineName:'InnoDB'}]];
      if(process.argv.includes('--check')) throw new Error('Read-only checks must not execute DDL');
      if(!sql.startsWith('CREATE TABLE IF NOT EXISTS')) throw new Error('Only additive table installation permitted');
      return [[]];
    }, async end(){console.log('SQL_CONNECTION_CLOSED');}
  };`);
});
afterAll(async () => rm(fixture, { recursive: true, force: true }));
describe('庄园显式迁移与只读检查 CLI', () => {
  const invoke = (scenario = 'ready', args = []) => run(process.execPath, [
    '--experimental-loader', join(fixture, 'loader.mjs'), fileURLToPath(new URL('./ensureKnowledgeManorSchema.js', import.meta.url)), ...args,
  ], { env: { ...process.env, NODE_ENV: 'production', MANOR_CLI_CASE: scenario }, timeout: 5000 });
  it.each([[[]], [['--check']]])('完成后关闭 SQL 并自然退出，不启动通知或 Redis %j', async args => {
    const result = await invoke('ready', args);
    expect(result.stdout).toContain('schema ready; no balances or accounts changed');
    expect(result.stdout).toContain('SQL_CONNECTION_CLOSED');
  });
  it.each(['missing', 'error'])('结构不完整或数据库故障明确失败且不泄露细节 %s', async scenario => {
    const error = await invoke(scenario).catch(e => e);
    expect(error.code).toBe(1); expect(error.killed).toBe(false);
    expect(error.stdout).toContain('SQL_CONNECTION_CLOSED');
    expect(error.stderr).toContain('KNOWLEDGE_MANOR_MIGRATION_FAILED');
    expect(error.stderr).not.toContain('private database detail');
  });
});
