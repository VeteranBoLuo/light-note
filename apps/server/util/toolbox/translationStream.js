import crypto from 'node:crypto';
import pool from '../../db/index.js';
import { createToolboxJob, getToolboxJob, getToolboxArtifact } from './service.js';
import { runClaimedToolboxJob } from './worker.js';
import { toolboxError } from './errors.js';

/** Direct execution shares the queue's lease, permission, delivery and billing fences.
 * Disconnecting only stops delivery; explicit cancellation invalidates the lease.
 * A replay observes the same job, never launches a second provider request.
 */
export async function streamTranslation(
  { userId, quoteId, clientRequestId, emit, disconnected = () => false },
  deps = {},
) {
  const database = deps.database || pool;
  const create = deps.createJob || createToolboxJob;
  const read = deps.getJob || getToolboxJob;
  const artifact = deps.getArtifact || getToolboxArtifact;
  const run = deps.runJob || runClaimedToolboxJob;
  const wait = deps.wait || (() => new Promise((resolve) => setTimeout(resolve, 1000)));
  const lease = `translation-stream:${crypto.randomUUID()}`;
  let job;
  try {
    job = await create({ userId, quoteId, clientRequestId, translationLease: lease, database });
  } catch (error) {
    if (
      [
        'TOOLBOX_QUOTE_EXPIRED',
        'TOOLBOX_QUOTE_NOT_FOUND',
        'TOOLBOX_TOOL_INVALID',
        'TOOLBOX_TOOL_UNAVAILABLE',
        'TOOLBOX_PRICING_CHANGED',
      ].includes(error.code)
    )
      error.definitive = true;
    throw error;
  }
  if (job.toolId !== 'translation') throw toolboxError('TOOLBOX_TOOL_INVALID', '该入口仅支持翻译');
  emit('start', { jobId: job.id });
  const [[claimed]] = await database.query(
    "SELECT * FROM toolbox_jobs WHERE id=? AND user_id=? AND locked_by=? AND status='processing'",
    [job.id, userId, lease],
  );
  const controller = new AbortController();
  let executionError;
  let lastUpdate = 0;
  let sourceSent = false;
  let execution;
  if (claimed) {
    execution = run(claimed, database, {
      signal: controller.signal,
      onProgress: (update) => {
        // Bounded snapshots tolerate repair resets and slow readers.
        if (!disconnected() && Date.now() - lastUpdate >= 100) {
          lastUpdate = Date.now();
          emit('snapshot', { content: update.content, ...(!sourceSent ? { original: update.original } : {}) });
          sourceSent = true;
        }
      },
    }).catch((error) => {
      executionError = error;
    });
  }
  try {
    for (;;) {
      const state = await read({ userId, jobId: job.id, database });
      if (state.status === 'succeeded' && state.artifact?.id) {
        if (execution) await execution;
        if (executionError) throw executionError;
        emit('complete', await artifact({ userId, artifactId: state.artifact.id, database }));
        return;
      }
      if (['failed', 'cancelled', 'expired'].includes(state.status)) {
        controller.abort();
        throw Object.assign(
          toolboxError(state.error?.code || 'TOOLBOX_TRANSLATION_CANCELLED', state.error?.message || '翻译已停止', 409),
          { definitive: true },
        );
      }
      if (executionError) throw executionError;
      // A duplicate connection owns no work and can leave immediately on disconnect.
      if (!claimed && disconnected()) return;
      emit('heartbeat', {});
      await wait();
    }
  } finally {
    // Do not let a monitoring failure abort a provider call whose outcome is unknown.
    // The execution's existing heartbeat/commit fence remains authoritative.
    if (execution && controller.signal.aborted) await execution;
  }
}
