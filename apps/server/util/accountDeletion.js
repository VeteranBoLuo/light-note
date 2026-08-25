import crypto from 'node:crypto';
import pool from '../db/index.js';
import redisClient from './redisClient.js';
import { sendTrackedEmail } from './emailDelivery.js';
import { stableAgentErrorCode } from './agent/logSafety.js';
import { invalidateAfdianLeaderboardCache } from './afdianSupportReadService.js';

export const ACCOUNT_DELETION_CONFIRMATION_TEXT = '注销账号';

const CODE_TTL_SECONDS = 5 * 60;
const CODE_KEY_PREFIX = 'account:deletion:code:';
const CLEANUP_INTERVAL_MS = 10 * 60 * 1000;
const STALE_PROCESSING_MINUTES = 15;
const CLEANUP_BATCH_SIZE = 5;
const COMPLETED_RECORD_RETENTION_DAYS = 180;
const COMPLETED_RECORD_CLEANUP_BATCH_SIZE = 500;

const DIRECT_DELETE_TABLES = Object.freeze([
  ['notification', 'user_id'],
  ['opinion', 'user_id'],
  ['resource_inbox', 'user_id'],
  ['resource_tag_relations', 'user_id'],
  ['onboarding_seed_resources', 'user_id'],
  ['growth_events', 'user_id'],
  ['user_growth_tasks', 'user_id'],
  ['user_achievements', 'user_id'],
  ['user_growth_preferences', 'user_id'],
  ['growth_recap_state', 'user_id'],
  ['ai_bonus_lot_allocations', 'user_id'],
  ['ai_bonus_lots', 'user_id'],
  ['ai_bonus_ledger', 'user_id'],
  ['user_growth', 'user_id'],
  ['points_log', 'user_id'],
  ['user_cosmetics', 'user_id'],
  ['ai_daily_bonus', 'user_id'],
  ['user_item', 'user_id'],
  ['bookmark_snapshot', 'user_id'],
  ['bookmark_health', 'user_id'],
  ['bookmark_icon_jobs', 'user_id'],
  ['api_logs', 'user_id'],
  ['operation_logs', 'create_by'],
  ['agent_logs', 'user_id'],
  ['email_delivery_logs', 'user_id'],
  ['security_account_bans', 'user_id'],
  ['security_account_reputation', 'user_id'],
  ['user_sessions', 'user_id'],
  ['community_chat_member_profiles', 'user_id'],
  ['community_chat_user_identities', 'user_id'],
  ['community_chat_custom_stickers', 'user_id'],
]);

function accountDeletionError(code, message, status = 400) {
  const error = new Error(message);
  error.code = code;
  error.status = status;
  return error;
}

function deletionCodeKey(userId) {
  return `${CODE_KEY_PREFIX}${userId}`;
}

function sha256(value) {
  return crypto
    .createHash('sha256')
    .update(String(value || ''))
    .digest('hex');
}

function deletionCodeDigest(code, salt) {
  return crypto.scryptSync(String(code || ''), Buffer.from(salt, 'hex'), 32).toString('hex');
}

function timingSafeHexEqual(left, right) {
  try {
    const a = Buffer.from(String(left || ''), 'hex');
    const b = Buffer.from(String(right || ''), 'hex');
    return a.length > 0 && a.length === b.length && crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

function maskEmail(email) {
  const [local = '', domain = ''] = String(email || '').split('@');
  if (!local || !domain) return '';
  const visible = local.length <= 2 ? local.slice(0, 1) : local.slice(0, 2);
  return `${visible}${'*'.repeat(Math.max(2, Math.min(6, local.length - visible.length)))}@${domain}`;
}

function assertDeletableAccount(account) {
  if (!account) {
    throw accountDeletionError('ACCOUNT_NOT_FOUND', '账号不存在或登录状态已失效', 404);
  }
  if (account.role === 'root' || account.role === 'visitor') {
    throw accountDeletionError('ACCOUNT_DELETION_FORBIDDEN', '当前账号类型不支持自助注销', 403);
  }
  if (Number(account.del_flag || 0) === 1 || account.role === 'deleted') {
    throw accountDeletionError('ACCOUNT_ALREADY_DELETED', '账号已注销或正在处理中', 409);
  }
}

async function getDeletableAccount(userId, database = pool) {
  const [rows] = await database.query(
    `SELECT id, email, role, del_flag
       FROM user
      WHERE id = ?
      LIMIT 1`,
    [userId],
  );
  const account = rows[0] || null;
  assertDeletableAccount(account);
  return account;
}

/**
 * 发送账号注销专用验证码。收件地址只从当前登录账号读取，客户端不能指定，
 * 避免复用通用重置密码接口时产生任意邮箱发送与身份绑定混淆。
 */
export async function sendAccountDeletionCode({ userId }) {
  const account = await getDeletableAccount(userId);
  const email = String(account.email || '')
    .trim()
    .toLowerCase();
  if (!email || !email.includes('@')) {
    throw accountDeletionError('ACCOUNT_EMAIL_UNAVAILABLE', '当前账号没有可用邮箱，请先通过联系邮箱申请人工注销', 409);
  }

  const code = String(crypto.randomInt(100000, 1000000));
  const salt = crypto.randomBytes(16).toString('hex');
  const challenge = {
    digest: deletionCodeDigest(code, salt),
    salt,
    emailHash: sha256(email),
    issuedAt: Date.now(),
  };

  await redisClient.setEx(deletionCodeKey(userId), CODE_TTL_SECONDS, JSON.stringify(challenge));
  try {
    await sendTrackedEmail({
      emailType: 'account_deletion',
      userId,
      recipient: email,
      subject: '【轻笺】账号注销验证码',
      businessType: 'account_deletion',
      html: `
        <p>您好！</p>
        <p>您正在申请注销轻笺账号，验证码是：<strong style="color:#dc2626;">${code}</strong></p>
        <p>验证码 5 分钟内有效。注销完成后账号和云端内容将无法恢复。</p>
        <p>如果不是您本人操作，请忽略本邮件并及时检查账号安全。</p>
      `,
    });
  } catch (error) {
    await redisClient.del(deletionCodeKey(userId)).catch(() => {});
    throw error;
  }

  return {
    maskedEmail: maskEmail(email),
    expiresIn: CODE_TTL_SECONDS,
  };
}

async function verifyDeletionCode(userId, code) {
  const normalizedCode = String(code || '').trim();
  if (!/^\d{6}$/.test(normalizedCode)) {
    throw accountDeletionError('ACCOUNT_DELETION_CODE_INVALID', '请输入 6 位验证码');
  }

  const raw = await redisClient.get(deletionCodeKey(userId));
  if (!raw) {
    throw accountDeletionError('ACCOUNT_DELETION_CODE_EXPIRED', '验证码已过期，请重新获取');
  }

  let challenge;
  try {
    challenge = JSON.parse(raw);
  } catch {
    throw accountDeletionError('ACCOUNT_DELETION_CODE_EXPIRED', '验证码已失效，请重新获取');
  }

  const digest = deletionCodeDigest(normalizedCode, String(challenge.salt || ''));
  if (!timingSafeHexEqual(digest, challenge.digest)) {
    throw accountDeletionError('ACCOUNT_DELETION_CODE_MISMATCH', '验证码错误');
  }
  return challenge;
}

async function existingTables(connection) {
  const [rows] = await connection.query(
    `SELECT TABLE_NAME AS tableName
       FROM information_schema.TABLES
      WHERE TABLE_SCHEMA = DATABASE()`,
  );
  return new Set(rows.map((row) => String(row.tableName || row.TABLE_NAME || '')));
}

async function collectCleanupArtifacts(connection, tables, userId) {
  const objectKeys = [];
  const noteImageUrls = [];
  const bookmarkIcons = [];

  if (tables.has('files')) {
    const [rows] = await connection.query(
      `SELECT obs_key, create_by, file_name
         FROM files
        WHERE create_by = ?`,
      [userId],
    );
    const missingObjectKey = rows.some((row) => !String(row.obs_key || '').trim());
    const buildObjectKey = missingObjectKey ? (await import('./obsClient.js')).buildObjectKey : null;
    for (const row of rows) {
      const key =
        String(row.obs_key || '').trim() || (buildObjectKey ? buildObjectKey(row.create_by, row.file_name) : '');
      if (key) objectKeys.push(key);
    }
  }

  if (tables.has('ai_document_sources')) {
    const [rows] = await connection.query(
      `SELECT object_key
         FROM ai_document_sources
        WHERE user_id = ?`,
      [userId],
    );
    for (const row of rows) {
      const key = String(row.object_key || '').trim();
      if (key) objectKeys.push(key);
    }
  }

  if (tables.has('community_chat_custom_stickers')) {
    const [rows] = await connection.query(
      `SELECT object_key
         FROM community_chat_custom_stickers
        WHERE user_id = ?`,
      [userId],
    );
    for (const row of rows) {
      const key = String(row.object_key || '').trim();
      if (key) objectKeys.push(key);
    }
  }

  if (tables.has('note_images') && tables.has('note')) {
    const [rows] = await connection.query(
      `SELECT ni.url
         FROM note_images ni
         JOIN note n ON n.id = ni.note_id
        WHERE n.create_by = ?`,
      [userId],
    );
    noteImageUrls.push(...rows.map((row) => row.url).filter(Boolean));
  }

  if (tables.has('note_template')) {
    const { extractNoteImageUrls } = await import('./noteImages.js');
    const [rows] = await connection.query('SELECT content FROM note_template WHERE create_by = ?', [userId]);
    for (const row of rows) {
      noteImageUrls.push(...extractNoteImageUrls(row.content));
    }
  }

  if (tables.has('bookmark')) {
    const [rows] = await connection.query(
      `SELECT id, icon_url AS iconUrl
         FROM bookmark
        WHERE user_id = ?`,
      [userId],
    );
    bookmarkIcons.push(...rows);
  }

  return {
    objectKeys: [...new Set(objectKeys)],
    noteImageUrls: [...new Set(noteImageUrls)],
    bookmarkIcons,
  };
}

/**
 * 验证通过后立即：
 * - 将账号身份字段去标识化；
 * - 标记为不可登录；
 * - 创建可重试的物理清理任务。
 *
 * 具体内容删除由后台任务完成，避免对象存储短暂故障把账号重新变成可用状态。
 */
export async function requestAccountDeletion({ userId, code, confirmation }) {
  if (String(confirmation || '').trim() !== ACCOUNT_DELETION_CONFIRMATION_TEXT) {
    throw accountDeletionError(
      'ACCOUNT_DELETION_CONFIRMATION_MISMATCH',
      `请输入“${ACCOUNT_DELETION_CONFIRMATION_TEXT}”确认`,
    );
  }
  const challenge = await verifyDeletionCode(userId, code);
  const connection = await pool.getConnection();
  let requestId = '';
  try {
    await connection.beginTransaction();
    const [rows] = await connection.query(
      `SELECT id, email, role, del_flag
         FROM user
        WHERE id = ?
        LIMIT 1
        FOR UPDATE`,
      [userId],
    );
    const account = rows[0] || null;
    assertDeletableAccount(account);
    const normalizedEmail = String(account.email || '')
      .trim()
      .toLowerCase();
    if (!normalizedEmail || sha256(normalizedEmail) !== challenge.emailHash) {
      throw accountDeletionError('ACCOUNT_DELETION_EMAIL_CHANGED', '账号邮箱状态已变化，请重新获取验证码', 409);
    }

    const tables = await existingTables(connection);
    if (!tables.has('account_deletion_requests')) {
      throw accountDeletionError(
        'ACCOUNT_DELETION_SCHEMA_UNAVAILABLE',
        '账号注销功能正在完成数据迁移，请稍后再试',
        503,
      );
    }
    const artifacts = await collectCleanupArtifacts(connection, tables, userId);
    requestId = crypto.randomUUID();

    await connection.query(
      `INSERT INTO account_deletion_requests
        (id, user_id, status, object_keys_json, note_image_urls_json, bookmark_icons_json)
       VALUES (?, ?, 'pending', ?, ?, ?)`,
      [
        requestId,
        userId,
        JSON.stringify(artifacts.objectKeys),
        JSON.stringify(artifacts.noteImageUrls),
        JSON.stringify(artifacts.bookmarkIcons),
      ],
    );

    // 邮件投递日志含收件邮箱，须在清空账号邮箱前同事务删除。
    if (tables.has('email_delivery_logs')) {
      await connection.query('DELETE FROM email_delivery_logs WHERE user_id = ? OR recipient_email = ?', [
        userId,
        normalizedEmail,
      ]);
    }

    const [updateResult] = await connection.query(
      `UPDATE user
          SET alias = '已注销用户',
              password = NULL,
              email = NULL,
              phone_number = NULL,
              role = 'deleted',
              head_picture = NULL,
              del_flag = 1,
              location = NULL,
              ip = NULL,
              github_id = NULL,
              github_access_token = NULL,
              login_type = 'local',
              preferences = NULL
        WHERE id = ?`,
      [userId],
    );
    if (Number(updateResult?.affectedRows || 0) !== 1) {
      throw accountDeletionError('ACCOUNT_DELETION_UPDATE_FAILED', '账号注销状态更新失败，请稍后重试', 409);
    }

    await connection.commit();
    invalidateAfdianLeaderboardCache();
  } catch (error) {
    await connection.rollback();
    if (error?.code === 'ER_DUP_ENTRY') {
      throw accountDeletionError('ACCOUNT_DELETION_IN_PROGRESS', '账号注销已提交，请勿重复操作', 409);
    }
    throw error;
  } finally {
    connection.release();
  }

  await redisClient.del(deletionCodeKey(userId)).catch(() => {});
  return { requestId, status: 'pending' };
}

async function deleteIfPresent(connection, tables, table, sql, params) {
  if (!tables.has(table)) return 0;
  const [result] = await connection.query(sql, params);
  return Number(result?.affectedRows || 0);
}

async function purgeAiWorkspace(connection, tables, userId) {
  if (tables.has('ai_skill_turns') && tables.has('ai_skill_threads')) {
    await connection.query(
      `DELETE t
         FROM ai_skill_turns t
         JOIN ai_skill_threads s ON s.id = t.thread_id
        WHERE s.actor_user_id = ? OR s.subject_user_id = ?`,
      [userId, userId],
    );
  }
  await deleteIfPresent(
    connection,
    tables,
    'ai_skill_threads',
    'DELETE FROM ai_skill_threads WHERE actor_user_id = ? OR subject_user_id = ?',
    [userId, userId],
  );
  if (tables.has('ai_message_evidence') && tables.has('ai_messages') && tables.has('ai_conversations')) {
    await connection.query(
      `DELETE e
         FROM ai_message_evidence e
         JOIN ai_messages m ON m.id = e.message_id
         JOIN ai_conversations c ON c.id = m.conversation_id
        WHERE c.actor_user_id = ? OR c.subject_user_id = ?`,
      [userId, userId],
    );
  }
  if (tables.has('ai_message_sources') && tables.has('ai_messages') && tables.has('ai_conversations')) {
    await connection.query(
      `DELETE s
         FROM ai_message_sources s
         JOIN ai_messages m ON m.id = s.message_id
         JOIN ai_conversations c ON c.id = m.conversation_id
        WHERE c.actor_user_id = ? OR c.subject_user_id = ?`,
      [userId, userId],
    );
  }
  await deleteIfPresent(
    connection,
    tables,
    'ai_feedback',
    'DELETE FROM ai_feedback WHERE actor_user_id = ? OR subject_user_id = ?',
    [userId, userId],
  );
  if (tables.has('ai_messages') && tables.has('ai_conversations')) {
    await connection.query(
      `DELETE m
         FROM ai_messages m
         JOIN ai_conversations c ON c.id = m.conversation_id
        WHERE c.actor_user_id = ? OR c.subject_user_id = ?`,
      [userId, userId],
    );
  }
  if (tables.has('ai_change_items') && tables.has('ai_change_sets')) {
    await connection.query(
      `DELETE i
         FROM ai_change_items i
         JOIN ai_change_sets s ON s.id = i.change_set_id
        WHERE s.actor_user_id = ? OR s.subject_user_id = ?`,
      [userId, userId],
    );
  }
  for (const table of [
    'ai_change_sets',
    'ai_memories',
    'ai_response_events',
    'ai_product_events',
    'ai_conversations',
  ]) {
    await deleteIfPresent(
      connection,
      tables,
      table,
      `DELETE FROM ${table} WHERE actor_user_id = ? OR subject_user_id = ?`,
      [userId, userId],
    );
  }
  await deleteIfPresent(
    connection,
    tables,
    'ai_content_chunks',
    'DELETE FROM ai_content_chunks WHERE subject_user_id = ?',
    [userId],
  );
  await deleteIfPresent(
    connection,
    tables,
    'ai_content_generations',
    'DELETE FROM ai_content_generations WHERE subject_user_id = ?',
    [userId],
  );

  if (tables.has('ai_document_chunks') && tables.has('ai_document_sources')) {
    await connection.query(
      `DELETE c
         FROM ai_document_chunks c
         JOIN ai_document_sources s ON s.id = c.source_id
        WHERE s.user_id = ?`,
      [userId],
    );
  }
  if (tables.has('ai_document_jobs') && tables.has('ai_document_sources')) {
    await connection.query(
      `DELETE j
         FROM ai_document_jobs j
         JOIN ai_document_sources s ON s.id = j.source_id
        WHERE s.user_id = ?`,
      [userId],
    );
  }
  await deleteIfPresent(
    connection,
    tables,
    'ai_document_sources',
    'DELETE FROM ai_document_sources WHERE user_id = ?',
    [userId],
  );
}

async function purgeFeatureRequests(connection, tables, userId) {
  if (tables.has('feature_request_votes')) {
    if (tables.has('feature_requests')) {
      await connection.query(
        `DELETE FROM feature_request_votes
          WHERE user_id = ?
             OR request_id IN (SELECT id FROM feature_requests WHERE submitter_user_id = ?)`,
        [userId, userId],
      );
    } else {
      await connection.query('DELETE FROM feature_request_votes WHERE user_id = ?', [userId]);
    }
  }
  if (tables.has('feature_request_updates')) {
    if (tables.has('feature_requests')) {
      await connection.query(
        `DELETE FROM feature_request_updates
          WHERE actor_user_id = ?
             OR request_id IN (SELECT id FROM feature_requests WHERE submitter_user_id = ?)`,
        [userId, userId],
      );
    } else {
      await connection.query('DELETE FROM feature_request_updates WHERE actor_user_id = ?', [userId]);
    }
  }
  await deleteIfPresent(
    connection,
    tables,
    'feature_requests',
    'DELETE FROM feature_requests WHERE submitter_user_id = ?',
    [userId],
  );
}

export async function purgeOwnedResources(connection, tables, userId) {
  if (tables.has('note_resource_refs')) {
    const targetClauses = [];
    const params = [userId];
    if (tables.has('bookmark')) {
      targetClauses.push(
        "(target_type = 'bookmark' AND CONVERT(target_id USING utf8mb4) COLLATE utf8mb4_unicode_ci IN (SELECT CONVERT(id USING utf8mb4) COLLATE utf8mb4_unicode_ci FROM bookmark WHERE user_id = ?))",
      );
      params.push(userId);
    }
    if (tables.has('note')) {
      targetClauses.push(
        "(target_type = 'note' AND CONVERT(target_id USING utf8mb4) COLLATE utf8mb4_unicode_ci IN (SELECT CONVERT(id USING utf8mb4) COLLATE utf8mb4_unicode_ci FROM note WHERE create_by = ?))",
      );
      params.push(userId);
    }
    if (tables.has('files')) {
      targetClauses.push(
        "(target_type = 'file' AND CONVERT(target_id USING utf8mb4) COLLATE utf8mb4_unicode_ci IN (SELECT CONVERT(id USING utf8mb4) COLLATE utf8mb4_unicode_ci FROM files WHERE create_by = ?))",
      );
      params.push(userId);
    }
    const targetSql = targetClauses.length ? ` OR ${targetClauses.join(' OR ')}` : '';
    await connection.query(`DELETE FROM note_resource_refs WHERE source_user_id = ?${targetSql}`, params);
  }

  if (tables.has('note_tag_relations') && tables.has('note')) {
    await connection.query(
      `DELETE r
         FROM note_tag_relations r
         JOIN note n ON n.id = r.note_id
        WHERE n.create_by = ?`,
      [userId],
    );
  }
  if (tables.has('note_images') && tables.has('note')) {
    await connection.query(
      `DELETE i
         FROM note_images i
         JOIN note n ON n.id = i.note_id
        WHERE n.create_by = ?`,
      [userId],
    );
  }
  if (tables.has('note_versions')) {
    if (tables.has('note')) {
      await connection.query(
        `DELETE FROM note_versions
          WHERE create_by = ?
             OR CONVERT(note_id USING utf8mb4) COLLATE utf8mb4_unicode_ci IN
                (SELECT CONVERT(id USING utf8mb4) COLLATE utf8mb4_unicode_ci FROM note WHERE create_by = ?)`,
        [userId, userId],
      );
    } else {
      await connection.query('DELETE FROM note_versions WHERE create_by = ?', [userId]);
    }
  }
  await deleteIfPresent(connection, tables, 'note_template', 'DELETE FROM note_template WHERE create_by = ?', [userId]);

  if (tables.has('tag_bookmark_relations')) {
    const clauses = [];
    const params = [];
    if (tables.has('bookmark')) {
      clauses.push('bookmark_id IN (SELECT id FROM bookmark WHERE user_id = ?)');
      params.push(userId);
    }
    if (tables.has('tag')) {
      clauses.push('tag_id IN (SELECT id FROM tag WHERE user_id = ?)');
      params.push(userId);
    }
    if (clauses.length) {
      await connection.query(`DELETE FROM tag_bookmark_relations WHERE ${clauses.join(' OR ')}`, params);
    }
  }
  if (tables.has('tag_relations') && tables.has('tag')) {
    await connection.query(
      `DELETE FROM tag_relations
        WHERE tag_id IN (SELECT id FROM tag WHERE user_id = ?)
           OR related_tag_id IN (SELECT id FROM tag WHERE user_id = ?)`,
      [userId, userId],
    );
  }

  for (const [table, field] of DIRECT_DELETE_TABLES) {
    await deleteIfPresent(connection, tables, table, `DELETE FROM ${table} WHERE ${field} = ?`, [userId]);
  }

  // Provider Span 不直接保存用户标识，必须先通过根执行删除，避免账号注销后遗留孤儿账本。
  if (tables.has('ai_provider_spans') && tables.has('ai_executions')) {
    await connection.query(
      `DELETE s FROM ai_provider_spans s
        INNER JOIN ai_executions e ON e.id = s.execution_id
       WHERE e.subject_user_id = ? OR e.actor_user_id = ?`,
      [userId, userId],
    );
  }
  await deleteIfPresent(
    connection,
    tables,
    'ai_executions',
    'DELETE FROM ai_executions WHERE subject_user_id = ? OR actor_user_id = ?',
    [userId, userId],
  );

  await deleteIfPresent(connection, tables, 'note', 'DELETE FROM note WHERE create_by = ?', [userId]);
  await deleteIfPresent(connection, tables, 'note_tags', 'DELETE FROM note_tags WHERE user_id = ?', [userId]);
  await deleteIfPresent(connection, tables, 'bookmark', 'DELETE FROM bookmark WHERE user_id = ?', [userId]);
  await deleteIfPresent(connection, tables, 'files', 'DELETE FROM files WHERE create_by = ?', [userId]);
  await deleteIfPresent(connection, tables, 'folders', 'DELETE FROM folders WHERE create_by = ?', [userId]);
  await deleteIfPresent(connection, tables, 'tag', 'DELETE FROM tag WHERE user_id = ?', [userId]);
  await deleteIfPresent(connection, tables, 'todo_reminders', 'DELETE FROM todo_reminders WHERE user_id = ?', [userId]);
  await deleteIfPresent(connection, tables, 'todo_items', 'DELETE FROM todo_items WHERE user_id = ?', [userId]);
}

export async function purgeLogsAndSecurityLinks(connection, tables, userId) {
  // 赞助订单作为真实交易对账记录保留，但注销时解除与轻笺账号及跳转凭证的关联。
  if (tables.has('support_reward_grants')) {
    await connection.query('UPDATE support_reward_grants SET user_id = NULL WHERE user_id = ?', [userId]);
  }
  if (tables.has('support_orders')) {
    if (tables.has('support_checkout_intents')) {
      await connection.query(
        `UPDATE support_orders o
         LEFT JOIN support_checkout_intents i
           ON i.id = o.checkout_intent_id
          AND i.user_id <> ?
            SET o.light_note_user_id = i.user_id,
                o.checkout_intent_id = i.id,
                o.ownership_source = CASE WHEN i.id IS NULL THEN 'unlinked' ELSE 'checkout' END
          WHERE o.light_note_user_id = ?`,
        [userId, userId],
      );
      await connection.query(
        `UPDATE support_orders o
         INNER JOIN support_checkout_intents i ON i.id = o.checkout_intent_id
            SET o.checkout_intent_id = NULL,
                o.ownership_source = CASE
                  WHEN o.light_note_user_id IS NULL THEN 'unlinked'
                  ELSE 'oauth'
                END
          WHERE i.user_id = ?`,
        [userId],
      );
    } else {
      await connection.query(
        `UPDATE support_orders
            SET light_note_user_id = NULL,
                checkout_intent_id = NULL,
                ownership_source = 'unlinked'
          WHERE light_note_user_id = ?`,
        [userId],
      );
    }
  }
  await deleteIfPresent(
    connection,
    tables,
    'support_checkout_intents',
    'DELETE FROM support_checkout_intents WHERE user_id = ?',
    [userId],
  );
  await deleteIfPresent(
    connection,
    tables,
    'support_account_links',
    'DELETE FROM support_account_links WHERE user_id = ?',
    [userId],
  );
  await deleteIfPresent(
    connection,
    tables,
    'points_economy_operations',
    'DELETE FROM points_economy_operations WHERE user_id = ?',
    [userId],
  );
  await deleteIfPresent(
    connection,
    tables,
    'support_public_preferences',
    'DELETE FROM support_public_preferences WHERE user_id = ?',
    [userId],
  );
  await deleteIfPresent(
    connection,
    tables,
    'admin_user_remarks',
    'DELETE FROM admin_user_remarks WHERE admin_user_id = ? OR target_user_id = ?',
    [userId, userId],
  );
  await deleteIfPresent(connection, tables, 'conversion_events', 'DELETE FROM conversion_events WHERE user_id = ?', [
    userId,
  ]);
  await deleteIfPresent(
    connection,
    tables,
    'ai_token_reservations',
    `DELETE FROM ai_token_reservations
      WHERE JSON_VALID(subjects_json)
        AND JSON_CONTAINS(
          subjects_json,
          JSON_OBJECT('type', 'user', 'key', ?),
          '$'
        ) = 1`,
    [userId],
  );
  await deleteIfPresent(
    connection,
    tables,
    'ai_token_usage',
    "DELETE FROM ai_token_usage WHERE subject_type = 'user' AND subject_key = ?",
    [userId],
  );
  await deleteIfPresent(
    connection,
    tables,
    'security_whitelist',
    "DELETE FROM security_whitelist WHERE (target_type = 'user' AND target_value = ?) OR created_by = ?",
    [userId, userId],
  );

  // 安全与管理员审计按既有短期留存策略保留，但解除与已注销账号的直接关联。
  await deleteIfPresent(
    connection,
    tables,
    'security_events',
    'UPDATE security_events SET user_id = NULL, role = NULL WHERE user_id = ?',
    [userId],
  );
  await deleteIfPresent(
    connection,
    tables,
    'admin_context_audit',
    "UPDATE admin_context_audit SET subject_user_id = NULL, subject_role = 'deleted' WHERE subject_user_id = ?",
    [userId],
  );
}

async function purgeDatabaseForUser(userId) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [accounts] = await connection.query(
      `SELECT role, del_flag
         FROM user
        WHERE id = ?
        LIMIT 1
        FOR UPDATE`,
      [userId],
    );
    const account = accounts[0] || null;
    if (account && Number(account.del_flag || 0) !== 1) {
      throw accountDeletionError(
        'ACCOUNT_DELETION_ACTIVE_ACCOUNT_BLOCKED',
        '账号当前仍处于可用状态，已拒绝物理清理',
        409,
      );
    }
    const tables = await existingTables(connection);
    await purgeAiWorkspace(connection, tables, userId);
    await purgeFeatureRequests(connection, tables, userId);
    await purgeOwnedResources(connection, tables, userId);
    await purgeLogsAndSecurityLinks(connection, tables, userId);
    if (tables.has('user')) {
      await connection.query("DELETE FROM user WHERE id = ? AND role = 'deleted' AND del_flag = 1", [userId]);
    }
    await connection.commit();
    invalidateAfdianLeaderboardCache();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

function mergeCleanupArtifacts(current, collected) {
  const objectKeys = [
    ...parseCleanupJsonArray(current?.object_keys_json || '[]', 'object_keys_json'),
    ...(collected.objectKeys || []),
  ];
  const noteImageUrls = [
    ...parseCleanupJsonArray(current?.note_image_urls_json || '[]', 'note_image_urls_json'),
    ...(collected.noteImageUrls || []),
  ];
  const bookmarkIcons = [
    ...parseCleanupJsonArray(current?.bookmark_icons_json || '[]', 'bookmark_icons_json'),
    ...(collected.bookmarkIcons || []),
  ];
  const bookmarkIconMap = new Map();
  for (const icon of bookmarkIcons) {
    const key = `${String(icon?.id || '')}:${String(icon?.iconUrl || icon?.icon_url || '')}`;
    if (key !== ':') bookmarkIconMap.set(key, icon);
  }
  return {
    objectKeys: [...new Set(objectKeys.map((value) => String(value || '').trim()).filter(Boolean))],
    noteImageUrls: [...new Set(noteImageUrls.map((value) => String(value || '').trim()).filter(Boolean))],
    bookmarkIcons: [...bookmarkIconMap.values()],
  };
}

/**
 * Root 资源治理专用：为已经不存在、已软删除或已正式注销的账号补建/恢复物理清理任务。
 *
 * 管理员权限只决定是否允许发起该动作；是否真的可删除仍由这里和
 * purgeDatabaseForUser 在两个事务阶段分别锁定 user 行复核，正常账号绝不进入清理。
 */
export async function cleanupInvalidOwnerResourcesNow({ userId, expectedRequestId = null, db = pool }) {
  const normalizedUserId = String(userId || '').trim();
  const normalizedRequestId = String(expectedRequestId || '').trim();
  if (!normalizedUserId) {
    throw accountDeletionError('ACCOUNT_DELETION_RETRY_SCOPE_INVALID', '失效资源归属范围无效', 400);
  }

  const connection = await db.getConnection();
  let requestId = '';
  try {
    await connection.beginTransaction();
    const [accounts] = await connection.query(
      `SELECT role, del_flag
         FROM user
        WHERE id = ?
        LIMIT 1
        FOR UPDATE`,
      [normalizedUserId],
    );
    const account = accounts[0] || null;
    if (account && Number(account.del_flag || 0) !== 1) {
      throw accountDeletionError(
        'ACCOUNT_DELETION_ACTIVE_ACCOUNT_BLOCKED',
        '账号当前仍处于可用状态，已拒绝物理清理',
        409,
      );
    }

    const tables = await existingTables(connection);
    if (!tables.has('account_deletion_requests')) {
      throw accountDeletionError('ACCOUNT_DELETION_SCHEMA_UNAVAILABLE', '账号清理队列表尚未就绪', 503);
    }
    const artifacts = await collectCleanupArtifacts(connection, tables, normalizedUserId);
    const [requests] = await connection.query(
      `SELECT id, user_id, status, processing_started_at,
              object_keys_json, note_image_urls_json, bookmark_icons_json
         FROM account_deletion_requests
        WHERE user_id = ?
        LIMIT 1
        FOR UPDATE`,
      [normalizedUserId],
    );
    const current = requests[0] || null;
    if (normalizedRequestId && (!current || String(current.id || '') !== normalizedRequestId)) {
      throw accountDeletionError('ACCOUNT_DELETION_RETRY_SCOPE_CHANGED', '注销清理任务状态已经变化', 409);
    }
    if (
      current?.status === 'processing' &&
      current.processing_started_at &&
      new Date(current.processing_started_at).getTime() >= Date.now() - STALE_PROCESSING_MINUTES * 60 * 1000
    ) {
      throw accountDeletionError('ACCOUNT_DELETION_RETRY_NOT_ALLOWED', '注销清理任务正在执行，请稍后刷新', 409);
    }

    if (current) {
      requestId = String(current.id);
      const merged = mergeCleanupArtifacts(current, artifacts);
      await connection.query(
        `UPDATE account_deletion_requests
            SET status = 'pending',
                object_keys_json = ?, note_image_urls_json = ?, bookmark_icons_json = ?,
                next_retry_at = NOW(), processing_started_at = NULL, completed_at = NULL,
                last_error_code = NULL
          WHERE id = ?`,
        [
          JSON.stringify(merged.objectKeys),
          JSON.stringify(merged.noteImageUrls),
          JSON.stringify(merged.bookmarkIcons),
          requestId,
        ],
      );
    } else {
      requestId = crypto.randomUUID();
      await connection.query(
        `INSERT INTO account_deletion_requests
          (id, user_id, status, object_keys_json, note_image_urls_json, bookmark_icons_json)
         VALUES (?, ?, 'pending', ?, ?, ?)`,
        [
          requestId,
          normalizedUserId,
          JSON.stringify(artifacts.objectKeys),
          JSON.stringify(artifacts.noteImageUrls),
          JSON.stringify(artifacts.bookmarkIcons),
        ],
      );
    }
    await connection.commit();
  } catch (error) {
    await connection.rollback().catch(() => {});
    throw error;
  } finally {
    connection.release();
  }

  const execution = await processAccountDeletionRequest(requestId);
  return { requestId, ...execution };
}

function parseCleanupJsonArray(value, fieldName) {
  let parsed;
  try {
    parsed = typeof value === 'string' ? JSON.parse(value) : value;
  } catch (cause) {
    const error = accountDeletionError(
      'ACCOUNT_DELETION_TASK_PAYLOAD_INVALID',
      '账号注销清理任务数据异常，将自动重试',
      500,
    );
    error.fieldName = fieldName;
    error.cause = cause;
    throw error;
  }
  if (!Array.isArray(parsed)) {
    const error = accountDeletionError(
      'ACCOUNT_DELETION_TASK_PAYLOAD_INVALID',
      '账号注销清理任务数据异常，将自动重试',
      500,
    );
    error.fieldName = fieldName;
    throw error;
  }
  return parsed;
}

async function deleteObsObjects(objectKeys) {
  const keys = [...new Set((objectKeys || []).map((key) => String(key || '').trim()).filter(Boolean))];
  if (!keys.length) return;
  const { deleteObjectFromObs } = await import('./obsClient.js');
  const failed = [];
  for (let index = 0; index < keys.length; index += 4) {
    const chunk = keys.slice(index, index + 4);
    const results = await Promise.allSettled(chunk.map((key) => deleteObjectFromObs(key)));
    results.forEach((result, resultIndex) => {
      if (result.status === 'rejected') failed.push(chunk[resultIndex]);
    });
  }
  if (failed.length) {
    const error = accountDeletionError(
      'ACCOUNT_DELETION_OBJECT_CLEANUP_FAILED',
      '部分云端对象暂未删除，将自动重试',
      503,
    );
    error.failedObjectCount = failed.length;
    throw error;
  }
}

async function claimDeletionRequest(requestId) {
  const [result] = await pool.query(
    `UPDATE account_deletion_requests
        SET status = 'processing',
            attempts = attempts + 1,
            processing_started_at = NOW(),
            last_error_code = NULL
      WHERE id = ?
        AND (
          status = 'pending'
          OR (status = 'retry_wait' AND next_retry_at <= NOW())
          OR (status = 'processing' AND processing_started_at < DATE_SUB(NOW(), INTERVAL ${STALE_PROCESSING_MINUTES} MINUTE))
        )`,
    [requestId],
  );
  if (Number(result?.affectedRows || 0) !== 1) return null;
  const [rows] = await pool.query(
    `SELECT id, user_id, object_keys_json, note_image_urls_json, bookmark_icons_json, attempts
       FROM account_deletion_requests
      WHERE id = ?
      LIMIT 1`,
    [requestId],
  );
  return rows[0] || null;
}

async function markDeletionRetry(requestId, attempts, error) {
  const delayMinutes = Math.min(24 * 60, 2 ** Math.min(Math.max(Number(attempts || 1) - 1, 0), 10));
  const nextRetryAt = new Date(Date.now() + delayMinutes * 60 * 1000);
  await pool.query(
    `UPDATE account_deletion_requests
      SET status = 'retry_wait',
            next_retry_at = ?,
            processing_started_at = NULL,
            last_error_code = ?
      WHERE id = ?
        AND status = 'processing'`,
    [nextRetryAt, stableAgentErrorCode(error), requestId],
  );
}

export async function processAccountDeletionRequest(requestId) {
  let job;
  try {
    job = await claimDeletionRequest(requestId);
    if (!job) return { claimed: false };

    const objectKeys = parseCleanupJsonArray(job.object_keys_json, 'object_keys_json');
    const noteImageUrls = parseCleanupJsonArray(job.note_image_urls_json, 'note_image_urls_json');
    const bookmarkIcons = parseCleanupJsonArray(job.bookmark_icons_json, 'bookmark_icons_json');

    await purgeDatabaseForUser(job.user_id);
    await deleteObsObjects(objectKeys);
    const [{ cleanupOrphanNoteImages }, { cleanupBookmarkIconFiles }] = await Promise.all([
      import('./noteImages.js'),
      import('./bookmarkIconService.js'),
    ]);
    await cleanupOrphanNoteImages(noteImageUrls, { strict: true });
    const iconResult = await cleanupBookmarkIconFiles(bookmarkIcons);
    if (Number(iconResult?.failed || 0) > 0) {
      throw accountDeletionError('ACCOUNT_DELETION_ICON_CLEANUP_FAILED', '部分本地图标暂未删除，将自动重试', 503);
    }

    const [completionResult] = await pool.query(
      `UPDATE account_deletion_requests
          SET status = 'completed',
              object_keys_json = '[]',
              note_image_urls_json = '[]',
              bookmark_icons_json = '[]',
              completed_at = NOW(),
              processing_started_at = NULL,
              last_error_code = NULL
        WHERE id = ?
          AND status = 'processing'`,
      [requestId],
    );
    if (Number(completionResult?.affectedRows || 0) !== 1) {
      throw accountDeletionError(
        'ACCOUNT_DELETION_COMPLETION_STATE_LOST',
        '账号注销清理任务状态已变化，将自动复核',
        409,
      );
    }
    return { claimed: true, completed: true };
  } catch (error) {
    if (job?.id) {
      await markDeletionRetry(job.id, job.attempts, error).catch((markError) => {
        console.error('[account-deletion] retry state failed code=%s', stableAgentErrorCode(markError));
      });
    }
    throw error;
  }
}

export async function processPendingAccountDeletions() {
  const [rows] = await pool.query(
    `SELECT id
       FROM account_deletion_requests
      WHERE (status IN ('pending', 'retry_wait') AND next_retry_at <= NOW())
         OR (status = 'processing' AND processing_started_at < DATE_SUB(NOW(), INTERVAL ${STALE_PROCESSING_MINUTES} MINUTE))
      ORDER BY requested_at ASC
      LIMIT ${CLEANUP_BATCH_SIZE}`,
  );
  const results = [];
  for (const row of rows) {
    try {
      results.push(await processAccountDeletionRequest(row.id));
    } catch (error) {
      console.error('[account-deletion] cleanup failed code=%s', stableAgentErrorCode(error));
      results.push({ claimed: true, completed: false, code: stableAgentErrorCode(error) });
    }
  }
  return results;
}

export async function cleanupCompletedAccountDeletionRequests() {
  const [result] = await pool.query(
    `DELETE FROM account_deletion_requests
      WHERE status = 'completed'
        AND completed_at < DATE_SUB(NOW(), INTERVAL ${COMPLETED_RECORD_RETENTION_DAYS} DAY)
      LIMIT ${COMPLETED_RECORD_CLEANUP_BATCH_SIZE}`,
  );
  return Number(result?.affectedRows || 0);
}

export async function startAccountDeletionCleanupScheduler() {
  try {
    await processPendingAccountDeletions();
    await cleanupCompletedAccountDeletionRequests();
  } catch (error) {
    if (error?.code === 'ER_NO_SUCH_TABLE') {
      console.warn('[account-deletion] cleanup scheduler disabled: migration not applied');
      return null;
    }
    console.error('[account-deletion] initial cleanup failed code=%s', stableAgentErrorCode(error));
  }

  const timer = setInterval(() => {
    Promise.all([processPendingAccountDeletions(), cleanupCompletedAccountDeletionRequests()]).catch((error) =>
      console.error('[account-deletion] scheduled cleanup failed code=%s', stableAgentErrorCode(error)),
    );
  }, CLEANUP_INTERVAL_MS);
  timer.unref?.();
  return timer;
}
