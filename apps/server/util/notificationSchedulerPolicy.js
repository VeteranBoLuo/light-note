import { resolveLightNoteRuntime } from './databaseConnectionSafety.js';

// Notification producers share persistent jobs with production. Local database
// write access does not authorize consuming these jobs or their dedup markers.
export function notificationSchedulerEnabled(env = process.env) {
  return resolveLightNoteRuntime(env).runtime === 'production';
}
