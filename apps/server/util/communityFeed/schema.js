import { COMMUNITY_FEED_SCHEMA } from './schemaContract.js';
import { readFile } from 'node:fs/promises';
import pool from '../../db/index.js';
export const COMMUNITY_FEED_TABLES = [
  'community_accepted_answers',
  'community_posts',
  'community_post_revisions',
  'community_topics',
  'community_task_rewards',
  'community_task_awards',
  'community_topic_details',
  'community_revision_topics',
  'community_post_topics',
  'community_comments',
  'community_comment_likes',
  'community_post_user_states',
  'community_follows',
  'community_user_mutes',
  'community_profile_options',
  'community_operation_receipts',
  'community_outbox',
  'community_event_recipients',
  'community_content_reports',
  'community_moderation_actions',
  'community_appeals',
  'community_post_images',
  'community_revision_images',
  'community_resource_snapshots',
  'community_revision_resources',
];
export async function ensureCommunityFeedSchema(db = pool) {
  const sql =
    (await readFile(new URL('../../migrations/20260914_community_feed.sql', import.meta.url), 'utf8')) +
    '\n' +
    (await readFile(new URL('../../migrations/20260915_community_images.sql', import.meta.url), 'utf8')) +
    '\n' +
    (await readFile(new URL('../../migrations/20260915_community_resources.sql', import.meta.url), 'utf8')) +
    '\n' +
    (await readFile(new URL('../../migrations/20260916_community_topics.sql', import.meta.url), 'utf8')) +
    '\n' +
    (await readFile(new URL('../../migrations/20260916_community_comment_likes.sql', import.meta.url), 'utf8')) +
    '\n' +
    (await readFile(new URL('../../migrations/20260916_community_task_rewards.sql', import.meta.url), 'utf8')) +
    '\n' +
    (await readFile(new URL('../../migrations/20260917_community_growth.sql', import.meta.url), 'utf8')) +
    '\n' +
    (await readFile(new URL('../../migrations/20260921_community_like_notifications.sql', import.meta.url), 'utf8'));
  const connection = db.getConnection ? await db.getConnection() : db;
  try {
    for (const statement of sql
      .split('\n')
      .filter((line) => !line.trim().startsWith('--'))
      .join('\n')
      .split(';')
      .map((s) => s.trim())
      .filter(Boolean))
      await connection.query(statement);
  } finally {
    if (connection !== db) connection.release();
  }
}
export async function communityFeedSchemaReady(db = pool, contract = COMMUNITY_FEED_SCHEMA) {
  const names = Object.keys(contract),
    marks = names.map(() => '?').join(',');
  const [columns] = await db.query(
    `SELECT table_name AS tableName,column_name AS columnName FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name IN (${marks})`,
    names,
  );
  const [indexes] = await db.query(
    `SELECT table_name AS tableName,index_name AS indexName,GROUP_CONCAT(column_name ORDER BY seq_in_index) AS fields,MAX(non_unique) AS nonUnique FROM information_schema.statistics WHERE table_schema=DATABASE() AND table_name IN (${marks}) GROUP BY table_name,index_name`,
    names,
  );
  return Object.entries(contract).every(
    ([table, spec]) =>
      spec.columns.every((col) => columns.some((c) => c.tableName === table && c.columnName === col)) &&
      spec.indexes.every(([name, fields, nonUnique]) =>
        indexes.some(
          (i) =>
            i.tableName === table && i.indexName === name && i.fields === fields && Number(i.nonUnique) === nonUnique,
        ),
      ),
  );
}
