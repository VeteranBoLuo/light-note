import { resourcesReady } from '../util/communityFeed/resources.js';
import { imagesReady } from '../util/communityFeed/images.js';
import pool from '../db/index.js';
import { ensureCommunityFeedSchema, communityFeedSchemaReady } from '../util/communityFeed/schema.js';
try {
  await ensureCommunityFeedSchema(pool);
  if (!(await communityFeedSchemaReady(pool)) || !(await imagesReady(pool)) || !(await resourcesReady(pool)))
    throw new Error('SCHEMA_CONTRACT_MISMATCH');
  console.log('[community-feed] schema ready; feature flags are unchanged');
} catch (error) {
  console.error('[community-feed] migration failed', error.code || 'SCHEMA_CONTRACT_MISMATCH');
  process.exitCode = 1;
} finally {
  await pool.end();
}
