import crypto from 'node:crypto';
import pool from '../../db/index.js';
import { aiSkillError } from './errors.js';

const THREAD_TTL_DAYS = 30;
const MAX_STORED_TURNS = 20;
const MAX_USER_TEXT = 2_000;
const MAX_ASSISTANT_TEXT = 20_000;

function boundedText(value, maxLength) {
  return String(value || '')
    .trim()
    .slice(0, maxLength);
}

function supportsHistory(skill) {
  return Number(skill?.contextPolicy?.historyTurns || 0) > 0;
}

function assertThreadBinding(row, { skill, context }) {
  if (!row || row.status !== 'active') {
    throw aiSkillError('AI_SKILL_THREAD_UNAVAILABLE', '这段 AI 追问已失效，请重新开始', 404);
  }
  if (
    String(row.skill_id) !== skill.id ||
    Number(row.skill_version) !== skill.version ||
    String(row.scope_digest) !== context.scopeDigest ||
    String(row.actor_user_id) !== context.identity.actorUserId ||
    String(row.subject_user_id) !== context.identity.subjectUserId ||
    String(row.admin_context_mode || 'normal') !== context.identity.adminContextMode ||
    String(row.admin_context_id || '') !== String(context.identity.adminContextId || '')
  ) {
    throw aiSkillError('AI_SKILL_THREAD_SCOPE_CONFLICT', '能力或材料范围已变化，请重新开始本次处理', 409);
  }
}

export async function resolveAiSkillThread({ skill, request, context, database = pool }) {
  if (context.identity.adminContextMode === 'readonly') {
    if (request.threadId) {
      throw aiSkillError('ADMIN_PREVIEW_READONLY', '管理员只读预览不能继续或保存 AI 追问', 403);
    }
    // 允许基于本轮权威资料做一次只读处理，但不在目标账号域写入自然语言历史。
    return null;
  }
  if (!supportsHistory(skill)) {
    if (request.threadId) {
      throw aiSkillError('AI_SKILL_THREAD_NOT_SUPPORTED', '该能力不使用连续对话', 400);
    }
    return null;
  }
  if (!request.threadId) {
    return Object.freeze({ id: crypto.randomUUID(), history: Object.freeze([]), persisted: false });
  }
  const [rows] = await database.query(
    `SELECT id, actor_user_id, subject_user_id, admin_context_mode, admin_context_id,
            skill_id, skill_version, scope_digest, status
       FROM ai_skill_threads
      WHERE id = ? AND expires_at > CURRENT_TIMESTAMP
      LIMIT 1`,
    [request.threadId],
  );
  const row = rows[0];
  assertThreadBinding(row, { skill, context });
  const limit = Math.max(1, Math.min(MAX_STORED_TURNS, Number(skill.contextPolicy.historyTurns) || 1));
  const [turns] = await database.query(
    `SELECT user_text, assistant_text
       FROM ai_skill_turns
      WHERE thread_id = ?
      ORDER BY created_at DESC, id DESC
      LIMIT ?`,
    [request.threadId, limit],
  );
  const history = turns
    .reverse()
    .flatMap((turn) => [
      Object.freeze({ role: 'user', content: boundedText(turn.user_text, MAX_USER_TEXT) }),
      Object.freeze({ role: 'assistant', content: boundedText(turn.assistant_text, MAX_ASSISTANT_TEXT) }),
    ]);
  return Object.freeze({ id: String(row.id), history: Object.freeze(history), persisted: true });
}

export async function appendAiSkillTurn({
  thread,
  skill,
  context,
  requestId,
  userText,
  assistantText,
  database = pool,
}) {
  if (!thread) return;
  const normalizedUserText = boundedText(userText, MAX_USER_TEXT);
  const normalizedAssistantText = boundedText(assistantText, MAX_ASSISTANT_TEXT);
  if (!normalizedUserText || !normalizedAssistantText) return;
  const connection = await database.getConnection();
  try {
    await connection.beginTransaction();
    if (!thread.persisted) {
      await connection.query(
        `INSERT INTO ai_skill_threads
          (id, actor_user_id, subject_user_id, admin_context_mode, admin_context_id,
           skill_id, skill_version, scope_digest, status, expires_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active', DATE_ADD(CURRENT_TIMESTAMP, INTERVAL ? DAY))`,
        [
          thread.id,
          context.identity.actorUserId,
          context.identity.subjectUserId,
          context.identity.adminContextMode,
          context.identity.adminContextId,
          skill.id,
          skill.version,
          context.scopeDigest,
          THREAD_TTL_DAYS,
        ],
      );
    } else {
      const [updated] = await connection.query(
        `UPDATE ai_skill_threads
            SET updated_at = CURRENT_TIMESTAMP,
                expires_at = DATE_ADD(CURRENT_TIMESTAMP, INTERVAL ? DAY)
          WHERE id = ?
            AND status = 'active'
            AND scope_digest = ?
            AND actor_user_id = ?
            AND subject_user_id = ?
            AND admin_context_mode = ?
            AND admin_context_id <=> ?
            AND skill_id = ?
            AND skill_version = ?`,
        [
          THREAD_TTL_DAYS,
          thread.id,
          context.scopeDigest,
          context.identity.actorUserId,
          context.identity.subjectUserId,
          context.identity.adminContextMode,
          context.identity.adminContextId,
          skill.id,
          skill.version,
        ],
      );
      if (Number(updated?.affectedRows || 0) !== 1) {
        throw aiSkillError('AI_SKILL_THREAD_SCOPE_CONFLICT', '材料范围已变化，请重新开始本次处理', 409);
      }
    }
    await connection.query(
      `INSERT INTO ai_skill_turns (id, thread_id, request_id, user_text, assistant_text)
       VALUES (?, ?, ?, ?, ?)`,
      [crypto.randomUUID(), thread.id, requestId, normalizedUserText, normalizedAssistantText],
    );
    await connection.query(
      `DELETE FROM ai_skill_turns
        WHERE thread_id = ?
          AND id NOT IN (
            SELECT id FROM (
              SELECT id FROM ai_skill_turns
               WHERE thread_id = ?
               ORDER BY created_at DESC, id DESC
               LIMIT ?
            ) AS retained_turns
          )`,
      [thread.id, thread.id, MAX_STORED_TURNS],
    );
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    if (error?.code === 'ER_DUP_ENTRY') {
      throw aiSkillError('AI_SKILL_REQUEST_DUPLICATED', '该请求已经处理，请勿重复提交', 409);
    }
    throw error;
  } finally {
    connection.release();
  }
}

export const aiSkillThreadInternals = Object.freeze({
  THREAD_TTL_DAYS,
  MAX_STORED_TURNS,
  boundedText,
  supportsHistory,
  assertThreadBinding,
});
