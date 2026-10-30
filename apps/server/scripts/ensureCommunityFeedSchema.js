import { reviewSchemaReady } from '../util/communityFeed/reviewQueue.js';
import {
  COMMUNITY_IMAGE_SCHEMA,
  COMMUNITY_IMAGE_PREVIEW_SCHEMA,
  COMMUNITY_RESOURCE_SCHEMA,
} from '../util/communityFeed/schemaContract.js';
import pool from '../db/index.js';
import { ensureCommunityFeedSchema, communityFeedSchemaReady } from '../util/communityFeed/schema.js';
try {
  await ensureCommunityFeedSchema(pool);
  if (
    !(await communityFeedSchemaReady(pool)) ||
    !(await communityFeedSchemaReady(pool, COMMUNITY_IMAGE_SCHEMA)) ||
    !(await communityFeedSchemaReady(pool, COMMUNITY_IMAGE_PREVIEW_SCHEMA)) ||
    !(await communityFeedSchemaReady(pool, COMMUNITY_RESOURCE_SCHEMA)) ||
    !(await reviewSchemaReady(pool))
  )
    throw new Error('SCHEMA_CONTRACT_MISMATCH');
  console.log('[community-feed] schema ready; feature flags are unchanged');
} catch (error) {
  console.error('[community-feed] migration failed', error.code || 'SCHEMA_CONTRACT_MISMATCH');
  process.exitCode = 1;
} finally {
  await pool.end();
}
