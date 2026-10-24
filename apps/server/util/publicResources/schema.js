import { readFile } from 'node:fs/promises';
import pool from '../../db/index.js';
import { communityFeedSchemaReady } from '../communityFeed/schema.js';

// Deliberately no startup ensure: enabling this domain requires an explicit migration.
export const PUBLIC_RESOURCE_SCHEMA = Object.freeze({
  public_resource_saved_sources: {
    columns: ['recipient_id', 'kind', 'resource_id', 'author_public_id', 'author_name', 'source_url', 'revision'],
    indexes: [['PRIMARY', 'recipient_id,kind,resource_id', 0]],
  },
  public_resource_publications: {
    columns: [
      'id',
      'public_id',
      'owner_id',
      'kind',
      'source_id',
      'published_revision_id',
      'pending_revision_id',
      'latest_revision_id',
      'version',
      'withdrawn',
      'removed',
      'reason',
      'published_at',
      'created_at',
      'updated_at',
    ],
    indexes: [
      ['uk_public_id', 'public_id', 0],
      ['uk_source', 'owner_id,kind,source_id', 0],
      ['idx_owner', 'owner_id,updated_at,id', 1],
      ['idx_public', 'published_at,id', 1],
    ],
  },
  public_resource_revisions: {
    columns: [
      'id',
      'publication_id',
      'revision',
      'title',
      'body',
      'url',
      'description',
      'fingerprint',
      'status',
      'reason',
      'created_at',
      'reviewed_at',
    ],
    indexes: [['uk_revision', 'publication_id,revision', 0]],
  },
  public_resource_review_jobs: {
    columns: [
      'id',
      'publication_id',
      'revision_id',
      'status',
      'policy_version',
      'request_id',
      'lease_token',
      'lease_until',
      'budget_day',
      'reserved_tokens',
      'result_json',
      'reason_code',
      'created_at',
      'finished_at',
    ],
    indexes: [
      ['uk_revision', 'revision_id', 0],
      ['idx_pending', 'status,id', 1],
    ],
  },
  public_resource_review_budget: {
    columns: ['budget_day', 'consumed_tokens'],
    indexes: [['PRIMARY', 'budget_day', 0]],
  },
  public_resource_actions: {
    columns: [
      'id',
      'public_id',
      'publication_id',
      'revision_id',
      'actor_id',
      'action',
      'reason',
      'version',
      'created_at',
    ],
    indexes: [['uk_public_id', 'public_id', 0]],
  },
  public_resource_reports: {
    columns: [
      'id',
      'public_id',
      'reporter_id',
      'publication_id',
      'revision_id',
      'reason',
      'status',
      'version',
      'handled_by',
      'handled_reason',
      'created_at',
    ],
    indexes: [
      ['uk_public_id', 'public_id', 0],
      ['uk_report', 'reporter_id,revision_id', 0],
    ],
  },
  public_resource_receipts: {
    columns: ['actor_id', 'request_id', 'request_hash', 'result', 'created_at'],
    indexes: [['PRIMARY', 'actor_id,request_id', 0]],
  },
  public_resource_events: {
    columns: [
      'id',
      'event_key',
      'publication_id',
      'revision_id',
      'action_id',
      'kind',
      'status',
      'recipient_cursor',
      'lease_token',
      'lease_until',
      'next_attempt_at',
      'attempts',
      'created_at',
    ],
    indexes: [
      ['uk_event', 'event_key', 0],
      ['idx_pending', 'status,id', 1],
    ],
  },
});
export async function publicResourceSchemaReady(db = pool) {
  return communityFeedSchemaReady(db, PUBLIC_RESOURCE_SCHEMA);
}
export async function migratePublicResourceSchema(db = pool) {
  const source = await readFile(new URL('../../migrations/20261021_public_resources.sql', import.meta.url), 'utf8');
  for (const sql of source
    .split('\n')
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n')
    .split(';')
    .map((s) => s.trim())
    .filter(Boolean))
    await db.query(sql);
}
