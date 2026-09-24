import { isLocalDatabaseHost, resolveLightNoteRuntime } from '../databaseConnectionSafety.js';

// 本地数据库写入授权不授予共享队列的消费权，避免开发代码抢占线上任务。
export function toolboxWorkerEnabled(env = process.env) {
  const { runtime } = resolveLightNoteRuntime(env);
  return runtime === 'production' || runtime === 'test' || isLocalDatabaseHost(env.DB_HOST);
}
