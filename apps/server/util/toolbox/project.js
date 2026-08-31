import crypto from 'node:crypto';
import pool from '../../db/index.js';
import { toolboxError } from './errors.js';
import {
  TOOLBOX_PROJECT_STATUSES,
  TOOLBOX_PROJECT_CONFLICT_CODES,
  createEmptyProjectContent,
  normalizeProjectCreateRequest,
  normalizeProjectRestoreRequest,
  normalizeProjectRevisionRequest,
  normalizeProjectUpdateRequest,
  normalizeProductionProjectType,
  validateProductionProjectContent,
} from './projectContentSchema.js';

const OPEN_TOUCH_INTERVAL_MINUTES = 5;
const PROJECT_CURSOR_VERSION = 1;
const MEBIBYTE = 1024 * 1024;

function positiveStorageLimit(value, fallback) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0 ? number : fallback;
}

export const TOOLBOX_PROJECT_STORAGE_LIMITS = Object.freeze({
  projectBytes: positiveStorageLimit(process.env.TOOLBOX_PROJECT_REVISION_BYTES_QUOTA, 512 * MEBIBYTE),
  accountBytes: positiveStorageLimit(process.env.TOOLBOX_ACCOUNT_REVISION_BYTES_QUOTA, 2 * 1024 * MEBIBYTE),
});

export const TOOLBOX_PROJECT_REVISION_RETENTION_POLICY = Object.freeze({
  mode: 'immutable-quota-bound',
  automaticDeletion: false,
  deletionBoundary: 'account-deletion',
});

function normalizedStorageLimits(value = TOOLBOX_PROJECT_STORAGE_LIMITS) {
  return {
    projectBytes: positiveStorageLimit(value?.projectBytes, TOOLBOX_PROJECT_STORAGE_LIMITS.projectBytes),
    accountBytes: positiveStorageLimit(value?.accountBytes, TOOLBOX_PROJECT_STORAGE_LIMITS.accountBytes),
  };
}

function encodeCursor(value) {
  return Buffer.from(JSON.stringify({ version: PROJECT_CURSOR_VERSION, ...value }), 'utf8').toString('base64url');
}

function decodeCursor(value, kind) {
  if (value === undefined || value === null || value === '') return null;
  const encoded = String(value);
  if (encoded.length > 512) throw toolboxError('TOOLBOX_PROJECT_CURSOR_INVALID', '分页游标格式无效', 400);
  let parsed;
  try {
    parsed = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
  } catch {
    throw toolboxError('TOOLBOX_PROJECT_CURSOR_INVALID', '分页游标格式无效', 400);
  }
  if (!parsed || parsed.version !== PROJECT_CURSOR_VERSION) {
    throw toolboxError('TOOLBOX_PROJECT_CURSOR_INVALID', '分页游标格式无效', 400);
  }
  if (kind === 'project') {
    const updatedAt = new Date(parsed.updatedAt);
    const id = String(parsed.id || '');
    if (Number.isNaN(updatedAt.getTime()) || !id || id.length > 64) {
      throw toolboxError('TOOLBOX_PROJECT_CURSOR_INVALID', '分页游标格式无效', 400);
    }
    return { updatedAt, id };
  }
  const revision = Number(parsed.revision);
  if (!Number.isSafeInteger(revision) || revision < 1) {
    throw toolboxError('TOOLBOX_PROJECT_CURSOR_INVALID', '分页游标格式无效', 400);
  }
  return { revision };
}

function requiredUserId(value) {
  const userId = String(value || '').trim();
  if (!userId) throw toolboxError('TOOLBOX_USER_REQUIRED', '缺少用户身份', 401);
  return userId;
}

function requiredId(value, field = 'projectId') {
  const id = String(value || '').trim();
  if (!id || id.length > 64) throw toolboxError('TOOLBOX_PROJECT_FIELD_INVALID', `${field}格式无效`, 400, { field });
  return id;
}

function expectedPositiveInteger(value, field) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 1) {
    throw toolboxError('TOOLBOX_PROJECT_FIELD_INVALID', `${field}格式无效`, 400, { field });
  }
  return number;
}

function iso(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toISOString();
}

function parseJson(value, fallback = null) {
  if (value == null) return fallback;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function digest(value) {
  return crypto.createHash('sha256').update(stableStringify(value)).digest('hex');
}

function projectSummary(row) {
  return {
    id: String(row.id),
    projectType: String(row.project_type),
    title: String(row.title || ''),
    metadata: parseJson(row.metadata_json, {}),
    status: String(row.status || 'active'),
    currentRevision: Number(row.current_revision || 1),
    currentRevisionId: String(row.current_revision_id),
    version: Number(row.version || 1),
    lockVersion: Number(row.version || 1),
    lastOpenedAt: iso(row.last_opened_at),
    createdAt: iso(row.create_time),
    updatedAt: iso(row.updated_at),
    trashedAt: iso(row.trashed_at),
  };
}

function revisionSummary(row, projectType = row.project_type) {
  return {
    id: String(row.id),
    revisionNo: Number(row.revision_no),
    revision: Number(row.revision_no),
    projectType: String(projectType || ''),
    parentRevisionId: row.parent_revision_id ? String(row.parent_revision_id) : null,
    restoredFromRevisionId: row.restored_from_revision_id ? String(row.restored_from_revision_id) : null,
    sourceRevisionId: row.restored_from_revision_id ? String(row.restored_from_revision_id) : null,
    changeKind: String(row.change_kind),
    label: row.label ? String(row.label) : null,
    contentHash: String(row.content_hash || ''),
    createdAt: iso(row.create_time),
  };
}

function mapResource(row) {
  return {
    id: Number(row.id),
    type: String(row.resource_type),
    resourceId: String(row.resource_id),
    resourceVersion: String(row.resource_version || ''),
    title: String(row.resource_title || ''),
    role: String(row.role || 'source'),
    createdAt: iso(row.create_time),
  };
}

function projectRevisionDto(project, revision) {
  return {
    id: String(revision.id),
    projectId: String(project.id),
    projectType: String(project.project_type),
    revision: Number(revision.revision_no),
    revisionNo: Number(revision.revision_no),
    changeKind: String(revision.change_kind),
    label: revision.label ? String(revision.label) : null,
    content: parseJson(revision.content_json, null),
    sourceRevisionId: revision.restored_from_revision_id ? String(revision.restored_from_revision_id) : null,
    createdAt: iso(revision.create_time),
  };
}

function projectDetail(project, revision, resources = []) {
  return {
    project: projectSummary(project),
    revision: projectRevisionDto(project, revision),
    resources: resources.map(mapResource),
  };
}

function conflict(project, code = TOOLBOX_PROJECT_CONFLICT_CODES.VERSION) {
  throw toolboxError(code, '项目已在其他位置更新，请刷新后重试', 409, {
    currentRevision: Number(project.current_revision || 1),
    currentVersion: Number(project.version || 1),
    currentLockVersion: Number(project.version || 1),
    project: projectSummary(project),
  });
}

async function withTransaction(database, work) {
  if (typeof database.getConnection !== 'function') return work(database);
  const connection = await database.getConnection();
  try {
    await connection.beginTransaction();
    const result = await work(connection);
    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function requireProject(database, userId, projectId, lock = false) {
  const suffix = lock ? ' FOR UPDATE' : '';
  const [rows] = await database.query(`SELECT * FROM toolbox_projects WHERE id = ? AND user_id = ? LIMIT 1${suffix}`, [
    requiredId(projectId),
    userId,
  ]);
  if (!rows[0]) throw toolboxError('TOOLBOX_PROJECT_NOT_FOUND', '项目不存在或已不可访问', 404);
  return rows[0];
}

async function lockStorageOwner(database, userId) {
  await database.query('SELECT id FROM user WHERE id = ? LIMIT 1 FOR UPDATE', [userId]);
}

async function assertRevisionStorageCapacity(database, { userId, projectId, incomingBytes, storageLimits }) {
  const limits = normalizedStorageLimits(storageLimits);
  const [[usage = {}]] = await database.query(
    `SELECT COALESCE(SUM(content_bytes), 0) AS account_bytes,
            COALESCE(SUM(CASE WHEN project_id = ? THEN content_bytes ELSE 0 END), 0) AS project_bytes
       FROM toolbox_project_revisions
      WHERE user_id = ?`,
    [projectId, userId],
  );
  const accountBytes = Number(usage.account_bytes || 0);
  const projectBytes = Number(usage.project_bytes || 0);
  const scope =
    projectBytes + incomingBytes > limits.projectBytes
      ? 'project'
      : accountBytes + incomingBytes > limits.accountBytes
        ? 'account'
        : null;
  if (!scope) return;
  const quotaBytes = scope === 'project' ? limits.projectBytes : limits.accountBytes;
  const usedBytes = scope === 'project' ? projectBytes : accountBytes;
  throw toolboxError('TOOLBOX_PROJECT_STORAGE_QUOTA_EXCEEDED', '项目版本存储空间不足，本次修改未写入服务端', 413, {
    scope,
    quotaBytes,
    usedBytes,
    incomingBytes,
    retentionPolicy: TOOLBOX_PROJECT_REVISION_RETENTION_POLICY.mode,
  });
}

async function currentRevision(database, project) {
  const [rows] = await database.query(
    `SELECT * FROM toolbox_project_revisions WHERE id = ? AND project_id = ? AND user_id = ? LIMIT 1`,
    [project.current_revision_id, project.id, project.user_id],
  );
  if (!rows[0]) throw toolboxError('TOOLBOX_PROJECT_REVISION_NOT_FOUND', '项目当前修订不存在', 500);
  return rows[0];
}

async function detailFor(database, project, selectedRevision = null) {
  const [revision, [resourceRows]] = await Promise.all([
    selectedRevision ? Promise.resolve(selectedRevision) : currentRevision(database, project),
    database.query(`SELECT * FROM toolbox_project_resources WHERE project_id = ? AND user_id = ? ORDER BY id ASC`, [
      project.id,
      project.user_id,
    ]),
  ]);
  return projectDetail(project, revision, resourceRows);
}

async function replayProjectRevisionRequest(database, { userId, project, requestId, requestDigest }) {
  const [receiptRows] = await database.query(
    `SELECT project_id, request_digest, result_revision_id, result_revision_no
       FROM toolbox_project_revision_requests
      WHERE user_id = ? AND client_request_id = ?
      LIMIT 1`,
    [userId, requestId],
  );
  const receipt = receiptRows[0];
  if (receipt) {
    if (String(receipt.project_id) !== String(project.id) || receipt.request_digest !== requestDigest) {
      throw toolboxError('TOOLBOX_PROJECT_IDEMPOTENCY_KEY_REUSED', 'clientRequestId已用于不同的修订请求', 409);
    }
    const [resultRows] = await database.query(
      `SELECT *
         FROM toolbox_project_revisions
        WHERE id = ? AND project_id = ? AND user_id = ?
        LIMIT 1`,
      [receipt.result_revision_id, project.id, userId],
    );
    const resultRevision = resultRows[0];
    if (!resultRevision || Number(resultRevision.revision_no) !== Number(receipt.result_revision_no)) {
      throw toolboxError('TOOLBOX_PROJECT_IDEMPOTENCY_RECEIPT_INVALID', '修订请求收据指向的结果不存在', 500);
    }
    if (
      String(project.current_revision_id) !== String(resultRevision.id) ||
      Number(project.current_revision) !== Number(resultRevision.revision_no)
    ) {
      conflict(project, TOOLBOX_PROJECT_CONFLICT_CODES.REVISION);
    }
    return detailFor(database, project, resultRevision);
  }

  // 兼容收据表启用前已经落库的修订；这些请求仍须阻止 key 被重新解释。
  const [revisionRows] = await database.query(
    `SELECT *
       FROM toolbox_project_revisions
      WHERE user_id = ? AND client_request_id = ?
      LIMIT 1`,
    [userId, requestId],
  );
  const revision = revisionRows[0];
  if (!revision) return null;
  if (String(revision.project_id) !== String(project.id) || revision.request_digest !== requestDigest) {
    throw toolboxError('TOOLBOX_PROJECT_IDEMPOTENCY_KEY_REUSED', 'clientRequestId已用于不同的修订请求', 409);
  }
  if (
    String(project.current_revision_id) !== String(revision.id) ||
    Number(project.current_revision) !== Number(revision.revision_no)
  ) {
    conflict(project, TOOLBOX_PROJECT_CONFLICT_CODES.REVISION);
  }
  return detailFor(database, project, revision);
}

async function recordProjectRevisionRequest(
  database,
  { userId, projectId, requestId, requestDigest, resultRevisionId, resultRevisionNo, outcome },
) {
  await database.query(
    `INSERT INTO toolbox_project_revision_requests
      (id, user_id, project_id, client_request_id, request_digest, result_revision_id,
       result_revision_no, outcome, create_time)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      crypto.randomUUID(),
      userId,
      projectId,
      requestId,
      requestDigest,
      resultRevisionId,
      resultRevisionNo,
      outcome,
      new Date(),
    ],
  );
}

export async function listToolboxProjects({ userId, type, status, limit = 30, cursor, database = pool } = {}) {
  const ownerId = requiredUserId(userId);
  const params = [ownerId];
  const filters = [];
  if (type) {
    filters.push('project_type = ?');
    params.push(normalizeProductionProjectType(type));
  }
  if (status) {
    const normalized = String(status);
    if (!TOOLBOX_PROJECT_STATUSES.includes(normalized)) {
      throw toolboxError('TOOLBOX_PROJECT_FIELD_INVALID', 'status不受支持', 400, { field: 'status' });
    }
    filters.push('status = ?');
    params.push(normalized);
  } else {
    filters.push("status = 'active'");
  }
  const position = decodeCursor(cursor, 'project');
  if (position) {
    filters.push('(updated_at < ? OR (updated_at = ? AND id < ?))');
    params.push(position.updatedAt, position.updatedAt, position.id);
  }
  const pageSize = Math.max(1, Math.min(50, Number.parseInt(limit, 10) || 30));
  params.push(pageSize + 1);
  const [rows] = await database.query(
    `SELECT * FROM toolbox_projects WHERE user_id = ? AND ${filters.join(' AND ')} ORDER BY updated_at DESC, id DESC LIMIT ?`,
    params,
  );
  const hasMore = rows.length > pageSize;
  const visibleRows = hasMore ? rows.slice(0, pageSize) : rows;
  const last = visibleRows.at(-1);
  return {
    items: visibleRows.map(projectSummary),
    nextCursor: hasMore && last ? encodeCursor({ updatedAt: iso(last.updated_at), id: String(last.id) }) : null,
  };
}

export async function listToolboxHomeProjects({ userId, database = pool } = {}) {
  const ownerId = requiredUserId(userId);
  const [rows] = await database.query(
    `SELECT * FROM toolbox_projects
      WHERE user_id = ? AND status <> 'trashed'
      ORDER BY COALESCE(last_opened_at, updated_at) DESC, updated_at DESC
      LIMIT 12`,
    [ownerId],
  );
  const summaries = rows.map(projectSummary);
  const continuing = summaries.filter((item) => item.status === 'active').slice(0, 3);
  const continuingIds = new Set(continuing.map((item) => item.id));
  return {
    continue: continuing,
    recent: summaries.filter((item) => !continuingIds.has(item.id)).slice(0, 6),
  };
}

export async function getToolboxProject({ userId, projectId, database = pool } = {}) {
  const ownerId = requiredUserId(userId);
  const project = await requireProject(database, ownerId, projectId);
  return detailFor(database, project);
}

export async function createToolboxProject({
  userId,
  input = {},
  database = pool,
  storageLimits = TOOLBOX_PROJECT_STORAGE_LIMITS,
} = {}) {
  const ownerId = requiredUserId(userId);
  const requestedType = normalizeProductionProjectType(input.projectType ?? input.type);
  const request = normalizeProjectCreateRequest({
    clientRequestId: input.clientRequestId,
    projectType: requestedType,
    title:
      input.title ||
      (requestedType === 'presentation' ? '未命名演示' : requestedType === 'workbook' ? '未命名工作簿' : '未命名文档'),
    metadata: input.metadata,
    content: input.content ?? createEmptyProjectContent(requestedType),
    changeKind: input.changeKind,
  });
  const { projectType: type, title, metadata, clientRequestId: requestId, changeKind } = request;
  const validated = validateProductionProjectContent(type, request.content);
  const requestDigest = digest({ type, title, metadata, contentHash: validated.contentHash, changeKind });

  try {
    return await withTransaction(database, async (connection) => {
      await lockStorageOwner(connection, ownerId);
      const [existingRows] = await connection.query(
        `SELECT * FROM toolbox_projects WHERE user_id = ? AND create_request_id = ? LIMIT 1 FOR UPDATE`,
        [ownerId, requestId],
      );
      if (existingRows[0]) {
        if (existingRows[0].create_digest !== requestDigest) {
          throw toolboxError('TOOLBOX_PROJECT_IDEMPOTENCY_KEY_REUSED', 'clientRequestId已用于不同的创建请求', 409);
        }
        return detailFor(connection, existingRows[0]);
      }

      const projectId = crypto.randomUUID();
      const revisionId = crypto.randomUUID();
      const now = new Date();
      await assertRevisionStorageCapacity(connection, {
        userId: ownerId,
        projectId,
        incomingBytes: validated.contentBytes,
        storageLimits,
      });
      const project = {
        id: projectId,
        user_id: ownerId,
        project_type: type,
        title,
        metadata_json: metadata,
        status: 'active',
        version: 1,
        current_revision: 1,
        current_revision_id: revisionId,
        create_request_id: requestId,
        create_digest: requestDigest,
        last_opened_at: null,
        trashed_at: null,
        create_time: now,
        updated_at: now,
      };
      const revision = {
        id: revisionId,
        project_id: projectId,
        user_id: ownerId,
        revision_no: 1,
        parent_revision_id: null,
        restored_from_revision_id: null,
        schema_version: validated.schemaVersion,
        content_json: validated.serialized,
        content_bytes: validated.contentBytes,
        content_hash: validated.contentHash,
        change_kind: changeKind,
        label: null,
        client_request_id: requestId,
        request_digest: requestDigest,
        create_time: now,
      };
      await connection.query(
        `INSERT INTO toolbox_projects
         (id, user_id, project_type, title, metadata_json, status, version, current_revision,
          current_revision_id, create_request_id, create_digest, create_time, updated_at)
       VALUES (?, ?, ?, ?, ?, 'active', 1, 1, ?, ?, ?, ?, ?)`,
        [
          projectId,
          ownerId,
          type,
          title,
          metadata ? JSON.stringify(metadata) : null,
          revisionId,
          requestId,
          requestDigest,
          now,
          now,
        ],
      );
      await connection.query(
        `INSERT INTO toolbox_project_revisions
         (id, project_id, user_id, revision_no, schema_version, content_json, content_bytes, content_hash,
          change_kind, client_request_id, request_digest, create_time)
       VALUES (?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          revisionId,
          projectId,
          ownerId,
          validated.schemaVersion,
          validated.serialized,
          validated.contentBytes,
          validated.contentHash,
          changeKind,
          requestId,
          requestDigest,
          now,
        ],
      );
      return projectDetail(project, revision, []);
    });
  } catch (error) {
    if (error?.code !== 'ER_DUP_ENTRY') throw error;
    const [rows] = await database.query(
      `SELECT * FROM toolbox_projects WHERE user_id = ? AND create_request_id = ? LIMIT 1`,
      [ownerId, requestId],
    );
    if (!rows[0] || rows[0].create_digest !== requestDigest) {
      throw toolboxError('TOOLBOX_PROJECT_IDEMPOTENCY_KEY_REUSED', 'clientRequestId已用于不同的创建请求', 409);
    }
    return detailFor(database, rows[0]);
  }
}

export async function updateToolboxProject({ userId, projectId, input = {}, database = pool } = {}) {
  const ownerId = requiredUserId(userId);
  const request = normalizeProjectUpdateRequest({
    expectedVersion: input.expectedVersion ?? input.expectedLockVersion,
    title: input.title,
    metadata: input.metadata,
    status: input.status,
  });
  return withTransaction(database, async (connection) => {
    const project = await requireProject(connection, ownerId, projectId, true);
    if (Number(project.version) !== request.expectedVersion) conflict(project);
    const { title, status, metadata } = request;
    const trashedAt = status === 'trashed' ? new Date() : status !== undefined ? null : undefined;
    await connection.query(
      `UPDATE toolbox_projects
          SET title = COALESCE(?, title), metadata_json = COALESCE(?, metadata_json),
              status = COALESCE(?, status), trashed_at = ?, version = version + 1
        WHERE id = ? AND user_id = ?`,
      [
        title ?? null,
        metadata === undefined ? null : JSON.stringify(metadata),
        status ?? null,
        trashedAt === undefined ? project.trashed_at : trashedAt,
        project.id,
        ownerId,
      ],
    );
    project.title = title ?? project.title;
    project.metadata_json = metadata ?? project.metadata_json;
    project.status = status ?? project.status;
    project.trashed_at = trashedAt === undefined ? project.trashed_at : trashedAt;
    project.version = Number(project.version) + 1;
    project.updated_at = new Date();
    return projectSummary(project);
  });
}

export async function openToolboxProject({ userId, projectId, database = pool } = {}) {
  const ownerId = requiredUserId(userId);
  const id = requiredId(projectId);
  await database.query(
    `UPDATE toolbox_projects
        SET last_opened_at = CURRENT_TIMESTAMP, updated_at = updated_at
      WHERE id = ? AND user_id = ? AND status <> 'trashed'
        AND (last_opened_at IS NULL OR last_opened_at < DATE_SUB(CURRENT_TIMESTAMP, INTERVAL ${OPEN_TOUCH_INTERVAL_MINUTES} MINUTE))`,
    [id, ownerId],
  );
  const project = await requireProject(database, ownerId, id);
  if (project.status === 'trashed') throw toolboxError('TOOLBOX_PROJECT_NOT_FOUND', '项目不存在或已不可访问', 404);
  return projectSummary(project);
}

export async function listToolboxProjectRevisions({ userId, projectId, limit = 50, cursor, database = pool } = {}) {
  const ownerId = requiredUserId(userId);
  const project = await requireProject(database, ownerId, projectId);
  const pageSize = Math.max(1, Math.min(100, Number.parseInt(limit, 10) || 50));
  const position = decodeCursor(cursor, 'revision');
  const cursorFilter = position ? ' AND revision_no < ?' : '';
  const params = [project.id, ownerId];
  if (position) params.push(position.revision);
  params.push(pageSize + 1);
  const [rows] = await database.query(
    `SELECT id, revision_no, parent_revision_id, restored_from_revision_id, change_kind, label, content_hash, create_time
       FROM toolbox_project_revisions
      WHERE project_id = ? AND user_id = ?
      ${cursorFilter}
      ORDER BY revision_no DESC LIMIT ?`,
    params,
  );
  const hasMore = rows.length > pageSize;
  const visibleRows = hasMore ? rows.slice(0, pageSize) : rows;
  const last = visibleRows.at(-1);
  return {
    items: visibleRows.map((row) => revisionSummary(row, project.project_type)),
    nextCursor: hasMore && last ? encodeCursor({ revision: Number(last.revision_no) }) : null,
  };
}

export async function createToolboxProjectRevision({
  userId,
  projectId,
  input = {},
  database = pool,
  storageLimits = TOOLBOX_PROJECT_STORAGE_LIMITS,
} = {}) {
  const ownerId = requiredUserId(userId);
  const id = requiredId(projectId);

  return withTransaction(database, async (connection) => {
    await lockStorageOwner(connection, ownerId);
    const project = await requireProject(connection, ownerId, id, true);
    const request = normalizeProjectRevisionRequest(
      {
        clientRequestId: input.clientRequestId,
        expectedVersion: input.expectedVersion,
        expectedRevision: input.expectedRevision,
        changeKind: input.changeKind,
        label: input.label ?? input.name,
        content: input.content,
      },
      project.project_type,
    );
    const { clientRequestId: requestId, expectedVersion, expectedRevision, changeKind, label } = request;
    const validated = validateProductionProjectContent(project.project_type, request.content);
    const requestDigest = digest({
      projectId: id,
      expectedVersion,
      expectedRevision,
      changeKind,
      label,
      contentHash: validated.contentHash,
    });
    const replay = await replayProjectRevisionRequest(connection, {
      userId: ownerId,
      project,
      requestId,
      requestDigest,
    });
    if (replay) return replay;
    if (project.status !== 'active') throw toolboxError('TOOLBOX_PROJECT_ARCHIVED', '已归档项目不能继续修改', 409);
    if (Number(project.version) !== expectedVersion) conflict(project, TOOLBOX_PROJECT_CONFLICT_CODES.VERSION);
    if (Number(project.current_revision) !== expectedRevision)
      conflict(project, TOOLBOX_PROJECT_CONFLICT_CODES.REVISION);
    const head = await currentRevision(connection, project);
    if (changeKind === 'autosave' && label === null && head.content_hash === validated.contentHash) {
      await recordProjectRevisionRequest(connection, {
        userId: ownerId,
        projectId: id,
        requestId,
        requestDigest,
        resultRevisionId: head.id,
        resultRevisionNo: Number(head.revision_no),
        outcome: 'noop',
      });
      return detailFor(connection, project, head);
    }
    await assertRevisionStorageCapacity(connection, {
      userId: ownerId,
      projectId: id,
      incomingBytes: validated.contentBytes,
      storageLimits,
    });
    const revisionId = crypto.randomUUID();
    const revisionNo = expectedRevision + 1;
    const now = new Date();
    await connection.query(
      `INSERT INTO toolbox_project_revisions
         (id, project_id, user_id, revision_no, parent_revision_id, schema_version, content_json,
          content_bytes, content_hash, change_kind, label, client_request_id, request_digest, create_time)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        revisionId,
        id,
        ownerId,
        revisionNo,
        project.current_revision_id,
        validated.schemaVersion,
        validated.serialized,
        validated.contentBytes,
        validated.contentHash,
        changeKind,
        label,
        requestId,
        requestDigest,
        now,
      ],
    );
    await recordProjectRevisionRequest(connection, {
      userId: ownerId,
      projectId: id,
      requestId,
      requestDigest,
      resultRevisionId: revisionId,
      resultRevisionNo: revisionNo,
      outcome: 'revision',
    });
    await connection.query(
      `UPDATE toolbox_projects
          SET current_revision = ?, current_revision_id = ?, version = version + 1,
              updated_at = ?
        WHERE id = ? AND user_id = ?`,
      [revisionNo, revisionId, now, id, ownerId],
    );
    project.current_revision = revisionNo;
    project.current_revision_id = revisionId;
    project.version = Number(project.version) + 1;
    project.updated_at = now;
    return detailFor(connection, project, {
      id: revisionId,
      project_id: id,
      revision_no: revisionNo,
      change_kind: changeKind,
      label,
      content_json: validated.serialized,
      create_time: now,
    });
  });
}

export async function restoreToolboxProjectRevision({
  userId,
  projectId,
  revisionNo,
  input = {},
  database = pool,
  storageLimits = TOOLBOX_PROJECT_STORAGE_LIMITS,
} = {}) {
  const ownerId = requiredUserId(userId);
  const id = requiredId(projectId);
  const targetRevisionNo = expectedPositiveInteger(revisionNo, 'revisionNo');
  return withTransaction(database, async (connection) => {
    await lockStorageOwner(connection, ownerId);
    const project = await requireProject(connection, ownerId, id, true);
    const request = normalizeProjectRestoreRequest({
      clientRequestId: input.clientRequestId,
      expectedVersion: input.expectedVersion,
      expectedRevision: input.expectedRevision,
      sourceRevisionId: input.sourceRevisionId,
    });
    const [targetRows] = await connection.query(
      `SELECT * FROM toolbox_project_revisions WHERE project_id = ? AND user_id = ? AND revision_no = ? LIMIT 1`,
      [id, ownerId, targetRevisionNo],
    );
    const target = targetRows[0];
    if (!target) throw toolboxError('TOOLBOX_PROJECT_REVISION_NOT_FOUND', '要恢复的修订不存在', 404);
    if (String(request.sourceRevisionId) !== String(target.id)) {
      throw toolboxError('TOOLBOX_PROJECT_FIELD_INVALID', 'sourceRevisionId与路由修订不一致', 400, {
        field: 'sourceRevisionId',
      });
    }
    const { clientRequestId: requestId, expectedVersion, expectedRevision } = request;
    const requestDigest = digest({
      projectId: id,
      targetRevisionNo,
      expectedVersion,
      expectedRevision,
      sourceRevisionId: target.id,
      changeKind: 'restore',
    });
    const replay = await replayProjectRevisionRequest(connection, {
      userId: ownerId,
      project,
      requestId,
      requestDigest,
    });
    if (replay) return replay;
    if (project.status !== 'active') throw toolboxError('TOOLBOX_PROJECT_ARCHIVED', '非活跃项目不能恢复修订', 409);
    if (Number(project.version) !== expectedVersion) conflict(project, TOOLBOX_PROJECT_CONFLICT_CODES.VERSION);
    if (Number(project.current_revision) !== expectedRevision)
      conflict(project, TOOLBOX_PROJECT_CONFLICT_CODES.REVISION);
    const revisionId = crypto.randomUUID();
    const nextRevision = expectedRevision + 1;
    const now = new Date();
    const targetContentJson =
      typeof target.content_json === 'string' ? target.content_json : JSON.stringify(target.content_json);
    const targetContentBytes = Number(target.content_bytes) || Buffer.byteLength(targetContentJson, 'utf8');
    await assertRevisionStorageCapacity(connection, {
      userId: ownerId,
      projectId: id,
      incomingBytes: targetContentBytes,
      storageLimits,
    });
    await connection.query(
      `INSERT INTO toolbox_project_revisions
         (id, project_id, user_id, revision_no, parent_revision_id, restored_from_revision_id,
          schema_version, content_json, content_bytes, content_hash, change_kind, client_request_id, request_digest, create_time)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'restore', ?, ?, ?)`,
      [
        revisionId,
        id,
        ownerId,
        nextRevision,
        project.current_revision_id,
        target.id,
        target.schema_version,
        targetContentJson,
        targetContentBytes,
        target.content_hash,
        requestId,
        requestDigest,
        now,
      ],
    );
    await recordProjectRevisionRequest(connection, {
      userId: ownerId,
      projectId: id,
      requestId,
      requestDigest,
      resultRevisionId: revisionId,
      resultRevisionNo: nextRevision,
      outcome: 'restore',
    });
    await connection.query(
      `UPDATE toolbox_projects SET current_revision = ?, current_revision_id = ?, version = version + 1,
          updated_at = ?
        WHERE id = ? AND user_id = ?`,
      [nextRevision, revisionId, now, id, ownerId],
    );
    project.current_revision = nextRevision;
    project.current_revision_id = revisionId;
    project.version = Number(project.version) + 1;
    project.updated_at = now;
    return detailFor(connection, project, {
      id: revisionId,
      project_id: id,
      revision_no: nextRevision,
      restored_from_revision_id: target.id,
      change_kind: 'restore',
      label: null,
      content_json: targetContentJson,
      create_time: now,
    });
  });
}

export const toolboxProjectInternals = Object.freeze({ projectSummary, revisionSummary, digest, conflict });
