import { isLocalDatabaseHost, resolveLightNoteRuntime } from '../databaseConnectionSafety.js';

// Remote database write permission does not grant ownership of its image jobs.
// In particular, note originals live on the production filesystem, not the Mac.
export function imagePreviewWorkerEnabled(env = process.env) {
  const { runtime } = resolveLightNoteRuntime(env);
  return runtime === 'production' || runtime === 'test' || isLocalDatabaseHost(env.DB_HOST);
}
