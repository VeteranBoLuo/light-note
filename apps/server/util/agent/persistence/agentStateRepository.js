import crypto from 'node:crypto';
import pool from '../../../db/index.js';

const SOURCE_SET_KINDS = new Set(['explicit', 'result_refs', 'attachment', 'dialogue', 'mixed']);
const RESULT_COMPLETENESS = new Set(['complete', 'partial', 'unknown', 'empty']);
const ARTIFACT_STATES = new Set(['draft', 'ready', 'committed', 'cancelled', 'superseded', 'failed', 'unknown']);
const RUN_STATUSES = new Set([
  'accepted',
  'running',
  'clarification',
  'unsupported',
  'forbidden',
  'awaiting_confirmation',
  'awaiting_interaction',
  'partial',
  'completed',
  'cancelled',
  'failed',
  'unknown',
]);
const MAX_STATE_IDS = 12;
const MAX_SOURCE_ITEMS = 64;
const MAX_RESULT_REFS = 100;
const MAX_JSON_BYTES = 256 * 1024;
const MAX_ARTIFACT_BYTES = 2 * 1024 * 1024;

function text(value, maxLength, fallback = '') {
  const normalized = String(value ?? '').trim();
  return (normalized || fallback).slice(0, maxLength);
}

function nonNegativeInteger(value, fallback = 0) {
  const normalized = Number(value);
  return Number.isSafeInteger(normalized) && normalized >= 0 ? normalized : fallback;
}

function parseJson(value, fallback) {
  if (value == null || value === '') return fallback;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function stableJson(value, maxBytes = MAX_JSON_BYTES) {
  let serialized;
  try {
    serialized = JSON.stringify(value ?? null);
  } catch {
    throw new AgentStateRepositoryError('AGENT_STATE_JSON_INVALID', 'Agent 持久状态无法序列化。');
  }
  if (Buffer.byteLength(serialized, 'utf8') > maxBytes) {
    throw new AgentStateRepositoryError('AGENT_STATE_JSON_TOO_LARGE', 'Agent 持久状态超过保存上限。');
  }
  return serialized;
}

function hash(value) {
  return crypto
    .createHash('sha256')
    .update(String(value || ''))
    .digest('hex');
}

function uniqueIds(values, max = MAX_STATE_IDS) {
  return [...new Set((Array.isArray(values) ? values : []).map((value) => text(value, 64)).filter(Boolean))].slice(
    0,
    max,
  );
}

function normalizeAdminMode(value) {
  return ['readonly', 'maintain'].includes(value) ? value : 'normal';
}

function normalizeRef(value) {
  const type = text(value?.type, 32);
  const id = text(value?.id ?? value?.resourceId, 255);
  if (!/^[a-z][a-z0-9_-]{0,31}$/.test(type) || !id) return null;
  const version = text(value?.version ?? value?.resourceVersion, 96);
  return { type, id, ...(version ? { version } : {}) };
}

function normalizeRefs(values, max = MAX_RESULT_REFS) {
  const output = [];
  const seen = new Set();
  for (const value of Array.isArray(values) ? values : []) {
    const ref = normalizeRef(value);
    if (!ref) continue;
    const key = `${ref.type}:${ref.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(ref);
    if (output.length >= max) break;
  }
  return output;
}

function normalizeStateSnapshot(value = {}, expectedRevision = null) {
  const discourseState =
    value?.discourseState && typeof value.discourseState === 'object' && !Array.isArray(value.discourseState)
      ? value.discourseState
      : {};
  const revision =
    expectedRevision == null
      ? nonNegativeInteger(value?.revision ?? discourseState.revision)
      : nonNegativeInteger(expectedRevision) + 1;
  return {
    revision,
    topicEpoch: nonNegativeInteger(value?.topicEpoch ?? discourseState.topicEpoch),
    discourseState: { ...discourseState, revision },
    activeSourceSetIds: uniqueIds(value?.activeSourceSetIds ?? discourseState.activeSourceSetIds),
    activeResultSetIds: uniqueIds(value?.activeResultSetIds ?? discourseState.activeResultSetIds),
    latestArtifactVersionId: text(value?.latestArtifactVersionId, 36) || null,
    lastRunId: text(value?.lastRunId, 64) || null,
  };
}

function placeholders(count) {
  return Array.from({ length: count }, () => '?').join(',');
}

function rowDate(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function databaseDate(value) {
  if (value == null || value === '') return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

function mapSourceSet(row) {
  const items = parseJson(row.items_json, {});
  return {
    id: String(row.id),
    runId: row.run_id == null ? null : String(row.run_id),
    kind: row.kind,
    items,
    sourceDigest: row.source_digest,
    createdAt: rowDate(row.create_time),
    expiresAt: rowDate(row.expires_at),
  };
}

function mapResultSet(row) {
  return {
    id: String(row.id),
    handleId: String(row.handle_id),
    runId: String(row.run_id),
    goalId: String(row.goal_id),
    capabilityId: String(row.capability_id),
    entityType: String(row.entity_type),
    queryFingerprint: String(row.query_fingerprint),
    filters: parseJson(row.filters_json, {}),
    refs: normalizeRefs(parseJson(row.refs_json, [])),
    ordering: parseJson(row.ordering_json, []),
    fieldMask: parseJson(row.field_mask_json, []),
    totalCount: row.total_count == null ? null : nonNegativeInteger(row.total_count),
    returnedCount: nonNegativeInteger(row.returned_count),
    completeness: RESULT_COMPLETENESS.has(row.completeness) ? row.completeness : 'unknown',
    partialReason: row.partial_reason || null,
    nextCursor: row.next_cursor || null,
    freshUntil: rowDate(row.fresh_until),
    createdAt: rowDate(row.create_time),
  };
}

function mapArtifactVersion(row) {
  return {
    id: String(row.id),
    artifactChainId: String(row.artifact_chain_id),
    capabilityId: String(row.capability_id),
    version: nonNegativeInteger(row.version),
    parentVersionId: row.parent_version_id == null ? null : String(row.parent_version_id),
    state: ARTIFACT_STATES.has(row.state) ? row.state : 'unknown',
    content: row.content_md || '',
    contentHash: row.content_hash,
    sourceSetId: row.source_set_id == null ? null : String(row.source_set_id),
    outputContract: parseJson(row.output_contract, null),
    validationReport: parseJson(row.validation_report, null),
    createdAt: rowDate(row.create_time),
    updatedAt: rowDate(row.update_time),
  };
}

export class AgentStateRepositoryError extends Error {
  constructor(code, message, status = 400) {
    super(message);
    this.name = 'AgentStateRepositoryError';
    this.code = code;
    this.status = status;
  }
}

export function createAgentPersistenceContext(input = {}) {
  const conversationId = text(input.conversationId, 36);
  const actorId = text(input.actorId ?? input.conversationOwnerId, 64);
  const subjectId = text(input.subjectId ?? actorId, 64);
  const actorRole = text(input.actorRole, 24, 'user');
  const ownerKey = text(input.ownerKey, 512);
  const submittedOwnerKeyHash = text(input.ownerKeyHash, 64);
  const adminContextMode = normalizeAdminMode(input.adminContextMode);
  const adminContextId = text(input.adminContextId, 64) || null;
  if (!conversationId || !actorId || !subjectId || (!ownerKey && !/^[a-f0-9]{64}$/.test(submittedOwnerKeyHash))) {
    throw new AgentStateRepositoryError('AGENT_STATE_CONTEXT_INVALID', 'Agent 持久状态身份不完整。', 403);
  }
  if ((adminContextMode === 'normal') !== (adminContextId == null)) {
    throw new AgentStateRepositoryError('AGENT_STATE_CONTEXT_INVALID', 'Agent 管理上下文绑定无效。', 403);
  }
  return Object.freeze({
    conversationId,
    conversationOwnerId: actorId,
    actorId,
    actorRole,
    subjectId,
    ownerKeyHash: ownerKey ? hash(`agent-owner:${ownerKey}`) : submittedOwnerKeyHash,
    adminContextMode,
    adminContextId,
    runtimeVersion: text(input.runtimeVersion, 16, 'v3'),
  });
}

function ownerWhereParams(context) {
  return [context.conversationId, context.actorId, context.subjectId, context.adminContextMode, context.adminContextId];
}

async function assertConversationOwner(connection, context) {
  const [rows] = await connection.query(
    `SELECT id FROM ai_conversations
      WHERE id = ? AND actor_user_id = ? AND subject_user_id = ?
        AND admin_context_mode = ? AND admin_context_id <=> ?
        AND status IN ('active', 'archived')
      LIMIT 1 FOR UPDATE`,
    ownerWhereParams(context),
  );
  if (!rows.length) {
    throw new AgentStateRepositoryError('AGENT_STATE_FORBIDDEN', 'Agent 会话不存在或无权访问。', 403);
  }
}

async function selectRowsByIds(database, table, ids, context) {
  if (!ids.length) return [];
  const allowed = new Set(['ai_agent_source_set', 'ai_agent_result_set']);
  if (!allowed.has(table)) throw new AgentStateRepositoryError('AGENT_STATE_QUERY_INVALID', '持久状态查询无效。');
  const [rows] = await database.query(
    `SELECT * FROM ${table}
      WHERE conversation_id = ? AND owner_key_hash = ? AND id IN (${placeholders(ids.length)})`,
    [context.conversationId, context.ownerKeyHash, ...ids],
  );
  const byId = new Map(rows.map((row) => [String(row.id), row]));
  return ids.map((id) => byId.get(id)).filter(Boolean);
}

export async function loadAgentConversationState(contextInput, database = pool) {
  const context = createAgentPersistenceContext(contextInput);
  const [rows] = await database.query(
    `SELECT state.*
       FROM ai_agent_conversation_state AS state
       INNER JOIN ai_conversations AS conversation ON conversation.id = state.conversation_id
      WHERE state.conversation_id = ?
        AND state.conversation_owner_id = ?
        AND state.owner_key_hash = ?
        AND conversation.actor_user_id = ?
        AND conversation.subject_user_id = ?
        AND conversation.admin_context_mode = ?
        AND conversation.admin_context_id <=> ?
        AND conversation.status IN ('active', 'archived')
      LIMIT 1`,
    [
      context.conversationId,
      context.conversationOwnerId,
      context.ownerKeyHash,
      context.actorId,
      context.subjectId,
      context.adminContextMode,
      context.adminContextId,
    ],
  );
  const row = rows[0];
  if (!row) return null;
  const state = normalizeStateSnapshot({
    revision: row.revision,
    topicEpoch: row.topic_epoch,
    discourseState: parseJson(row.discourse_state, {}),
    activeSourceSetIds: parseJson(row.active_source_set_ids, []),
    activeResultSetIds: parseJson(row.active_result_set_ids, []),
    latestArtifactVersionId: row.latest_artifact_version_id,
    lastRunId: row.last_run_id,
  });
  const [sourceRows, resultRows] = await Promise.all([
    selectRowsByIds(database, 'ai_agent_source_set', state.activeSourceSetIds, context),
    selectRowsByIds(database, 'ai_agent_result_set', state.activeResultSetIds, context),
  ]);
  let artifactVersion = null;
  if (state.latestArtifactVersionId) {
    const [artifactRows] = await database.query(
      `SELECT * FROM ai_agent_artifact_version
        WHERE conversation_id = ? AND owner_key_hash = ? AND id = ? LIMIT 1`,
      [context.conversationId, context.ownerKeyHash, state.latestArtifactVersionId],
    );
    artifactVersion = artifactRows[0] ? mapArtifactVersion(artifactRows[0]) : null;
  }
  return Object.freeze({
    ...state,
    sourceSets: Object.freeze(sourceRows.map(mapSourceSet)),
    resultSets: Object.freeze(resultRows.map(mapResultSet)),
    artifactVersion,
    updatedAt: rowDate(row.update_time),
  });
}

export async function loadAgentArtifactVersion(contextInput, artifactId, database = pool) {
  const context = createAgentPersistenceContext(contextInput);
  const [rows] = await database.query(
    `SELECT artifact.*
       FROM ai_agent_artifact_version AS artifact
       INNER JOIN ai_conversations AS conversation ON conversation.id = artifact.conversation_id
      WHERE artifact.id = ? AND artifact.conversation_id = ?
        AND artifact.owner_key_hash = ? AND artifact.subject_id = ?
        AND conversation.actor_user_id = ? AND conversation.subject_user_id = ?
        AND conversation.admin_context_mode = ? AND conversation.admin_context_id <=> ?
        AND conversation.status IN ('active', 'archived')
      LIMIT 1`,
    [
      text(artifactId, 36),
      context.conversationId,
      context.ownerKeyHash,
      context.subjectId,
      context.actorId,
      context.subjectId,
      context.adminContextMode,
      context.adminContextId,
    ],
  );
  return rows[0] ? Object.freeze(mapArtifactVersion(rows[0])) : null;
}

export async function loadAgentSourceSet(contextInput, sourceSetId, database = pool) {
  const context = createAgentPersistenceContext(contextInput);
  const [rows] = await database.query(
    `SELECT source_set.*
       FROM ai_agent_source_set AS source_set
       INNER JOIN ai_conversations AS conversation ON conversation.id = source_set.conversation_id
      WHERE source_set.id = ? AND source_set.conversation_id = ?
        AND source_set.owner_key_hash = ? AND source_set.subject_id = ?
        AND conversation.actor_user_id = ? AND conversation.subject_user_id = ?
        AND conversation.admin_context_mode = ? AND conversation.admin_context_id <=> ?
        AND conversation.status IN ('active', 'archived')
      LIMIT 1`,
    [
      text(sourceSetId, 36),
      context.conversationId,
      context.ownerKeyHash,
      context.subjectId,
      context.actorId,
      context.subjectId,
      context.adminContextMode,
      context.adminContextId,
    ],
  );
  return rows[0] ? Object.freeze(mapSourceSet(rows[0])) : null;
}

/**
 * 客户端只提交曾公开过的 ArtifactVersion ID。服务端先用该 ID 定位版本链，再在同一
 * owner / subject / conversation 边界内选择最新可编辑版本，避免旧页面把 v1 复活并
 * 覆盖已经生成的 v2。正文只从持久层读取，永不接受客户端回传。
 */
export async function loadLatestEditableAgentArtifactVersion(contextInput, artifactId, database = pool) {
  const context = createAgentPersistenceContext(contextInput);
  const [rows] = await database.query(
    `SELECT latest.*
       FROM ai_agent_artifact_version AS seed
       INNER JOIN ai_agent_artifact_version AS latest
         ON latest.artifact_chain_id = seed.artifact_chain_id
        AND latest.conversation_id = seed.conversation_id
        AND latest.owner_key_hash = seed.owner_key_hash
        AND latest.subject_id = seed.subject_id
       INNER JOIN ai_conversations AS conversation ON conversation.id = seed.conversation_id
      WHERE seed.id = ? AND seed.conversation_id = ?
        AND seed.owner_key_hash = ? AND seed.subject_id = ?
        AND latest.state IN ('draft', 'ready')
        AND conversation.actor_user_id = ? AND conversation.subject_user_id = ?
        AND conversation.admin_context_mode = ? AND conversation.admin_context_id <=> ?
        AND conversation.status IN ('active', 'archived')
      ORDER BY latest.version DESC
      LIMIT 1`,
    [
      text(artifactId, 36),
      context.conversationId,
      context.ownerKeyHash,
      context.subjectId,
      context.actorId,
      context.subjectId,
      context.adminContextMode,
      context.adminContextId,
    ],
  );
  return rows[0] ? Object.freeze(mapArtifactVersion(rows[0])) : null;
}

export function prepareAgentSourceSet(input = {}, contextInput = {}) {
  const context = createAgentPersistenceContext(contextInput);
  const id = text(input.id, 36) || crypto.randomUUID();
  const refs = normalizeRefs(input.refs, MAX_SOURCE_ITEMS);
  const scopeRefs = normalizeRefs(input.scopeRefs, MAX_SOURCE_ITEMS);
  const attachmentIds = uniqueIds(input.attachmentIds ?? input.attachmentSourceIds, MAX_SOURCE_ITEMS);
  const dialogueAnchor =
    input.dialogueAnchor && typeof input.dialogueAnchor === 'object' && !Array.isArray(input.dialogueAnchor)
      ? {
          // Dialogue Anchor 只能属于当前经过 owner 校验的会话，不能由调用方跨会话指定。
          conversationId: context.conversationId,
          messageIds: uniqueIds(input.dialogueAnchor.messageIds, 40),
          topicEpoch: nonNegativeInteger(input.dialogueAnchor.topicEpoch),
          digest: text(input.dialogueAnchor.digest, 64),
        }
      : null;
  const items = { refs, scopeRefs, attachmentIds, ...(dialogueAnchor ? { dialogueAnchor } : {}) };
  const inferredKind = dialogueAnchor
    ? refs.length || scopeRefs.length || attachmentIds.length
      ? 'mixed'
      : 'dialogue'
    : [refs.length || scopeRefs.length, attachmentIds.length].filter(Boolean).length > 1
      ? 'mixed'
      : attachmentIds.length
        ? 'attachment'
        : 'explicit';
  const kind = SOURCE_SET_KINDS.has(input.kind) ? input.kind : inferredKind;
  const serializedItems = stableJson(items);
  return Object.freeze({
    id,
    conversationId: context.conversationId,
    runId: text(input.runId, 64) || null,
    ownerKeyHash: context.ownerKeyHash,
    subjectId: context.subjectId,
    kind,
    items,
    serializedItems,
    sourceDigest: text(input.sourceDigest, 64) || hash(`agent-source-set-v2\0${serializedItems}`),
    expiresAt: databaseDate(input.expiresAt),
  });
}

export function prepareAgentResultSet(input = {}, contextInput = {}) {
  const context = createAgentPersistenceContext(contextInput);
  const refs = normalizeRefs(input.refs);
  const metadata = input.metadata && typeof input.metadata === 'object' ? input.metadata : {};
  const totalExact = metadata.totalExact === true;
  const totalCount = totalExact ? nonNegativeInteger(metadata.totalCount ?? metadata.total, null) : null;
  const completeness = RESULT_COMPLETENESS.has(input.completeness)
    ? input.completeness
    : refs.length === 0 && (metadata.complete === true || totalCount === 0)
      ? 'empty'
      : metadata.complete === true
        ? 'complete'
        : metadata.partial === true
          ? 'partial'
          : 'unknown';
  const capabilityId = text(input.capabilityId, 120);
  const runId = text(input.runId, 64);
  if (!runId || !capabilityId) {
    throw new AgentStateRepositoryError('AGENT_RESULT_SET_INVALID', 'Agent 结果句柄缺少运行或能力标识。');
  }
  const filters = input.filters && typeof input.filters === 'object' ? input.filters : {};
  const ordering = Array.isArray(input.ordering) ? input.ordering.slice(0, 8) : [];
  const fieldMask = uniqueIds(input.fieldMask, 32);
  const fingerprintIdentity = {
    capabilityId,
    manifestVersion: text(input.manifestVersion, 24, '3.0'),
    subjectId: context.subjectId,
    ownerKeyHash: context.ownerKeyHash,
    filters,
    ordering,
    fieldMask,
    timeZone: text(input.timeZone, 64),
  };
  return Object.freeze({
    id: text(input.id, 36) || crypto.randomUUID(),
    handleId: text(input.handleId, 64) || `rsh-${crypto.randomUUID()}`,
    runId,
    conversationId: context.conversationId,
    ownerKeyHash: context.ownerKeyHash,
    subjectId: context.subjectId,
    goalId: text(input.goalId, 64) || capabilityId,
    capabilityId,
    entityType: text(input.entityType, 32) || refs[0]?.type || 'content',
    queryFingerprint: text(input.queryFingerprint, 64) || hash(stableJson(fingerprintIdentity)),
    filters,
    refs,
    ordering,
    fieldMask,
    totalCount,
    returnedCount: nonNegativeInteger(metadata.returned ?? input.returnedCount, refs.length),
    completeness,
    partialReason: text(input.partialReason ?? metadata.truncationReason, 64) || null,
    nextCursor: text(input.nextCursor ?? metadata.nextCursor, 8_192) || null,
    freshUntil: databaseDate(input.freshUntil),
  });
}

export function prepareAgentArtifactVersion(input = {}, contextInput = {}) {
  const context = createAgentPersistenceContext(contextInput);
  const content = String(input.content ?? input.contentMd ?? '');
  if (Buffer.byteLength(content, 'utf8') > MAX_ARTIFACT_BYTES) {
    throw new AgentStateRepositoryError('AGENT_ARTIFACT_TOO_LARGE', 'Agent 产物正文超过保存上限。');
  }
  const state = ARTIFACT_STATES.has(input.state) ? input.state : 'draft';
  return Object.freeze({
    id: text(input.id, 36) || crypto.randomUUID(),
    artifactChainId: text(input.artifactChainId, 36) || crypto.randomUUID(),
    conversationId: context.conversationId,
    ownerKeyHash: context.ownerKeyHash,
    subjectId: context.subjectId,
    capabilityId: text(input.capabilityId, 120),
    version: Math.max(1, nonNegativeInteger(input.version, 1)),
    parentVersionId: text(input.parentVersionId, 36) || null,
    state,
    content,
    contentHash: text(input.contentHash, 64) || hash(content),
    sourceSetId: text(input.sourceSetId, 36) || null,
    outputContract: input.outputContract ?? null,
    validationReport: input.validationReport ?? null,
  });
}

async function insertSourceSet(connection, sourceSet) {
  await connection.query(
    `INSERT INTO ai_agent_source_set
      (id, conversation_id, run_id, owner_key_hash, subject_id, kind, items_json, source_digest, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      sourceSet.id,
      sourceSet.conversationId,
      sourceSet.runId,
      sourceSet.ownerKeyHash,
      sourceSet.subjectId,
      sourceSet.kind,
      sourceSet.serializedItems || stableJson(sourceSet.items),
      sourceSet.sourceDigest,
      sourceSet.expiresAt,
    ],
  );
}

async function insertResultSet(connection, resultSet) {
  await connection.query(
    `INSERT INTO ai_agent_result_set
      (id, handle_id, run_id, conversation_id, owner_key_hash, subject_id, goal_id, capability_id,
       entity_type, query_fingerprint, filters_json, refs_json, ordering_json, field_mask_json,
       total_count, returned_count, completeness, partial_reason, next_cursor, fresh_until)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      resultSet.id,
      resultSet.handleId,
      resultSet.runId,
      resultSet.conversationId,
      resultSet.ownerKeyHash,
      resultSet.subjectId,
      resultSet.goalId,
      resultSet.capabilityId,
      resultSet.entityType,
      resultSet.queryFingerprint,
      stableJson(resultSet.filters),
      stableJson(resultSet.refs),
      stableJson(resultSet.ordering),
      stableJson(resultSet.fieldMask),
      resultSet.totalCount,
      resultSet.returnedCount,
      resultSet.completeness,
      resultSet.partialReason,
      resultSet.nextCursor,
      resultSet.freshUntil,
    ],
  );
}

async function insertArtifactVersion(connection, artifact) {
  await connection.query(
    `INSERT INTO ai_agent_artifact_version
      (id, artifact_chain_id, conversation_id, owner_key_hash, subject_id, capability_id, version,
       parent_version_id, state, content_md, content_hash, source_set_id, output_contract, validation_report)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      artifact.id,
      artifact.artifactChainId,
      artifact.conversationId,
      artifact.ownerKeyHash,
      artifact.subjectId,
      artifact.capabilityId,
      artifact.version,
      artifact.parentVersionId,
      artifact.state,
      artifact.content,
      artifact.contentHash,
      artifact.sourceSetId,
      artifact.outputContract == null ? null : stableJson(artifact.outputContract),
      artifact.validationReport == null ? null : stableJson(artifact.validationReport),
    ],
  );
}

function prepareArtifactTransition(input = {}) {
  const id = text(input.id, 36);
  const state = ARTIFACT_STATES.has(input.state) ? input.state : null;
  const expectedStates = [
    ...new Set(
      (Array.isArray(input.expectedStates) ? input.expectedStates : []).filter((item) => ARTIFACT_STATES.has(item)),
    ),
  ];
  const contentHash = text(input.contentHash, 64);
  if (!id || !state || !expectedStates.length || !/^[a-f0-9]{64}$/i.test(contentHash)) {
    throw new AgentStateRepositoryError('AGENT_ARTIFACT_TRANSITION_INVALID', 'Agent 产物状态迁移无效。');
  }
  return Object.freeze({ id, state, expectedStates, contentHash });
}

async function applyArtifactTransition(connection, context, transition, { strict = true } = {}) {
  const [result] = await connection.query(
    `UPDATE ai_agent_artifact_version
        SET state = ?
      WHERE id = ? AND conversation_id = ? AND owner_key_hash = ? AND subject_id = ?
        AND content_hash = ? AND state IN (${placeholders(transition.expectedStates.length)})`,
    [
      transition.state,
      transition.id,
      context.conversationId,
      context.ownerKeyHash,
      context.subjectId,
      transition.contentHash,
      ...transition.expectedStates,
    ],
  );
  const applied = Number(result.affectedRows) === 1;
  if (!applied && strict) {
    throw new AgentStateRepositoryError('AGENT_ARTIFACT_CONFLICT', 'Agent 产物已变化，请基于最新版本重试。', 409);
  }
  return applied;
}

/**
 * 以 Conversation State revision 为唯一 CAS，在一个事务中提交新句柄和焦点。
 * 冲突只返回当前 revision，不覆盖赢家；调用方重新加载后再决定是否重试。
 */
export async function commitAgentConversationMutation(contextInput, input = {}, database = pool) {
  const context = createAgentPersistenceContext(contextInput);
  const expectedRevision = nonNegativeInteger(input.expectedRevision);
  const commitMode = input.commitMode === 'monotonic_mirror' ? 'monotonic_mirror' : 'cas';
  const nextState = normalizeStateSnapshot(input.state, expectedRevision);
  const sourceSets = (Array.isArray(input.sourceSets) ? input.sourceSets : []).map((item) =>
    prepareAgentSourceSet(item, context),
  );
  const resultSets = (Array.isArray(input.resultSets) ? input.resultSets : []).map((item) =>
    prepareAgentResultSet(item, context),
  );
  const artifactVersions = (Array.isArray(input.artifactVersions) ? input.artifactVersions : []).map((item) =>
    prepareAgentArtifactVersion(item, context),
  );
  const artifactTransitions = (Array.isArray(input.artifactTransitions) ? input.artifactTransitions : []).map(
    prepareArtifactTransition,
  );
  const connection = await database.getConnection();
  try {
    await connection.beginTransaction();
    await assertConversationOwner(connection, context);
    const [stateRows] = await connection.query(
      `SELECT revision FROM ai_agent_conversation_state
        WHERE conversation_id = ? AND conversation_owner_id = ? AND owner_key_hash = ?
        LIMIT 1 FOR UPDATE`,
      [context.conversationId, context.conversationOwnerId, context.ownerKeyHash],
    );
    const currentRevision = stateRows.length ? nonNegativeInteger(stateRows[0].revision) : 0;
    const conflicts =
      commitMode === 'monotonic_mirror' ? currentRevision > expectedRevision : currentRevision !== expectedRevision;
    if (conflicts) {
      await connection.rollback();
      return Object.freeze({ state: 'conflict', currentRevision });
    }
    for (const sourceSet of sourceSets) await insertSourceSet(connection, sourceSet);
    for (const resultSet of resultSets) await insertResultSet(connection, resultSet);
    for (const transition of artifactTransitions) await applyArtifactTransition(connection, context, transition);
    for (const artifact of artifactVersions) await insertArtifactVersion(connection, artifact);

    if (stateRows.length) {
      const writeRevisionGuard = commitMode === 'monotonic_mirror' ? currentRevision : expectedRevision;
      const [updated] = await connection.query(
        `UPDATE ai_agent_conversation_state
            SET revision = ?, topic_epoch = ?, discourse_state = ?, active_source_set_ids = ?,
                active_result_set_ids = ?, latest_artifact_version_id = ?, last_run_id = ?
          WHERE conversation_id = ? AND conversation_owner_id = ? AND owner_key_hash = ? AND revision = ?`,
        [
          nextState.revision,
          nextState.topicEpoch,
          stableJson(nextState.discourseState),
          stableJson(nextState.activeSourceSetIds),
          stableJson(nextState.activeResultSetIds),
          nextState.latestArtifactVersionId,
          nextState.lastRunId,
          context.conversationId,
          context.conversationOwnerId,
          context.ownerKeyHash,
          writeRevisionGuard,
        ],
      );
      if (Number(updated.affectedRows) !== 1) {
        await connection.rollback();
        return Object.freeze({ state: 'conflict', currentRevision });
      }
    } else {
      await connection.query(
        `INSERT INTO ai_agent_conversation_state
          (conversation_id, conversation_owner_id, owner_key_hash, revision, topic_epoch,
           discourse_state, active_source_set_ids, active_result_set_ids,
           latest_artifact_version_id, last_run_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          context.conversationId,
          context.conversationOwnerId,
          context.ownerKeyHash,
          nextState.revision,
          nextState.topicEpoch,
          stableJson(nextState.discourseState),
          stableJson(nextState.activeSourceSetIds),
          stableJson(nextState.activeResultSetIds),
          nextState.latestArtifactVersionId,
          nextState.lastRunId,
        ],
      );
    }
    await connection.commit();
    return Object.freeze({
      state: 'committed',
      revision: nextState.revision,
      sourceSetIds: Object.freeze(sourceSets.map((item) => item.id)),
      resultSetIds: Object.freeze(resultSets.map((item) => item.id)),
      artifactVersionIds: Object.freeze(artifactVersions.map((item) => item.id)),
    });
  } catch (error) {
    try {
      await connection.rollback();
    } catch {
      // 原始错误更有诊断价值；回滚失败不应覆盖它。
    }
    throw error;
  } finally {
    connection.release();
  }
}

export async function createAgentRun(contextInput, input = {}, database = pool) {
  const context = createAgentPersistenceContext(contextInput);
  const id = text(input.id, 64) || crypto.randomUUID();
  const status = RUN_STATUSES.has(input.status) ? input.status : 'accepted';
  const connection = await database.getConnection();
  try {
    await connection.beginTransaction();
    await assertConversationOwner(connection, context);
    await connection.query(
      `INSERT INTO ai_agent_run
        (id, conversation_id, actor_id, actor_role, subject_id, owner_key_hash, base_revision,
         runtime_version, semantic_digest, execution_digest, turn_spec, goal_states,
         execution_receipt, status, error_code)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        context.conversationId,
        context.actorId,
        context.actorRole,
        context.subjectId,
        context.ownerKeyHash,
        nonNegativeInteger(input.baseRevision),
        context.runtimeVersion,
        text(input.semanticDigest, 64) || null,
        text(input.executionDigest, 64) || null,
        input.turnSpec == null ? null : stableJson(input.turnSpec),
        stableJson(Array.isArray(input.goalStates) ? input.goalStates : []),
        input.executionReceipt == null ? null : stableJson(input.executionReceipt),
        status,
        text(input.errorCode, 128) || null,
      ],
    );
    await connection.commit();
    return Object.freeze({ id, status });
  } catch (error) {
    try {
      await connection.rollback();
    } catch {
      // ignore rollback failure
    }
    throw error;
  } finally {
    connection.release();
  }
}

export async function settleAgentRun(contextInput, runId, input = {}, database = pool) {
  const context = createAgentPersistenceContext(contextInput);
  const status = RUN_STATUSES.has(input.status) ? input.status : 'failed';
  const [result] = await database.query(
    `UPDATE ai_agent_run
        SET semantic_digest = COALESCE(?, semantic_digest),
            execution_digest = COALESCE(?, execution_digest),
            turn_spec = COALESCE(?, turn_spec),
            goal_states = ?, execution_receipt = ?, status = ?, error_code = ?, finished_at = CURRENT_TIMESTAMP
      WHERE id = ? AND conversation_id = ? AND actor_id = ? AND subject_id = ? AND owner_key_hash = ?`,
    [
      text(input.semanticDigest, 64) || null,
      text(input.executionDigest, 64) || null,
      input.turnSpec == null ? null : stableJson(input.turnSpec),
      stableJson(Array.isArray(input.goalStates) ? input.goalStates : []),
      input.executionReceipt == null ? null : stableJson(input.executionReceipt),
      status,
      text(input.errorCode, 128) || null,
      text(runId, 64),
      context.conversationId,
      context.actorId,
      context.subjectId,
      context.ownerKeyHash,
    ],
  );
  return Number(result.affectedRows) === 1;
}

export async function transitionAgentArtifactVersion(contextInput, artifactId, input = {}, database = pool) {
  const context = createAgentPersistenceContext(contextInput);
  const transition = prepareArtifactTransition({ id: artifactId, ...input });
  return applyArtifactTransition(database, context, transition, { strict: false });
}

export const __testing = Object.freeze({
  hash,
  mapArtifactVersion,
  mapResultSet,
  mapSourceSet,
  normalizeRefs,
  normalizeStateSnapshot,
  prepareArtifactTransition,
  stableJson,
});
