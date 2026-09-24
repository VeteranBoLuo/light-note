import crypto from 'node:crypto';
import { TOOLBOX_PRICING_VERSION } from '@lightnote/shared/toolbox-protocol';
import { toolboxError } from './errors.js';
/** The quote contains only metadata; raw text is kept in the scoped translation table. */
export async function insertTranslationQuote({ database, userId, requestId, resolved, ttlMs }) {
  const connection = await database.getConnection();
  try {
    await connection.beginTransaction();
    const [owners] = await connection.query('SELECT id FROM user WHERE id=? AND del_flag=0 FOR UPDATE', [userId]);
    if (!owners.length) throw toolboxError('TOOLBOX_RESOURCE_UNAVAILABLE', '账号不可用', 403);
    const [existing] = await connection.query('SELECT * FROM toolbox_quotes WHERE user_id=? AND request_id=? FOR UPDATE', [userId, requestId]);
    if (existing[0]) {
      if (existing[0].tool_id !== 'translation' || existing[0].input_digest !== resolved.inputDigest || existing[0].billing_medium !== 'ai_quota')
        throw toolboxError('TOOLBOX_IDEMPOTENCY_KEY_REUSED', '请求已用于其他内容', 409);
      await connection.commit(); return existing[0];
    }
    const row = { id: crypto.randomUUID(), user_id: userId, request_id: requestId, tool_id: 'translation', pricing_version: TOOLBOX_PRICING_VERSION,
      billing_medium: 'ai_quota', input_digest: resolved.inputDigest, input_snapshot_json: JSON.stringify(resolved.snapshot), quoted_points: 0,
      status: 'active', expires_at: new Date(Date.now() + ttlMs) };
    await connection.query('INSERT INTO toolbox_quotes SET ?', [row]);
    await connection.query('INSERT INTO toolbox_translation_inputs (quote_id,user_id,content,segments_json,expires_at) VALUES (?,?,?,?,?)',
      [row.id, userId, resolved.translation.text, JSON.stringify(resolved.translation.segments), row.expires_at]);
    await connection.commit(); return row;
  } catch (error) { await connection.rollback(); throw error; }
  finally { connection.release(); }
}
