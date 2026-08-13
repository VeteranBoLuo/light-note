#!/usr/bin/env node

import { pathToFileURL } from 'node:url';
import pool from '../db/index.js';
import redisClient from '../util/redisClient.js';
import { ensureCommunityChatIdentity } from '../util/services/communityChatIdentityService.js';

const apply = process.argv.slice(2).includes('--apply');
const BATCH_SIZE = 100;

async function loadCandidates(db, limit = BATCH_SIZE) {
  const [rows] = await db.query(
    `SELECT account.id AS userId
       FROM user account
      WHERE account.del_flag = 0
        AND account.role <> 'visitor'
        AND NOT EXISTS (
          SELECT 1
            FROM community_chat_user_identities identity
           WHERE identity.user_id = account.id
        )
        AND (
          account.role = 'root'
          OR EXISTS (
            SELECT 1
              FROM community_chat_members membership
             WHERE membership.user_id = account.id
               AND membership.status = 'active'
          )
          OR EXISTS (
            SELECT 1
              FROM community_chat_messages message
             WHERE message.user_id = account.id
               AND message.status IN ('active', 'recalled')
          )
        )
      ORDER BY account.id ASC
      LIMIT ?`,
    [limit],
  );
  return rows;
}

export async function main() {
  if (!apply) {
    const [rows] = await pool.query(
      `SELECT COUNT(*) AS candidateCount
         FROM user account
        WHERE account.del_flag = 0
          AND account.role <> 'visitor'
          AND NOT EXISTS (
            SELECT 1 FROM community_chat_user_identities identity WHERE identity.user_id = account.id
          )
          AND (
            account.role = 'root'
            OR EXISTS (
              SELECT 1 FROM community_chat_members membership
               WHERE membership.user_id = account.id AND membership.status = 'active'
            )
            OR EXISTS (
              SELECT 1 FROM community_chat_messages message
               WHERE message.user_id = account.id AND message.status IN ('active', 'recalled')
            )
          )`,
    );
    console.log('[community-chat-identity-backfill] dryRun=true candidates=%d', Number(rows[0]?.candidateCount || 0));
    return;
  }

  let created = 0;
  while (true) {
    const candidates = await loadCandidates(pool);
    if (!candidates.length) break;
    for (const candidate of candidates) {
      await ensureCommunityChatIdentity({ userId: candidate.userId, db: pool });
      created += 1;
    }
    console.log('[community-chat-identity-backfill] dryRun=false created=%d', created);
    if (candidates.length < BATCH_SIZE) break;
  }
  console.log('[community-chat-identity-backfill] complete created=%d', created);
}

export async function closeBackfillResources({ db = pool, redis = redisClient } = {}) {
  await db.end();
  if (!redis?.isOpen) {
    redis?.destroy?.();
    return;
  }
  try {
    await redis.quit();
  } catch {
    redis.destroy?.();
  }
}

async function run() {
  try {
    await main();
  } catch (error) {
    console.error(
      '[community-chat-identity-backfill] failed code=%s',
      String(error?.code || 'COMMUNITY_CHAT_IDENTITY_BACKFILL_FAILED'),
    );
    process.exitCode = 1;
  } finally {
    await closeBackfillResources();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await run();
}
