import { cleanupResources } from './resources.js';
import { cleanupImages } from './images.js';
import pool from '../../db/index.js';
import { notificationSchedulerEnabled } from '../notificationSchedulerPolicy.js';
import { consumeCommunityEvent } from './notifications.js';
import { communityFeedSchemaReady } from './schema.js';
/** Production-only by the same policy as existing notification producers. Tests invoke the consumer with an isolated pool. */
export function startCommunityFeedScheduler({
  db = pool,
  env = process.env,
  onError = () => console.error('[community-feed] event delivery failed'),
} = {}) {
  if (
    !notificationSchedulerEnabled(env) ||
    env.COMMUNITY_FEED_ENABLED !== 'true' ||
    env.COMMUNITY_FEED_WORKER_ENABLED !== 'true'
  )
    return () => {};
  let stopped = false,
    running = false;
  let lastCleanup = 0;
  async function tick() {
    if (stopped || running) return;
    running = true;
    try {
      if (Date.now() - lastCleanup > 1800000) {
        lastCleanup = Date.now();
        // A storage outage must not stall independent community notifications.
        await cleanupImages({ db }).catch(onError);
        await cleanupResources({ db }).catch(onError);
      }
      if (await communityFeedSchemaReady(db))
        for (let i = 0; i < 10 && !stopped; i++) if (!(await consumeCommunityEvent({ db, env }))) break;
    } catch {
      onError();
    } finally {
      running = false;
    }
  }
  const timer = setInterval(tick, 5000);
  timer.unref?.();
  void tick();
  return () => {
    stopped = true;
    clearInterval(timer);
  };
}
