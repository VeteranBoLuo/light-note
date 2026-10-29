import { ManorError } from '@lightnote/shared/manor';

export async function readManorRuntime(db, lock = false) {
  const [[row]] = await db.query(`SELECT mode,message,revision,updated_by AS updatedBy,updated_at AS updatedAt,
    coverage_started_at AS coverageStartedAt FROM knowledge_manor_runtime WHERE id=1${lock ? ' LOCK IN SHARE MODE' : ''}`);
  if (!row || !['open', 'maintenance'].includes(row.mode)) throw new ManorError('MANOR_RUNTIME_UNAVAILABLE', 503);
  return { ...row, revision: Number(row.revision) };
}

export async function allowManorCommand(db, action) {
  const runtime = await readManorRuntime(db, true);
  if (runtime.mode === 'maintenance' && action !== 'resolveCast') throw new ManorError('MANOR_MAINTENANCE', 423);
  return runtime;
}
