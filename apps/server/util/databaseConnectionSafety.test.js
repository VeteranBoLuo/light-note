import { describe, expect, it } from 'vitest';
import {
  assertDatabaseConnectionSafety,
  isLocalDatabaseHost,
  resolveLightNoteRuntime,
} from './databaseConnectionSafety.js';

describe('数据库运行环境隔离', () => {
  it('识别回环地址和 Unix Socket，不把内网或公网主机误判为本地', () => {
    expect(['localhost', '127.0.0.1', '127.1.2.3', '::1', '/tmp/mysql.sock'].every(isLocalDatabaseHost)).toBe(true);
    expect(isLocalDatabaseHost('10.0.0.12')).toBe(false);
    expect(isLocalDatabaseHost('db.example.internal')).toBe(false);
  });

  it('本机默认拒绝远程数据库，且错误不回显数据库地址', () => {
    const env = { LIGHTNOTE_RUNTIME_ENV: 'local', DB_HOST: 'db.example.internal' };
    expect(() => assertDatabaseConnectionSafety(env)).toThrow(/本地运行时拒绝连接远程数据库/u);
    try {
      assertDatabaseConnectionSafety(env);
    } catch (error) {
      expect(error).toMatchObject({ code: 'REMOTE_DATABASE_WRITE_BLOCKED' });
      expect(error.message).not.toContain('db.example.internal');
    }
  });

  it('远程写入必须显式确认，生产运行时则可使用远程数据库', () => {
    expect(
      assertDatabaseConnectionSafety({
        LIGHTNOTE_RUNTIME_ENV: 'local',
        DB_HOST: 'db.example.internal',
        ALLOW_REMOTE_DATABASE_WRITES: 'true',
      }),
    ).toMatchObject({ runtime: 'local', databaseScope: 'remote', remoteWriteOverride: true });
    expect(
      assertDatabaseConnectionSafety({ LIGHTNOTE_RUNTIME_ENV: 'production', DB_HOST: 'db.example.internal' }),
    ).toMatchObject({ runtime: 'production', databaseScope: 'remote', remoteWriteOverride: false });
  });

  it('未知显式环境失败关闭，Linux 也不能被操作系统猜成生产环境', () => {
    expect(() => resolveLightNoteRuntime({ LIGHTNOTE_RUNTIME_ENV: 'staging' })).toThrow(/LIGHTNOTE_RUNTIME_ENV/u);
    expect(resolveLightNoteRuntime({})).toEqual({
      runtime: 'local',
      source: 'safe_default',
    });
  });
});
