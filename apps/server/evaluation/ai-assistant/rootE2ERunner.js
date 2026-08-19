#!/usr/bin/env node
import crypto from 'node:crypto';
import { EventEmitter } from 'node:events';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { getAgentCapabilityByToolName } from '../../util/agent/capabilityRegistry.js';
import { ROOT_E2E_TOOL_CASES, rootE2EToolNames, selectRootE2ECases } from './rootE2ECases.js';

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const SERVER_ROOT = path.resolve(moduleDir, '../..');
const CLIENT_CAPABILITIES = Object.freeze(['agent_interaction_v1', 'agent_continuation_v1']);
const PROVIDERS = new Set(['deepseek', 'qwen']);
const GENERIC_FAILURE_PATTERNS = Object.freeze([
  /AI\s*没有返回可核验的语义计划/iu,
  /本轮未执行查询或修改/iu,
  /上一版草稿已过期、已处理，或原材料已不可用/iu,
  /原操作确认已过期或已经使用，请重新发起/iu,
]);
const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
);

export function parseRootE2EArgs(argv = []) {
  const options = {
    live: false,
    executeWrites: false,
    suite: 'full',
    provider: 'deepseek',
    format: 'text',
    artifactRegression: true,
    artifactRefinementRounds: 5,
    caseIds: [],
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--') continue;
    if (arg === '--live') options.live = true;
    else if (arg === '--execute-writes') options.executeWrites = true;
    else if (arg === '--no-artifact-regression') options.artifactRegression = false;
    else if (arg === '--artifact-refinement-rounds') {
      options.artifactRefinementRounds = Number(argv[++index]);
    } else if (arg === '--suite') options.suite = argv[++index] || 'full';
    else if (arg === '--provider') options.provider = argv[++index] || 'deepseek';
    else if (arg === '--format') options.format = argv[++index] || 'text';
    else if (arg === '--case') {
      options.caseIds.push(
        ...String(argv[++index] || '')
          .split(',')
          .map((item) => item.trim())
          .filter(Boolean),
      );
    } else throw new Error(`未知参数：${arg}`);
  }
  selectRootE2ECases(options.suite);
  const knownCaseIds = new Set(ROOT_E2E_TOOL_CASES.map((item) => item.id));
  const unknownCaseIds = options.caseIds.filter((id) => !knownCaseIds.has(id));
  if (unknownCaseIds.length) throw new Error(`未知用例：${unknownCaseIds.join(',')}`);
  if (!PROVIDERS.has(options.provider)) throw new Error('--provider 仅支持 deepseek 或 qwen');
  if (!['text', 'json'].includes(options.format)) throw new Error('--format 仅支持 text 或 json');
  if (
    !Number.isInteger(options.artifactRefinementRounds) ||
    options.artifactRefinementRounds < 1 ||
    options.artifactRefinementRounds > 5
  ) {
    throw new Error('--artifact-refinement-rounds 仅支持 1 到 5');
  }
  if (options.live && options.suite === 'full' && !options.executeWrites) {
    throw new Error('完整真实链路必须显式添加 --execute-writes，确认允许写入并清理专属测试夹具');
  }
  if (options.live && options.artifactRegression && !options.executeWrites) {
    throw new Error('笔记产物回归会确认执行专属测试笔记，必须显式添加 --execute-writes');
  }
  return options;
}

export function validateRootE2ECoverage(toolNames, cases = ROOT_E2E_TOOL_CASES) {
  const actual = [...new Set((toolNames || []).map(String))].sort();
  const covered = [...new Set(rootE2EToolNames(cases))].sort();
  const missing = actual.filter((name) => !covered.includes(name));
  const stale = covered.filter((name) => !actual.includes(name));
  const duplicateCases = rootE2EToolNames(cases).filter((name, index, names) => names.indexOf(name) !== index);
  return {
    valid: missing.length === 0 && stale.length === 0 && duplicateCases.length === 0,
    registered: actual.length,
    covered: covered.length,
    missing,
    stale,
    duplicateCases: [...new Set(duplicateCases)],
  };
}

function stableCode(error) {
  const messageCode = /^([A-Z][A-Z0-9_-]{2,79})(?::|$)/.exec(String(error?.message || '').trim())?.[1];
  return String(error?.code || messageCode || error?.name || 'ROOT_E2E_FAILED')
    .replace(/[^A-Za-z0-9_-]/g, '_')
    .slice(0, 80);
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function interpolate(template, values) {
  const result = String(template || '').replace(/\{\{([A-Z0-9_]+)\}\}/g, (_, key) => {
    const value = values[key];
    if (value == null || String(value) === '') throw new Error(`ROOT_E2E_FIXTURE_MISSING_${key}`);
    return String(value);
  });
  if (/\{\{[A-Z0-9_]+\}\}/.test(result)) throw new Error('ROOT_E2E_TEMPLATE_UNRESOLVED');
  return result;
}

function parseJsonArray(value) {
  if (Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(String(value || '[]'));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

class CapturedResponse extends EventEmitter {
  constructor() {
    super();
    this.statusCode = 200;
    this.writableEnded = false;
    this.headers = new Map();
    this.body = null;
  }

  status(code) {
    this.statusCode = Number(code) || 500;
    return this;
  }

  setHeader(name, value) {
    this.headers.set(String(name).toLowerCase(), value);
    return this;
  }

  getHeader(name) {
    return this.headers.get(String(name).toLowerCase());
  }

  send(body) {
    this.body = body;
    this.writableEnded = true;
    return this;
  }

  json(body) {
    return this.send(body);
  }
}

function makeRequest({ user, body, fingerprint }) {
  const headers = {
    'x-fingerprint': fingerprint,
    'user-agent': 'lightnote-root-e2e/1.0',
    host: 'localhost',
  };
  return {
    body,
    user,
    headers,
    ip: '127.0.0.1',
    socket: { remoteAddress: '127.0.0.1' },
    method: 'POST',
    originalUrl: '/api/chat/agent',
    suppressUserRewards: true,
    setTimeout() {},
    get(name) {
      return headers[String(name || '').toLowerCase()];
    },
  };
}

async function invokeHandler(handler, request) {
  const response = new CapturedResponse();
  await handler(request, response);
  return response;
}

async function waitForAgentLog(pool, requestId, timeoutMs = 3000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const [rows] = await pool.query(
      `SELECT selected_tools, tools_used, status, error_msg, outcome_kind, answer_chars
         FROM agent_logs WHERE request_id = ? ORDER BY created_at DESC LIMIT 1`,
      [requestId],
    );
    if (rows[0]) return rows[0];
    await delay(75);
  }
  const error = new Error('ROOT_E2E_AGENT_LOG_MISSING');
  error.code = 'ROOT_E2E_AGENT_LOG_MISSING';
  throw error;
}

function nonEmptyCard(confirmation, tool) {
  const preview = confirmation?.preview;
  const expectedCapabilityId = tool?.capabilityId || getAgentCapabilityByToolName(tool?.name)?.id || '';
  return (
    confirmation?.toolName === tool.name &&
    Boolean(expectedCapabilityId) &&
    confirmation?.capabilityId === expectedCapabilityId &&
    confirmation?.riskLevel === tool.riskLevel &&
    /^[A-Za-z0-9_-]{40,}$/.test(String(confirmation?.token || '')) &&
    Boolean(String(preview?.title || '').trim()) &&
    Boolean(String(preview?.target || '').trim()) &&
    Boolean(String(preview?.impact || '').trim()) &&
    confirmation?.args &&
    typeof confirmation.args === 'object'
  );
}

function answerFailed(answer) {
  const text = String(answer || '').trim();
  return !text || GENERIC_FAILURE_PATTERNS.some((pattern) => pattern.test(text));
}

async function countToday(pool, table, ownerColumn, ownerId = null) {
  const whereOwner = ownerId ? ` AND ${ownerColumn} = ?` : '';
  const params = ownerId ? [ownerId] : [];
  const [rows] = await pool.query(
    `SELECT COUNT(*) AS count FROM \`${table}\`
      WHERE create_time >= CURDATE() AND create_time < DATE_ADD(CURDATE(), INTERVAL 1 DAY)
        AND COALESCE(del_flag, 0) = 0${whereOwner}`,
    params,
  );
  return Number(rows[0]?.count || 0);
}

export function answerMentionsCount(answer, count) {
  const text = String(answer || '');
  if (Number(count) === 0 && /(?:没有(?:找到|新增|查询到)?|未找到|暂无)[^。；;\n]{0,18}(?:笔记|记录)/u.test(text)) {
    return true;
  }
  const escaped = String(count).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?:共|有|新增|创建|笔记|用户)[^\\d]{0,12}${escaped}(?:\\s*(?:个|位|篇|条))?`, 'u').test(text);
}

async function executeConfirmation({ handlers, user, confirmation, runId }) {
  const requestBody = {
    confirmationToken: confirmation.token,
    sessionId: confirmation.sessionId,
    clientCapabilities: [...CLIENT_CAPABILITIES],
    ...(confirmation.continuation?.token ? { continuationToken: confirmation.continuation.token } : {}),
  };
  const request = makeRequest({
    user,
    body: requestBody,
    fingerprint: `${runId}-confirm-${confirmation.id}`,
  });
  request.originalUrl = '/api/chat/agent/confirm';
  const first = await invokeHandler(handlers.confirmAgentTool, request);
  if (first.statusCode !== 200 || Number(first.body?.status) !== 200) {
    const error = new Error(first.body?.data?.code || 'ROOT_E2E_CONFIRM_FAILED');
    error.code = first.body?.data?.code || 'ROOT_E2E_CONFIRM_FAILED';
    throw error;
  }
  const firstReceipt = first.body?.data?.actionReceipt;
  if (
    firstReceipt?.status !== 'succeeded' ||
    firstReceipt?.actionId !== confirmation.id ||
    firstReceipt?.toolName !== confirmation.toolName
  ) {
    const error = new Error('ROOT_E2E_ACTION_RECEIPT_INVALID');
    error.code = 'ROOT_E2E_ACTION_RECEIPT_INVALID';
    throw error;
  }

  const replayRequest = makeRequest({
    user,
    body: requestBody,
    fingerprint: `${runId}-confirm-replay-${confirmation.id}`,
  });
  replayRequest.originalUrl = '/api/chat/agent/confirm';
  const replay = await invokeHandler(handlers.confirmAgentTool, replayRequest);
  const replayReceipt = replay.body?.data?.actionReceipt;
  if (
    replay.statusCode !== 200 ||
    Number(replay.body?.status) !== 200 ||
    replayReceipt?.actionId !== firstReceipt.actionId ||
    replayReceipt?.toolName !== firstReceipt.toolName ||
    replayReceipt?.status !== 'succeeded'
  ) {
    const error = new Error('ROOT_E2E_CONFIRM_REPLAY_INVALID');
    error.code = 'ROOT_E2E_CONFIRM_REPLAY_INVALID';
    throw error;
  }
  return { receipt: firstReceipt, replayVerified: true };
}

function placeholders(state) {
  return {
    PREFIX: state.prefix,
    NOTE_TITLE: state.noteTitle,
    NOTE_ID: state.noteId,
    TODO_TITLE: state.todoTitle,
    TODO_ID: state.todoId,
    PLAN_TITLE: state.planTitle,
    ATTACHMENT_ID: state.attachmentId,
    IMAGE_NOTE_TITLE: state.imageNoteTitle,
    FOLDER_NAME: state.folderName,
    FILE_NAME: state.fileName,
    TAG_NAME: state.tagName,
    KB_TITLE: state.kbTitle,
    BOOKMARK_URL: state.bookmarkUrl,
    BOOKMARK_TITLE: state.bookmarkTitle,
    TARGET_USER_ID: state.targetUserId,
    SUMMARY_PREFIX: state.summaryPrefix,
  };
}

async function ensureAttachmentFixture(state, services, pool) {
  if (state.attachmentId) return;
  const created = await services.createTemporaryDocumentSource({
    userId: state.user.id,
    sessionId: `${state.runId}-attachment`,
    fileName: state.fileName,
    fileType: 'image/png',
    fileSize: PNG_1X1.length,
  });
  const upload = await fetch(created.uploadUrl, {
    method: 'PUT',
    headers: created.headers,
    body: PNG_1X1,
  });
  if (!upload.ok) {
    const error = new Error('ROOT_E2E_ATTACHMENT_UPLOAD_FAILED');
    error.code = 'ROOT_E2E_ATTACHMENT_UPLOAD_FAILED';
    throw error;
  }
  state.attachmentId = created.attachment.id;
  await services.confirmTemporaryDocumentSource({ userId: state.user.id, sourceId: state.attachmentId });
  await pool.query(
    `UPDATE ai_document_sources
        SET status = 'ready', error_code = 'NO_TEXT_CONTENT', error_message = NULL,
            extracted_chars = 0, chunk_count = 0
      WHERE id = ? AND user_id = ?`,
    [state.attachmentId, state.user.id],
  );
}

async function runHook(name, state, pool) {
  if (!name) return;
  if (name === 'capture_note') {
    const [rows] = await pool.query(
      'SELECT id FROM note WHERE create_by = ? AND title = ? ORDER BY create_time DESC LIMIT 2',
      [state.user.id, state.noteTitle],
    );
    if (rows.length !== 1) throw new Error('ROOT_E2E_NOTE_FIXTURE_COUNT_INVALID');
    state.noteId = String(rows[0].id);
    return;
  }
  if (name === 'capture_todo') {
    const [rows] = await pool.query(
      'SELECT id FROM todo_items WHERE user_id = ? AND title = ? ORDER BY create_time DESC LIMIT 2',
      [state.user.id, state.todoTitle],
    );
    if (rows.length !== 1) throw new Error('ROOT_E2E_TODO_FIXTURE_COUNT_INVALID');
    state.todoId = String(rows[0].id);
    return;
  }
  if (name === 'capture_todo_plan') {
    const [rows] = await pool.query(
      'SELECT id, series_id FROM todo_items WHERE user_id = ? AND title = ? AND del_flag = 0 ORDER BY create_time DESC LIMIT 2',
      [state.user.id, state.planTitle],
    );
    if (rows.length !== 1) throw new Error('ROOT_E2E_TODO_PLAN_FIXTURE_COUNT_INVALID');
    if (rows[0].series_id != null) throw new Error('ROOT_E2E_TODO_PLAN_CREATED_MULTIPLE_TASK_SERIES');
    state.todoPlanTodoId = String(rows[0].id);
    return;
  }
  if (name === 'capture_cloud_file') {
    const [rows] = await pool.query(
      'SELECT id FROM files WHERE create_by = ? AND file_name = ? ORDER BY create_time DESC LIMIT 2',
      [state.user.id, state.fileName],
    );
    if (rows.length !== 1) throw new Error('ROOT_E2E_CLOUD_FILE_FIXTURE_COUNT_INVALID');
    state.cloudFileId = String(rows[0].id);
    return;
  }
  if (name === 'trash_note') {
    if (!state.noteId) throw new Error('ROOT_E2E_NOTE_FIXTURE_MISSING');
    const [result] = await pool.query(
      'UPDATE note SET del_flag = 1, deleted_at = NOW() WHERE id = ? AND create_by = ? AND del_flag = 0',
      [state.noteId, state.user.id],
    );
    if (Number(result.affectedRows || 0) !== 1) throw new Error('ROOT_E2E_NOTE_TRASH_FAILED');
    return;
  }
  throw new Error(`ROOT_E2E_HOOK_UNKNOWN_${name}`);
}

async function assertWriteOutcome(toolName, state, pool) {
  let rows;
  if (toolName === 'create_note') {
    [rows] = await pool.query('SELECT id FROM note WHERE create_by = ? AND title = ? AND del_flag = 0', [
      state.user.id,
      state.noteTitle,
    ]);
    if (rows.length !== 1) throw new Error('ROOT_E2E_CREATE_NOTE_NOT_PERSISTED');
  } else if (toolName === 'create_image_note') {
    [rows] = await pool.query('SELECT id FROM note WHERE create_by = ? AND title = ? AND del_flag = 0', [
      state.user.id,
      state.imageNoteTitle,
    ]);
    if (rows.length !== 1) throw new Error('ROOT_E2E_IMAGE_NOTE_NOT_PERSISTED');
  } else if (toolName === 'create_todo') {
    [rows] = await pool.query('SELECT id FROM todo_items WHERE user_id = ? AND title = ?', [
      state.user.id,
      state.todoTitle,
    ]);
    if (rows.length !== 1) throw new Error('ROOT_E2E_CREATE_TODO_NOT_PERSISTED');
  } else if (toolName === 'set_todo_status') {
    [rows] = await pool.query('SELECT status FROM todo_items WHERE id = ? AND user_id = ?', [
      state.todoId,
      state.user.id,
    ]);
    if (rows[0]?.status !== 'completed') throw new Error('ROOT_E2E_TODO_STATUS_NOT_PERSISTED');
  } else if (toolName === 'delete_todo') {
    [rows] = await pool.query('SELECT del_flag FROM todo_items WHERE id = ? AND user_id = ?', [
      state.todoId,
      state.user.id,
    ]);
    if (Number(rows[0]?.del_flag) !== 1) throw new Error('ROOT_E2E_TODO_DELETE_NOT_PERSISTED');
  } else if (toolName === 'create_todo_plan') {
    [rows] = await pool.query(
      `SELECT i.id, i.series_id,
              COUNT(DISTINCT r.id) AS rule_count,
              COUNT(DISTINCT j.id) AS job_count
         FROM todo_items i
         LEFT JOIN todo_reminder_rules r ON r.todo_id = i.id AND r.user_id = i.user_id AND r.enabled = 1
         LEFT JOIN todo_reminder_jobs j ON j.todo_id = i.id AND j.user_id = i.user_id
        WHERE i.user_id = ? AND i.title = ? AND i.del_flag = 0
        GROUP BY i.id, i.series_id`,
      [state.user.id, state.planTitle],
    );
    if (rows.length !== 1) throw new Error('ROOT_E2E_TODO_PLAN_NOT_PERSISTED');
    if (rows[0].series_id != null) throw new Error('ROOT_E2E_TODO_PLAN_CREATED_MULTIPLE_TASK_SERIES');
    if (Number(rows[0].rule_count || 0) !== 1 || Number(rows[0].job_count || 0) < 2) {
      throw new Error('ROOT_E2E_TODO_PLAN_REMINDERS_NOT_PERSISTED');
    }
  } else if (toolName === 'save_attachment_to_cloud') {
    [rows] = await pool.query('SELECT id FROM files WHERE create_by = ? AND file_name = ? AND del_flag = 0', [
      state.user.id,
      state.fileName,
    ]);
    if (rows.length !== 1) throw new Error('ROOT_E2E_CLOUD_FILE_NOT_PERSISTED');
  } else if (toolName === 'restore_trash') {
    [rows] = await pool.query('SELECT del_flag FROM note WHERE id = ? AND create_by = ?', [
      state.noteId,
      state.user.id,
    ]);
    if (Number(rows[0]?.del_flag) !== 0) throw new Error('ROOT_E2E_NOTE_RESTORE_NOT_PERSISTED');
  } else if (toolName === 'add_tag') {
    [rows] = await pool.query('SELECT id FROM tag WHERE user_id = ? AND name = ? AND del_flag = 0', [
      state.user.id,
      state.tagName,
    ]);
    if (rows.length !== 1) throw new Error('ROOT_E2E_TAG_NOT_PERSISTED');
  } else if (toolName === 'write_knowledge_base') {
    [rows] = await pool.query('SELECT id FROM knowledge_base WHERE title = ? AND COALESCE(admin_archived, 0) = 0', [
      state.kbTitle,
    ]);
    if (rows.length !== 1) throw new Error('ROOT_E2E_KNOWLEDGE_NOT_PERSISTED');
  } else if (toolName === 'create_bookmark') {
    [rows] = await pool.query('SELECT id FROM bookmark WHERE user_id = ? AND name = ? AND del_flag = 0', [
      state.user.id,
      state.bookmarkTitle,
    ]);
    if (rows.length !== 1) throw new Error('ROOT_E2E_BOOKMARK_NOT_PERSISTED');
  }
}

async function assertCaseAnswer(smokeCase, answer, state, pool) {
  if (!smokeCase.assertion) return;
  if (smokeCase.assertion === 'today_new_user_count') {
    const expected = await countToday(pool, 'user', 'id');
    if (!answerMentionsCount(answer, expected)) throw new Error('ROOT_E2E_NEW_USER_COUNT_MISMATCH');
    return;
  }
  if (smokeCase.assertion === 'today_note_count') {
    const expected = await countToday(pool, 'note', 'create_by', state.user.id);
    if (!answerMentionsCount(answer, expected)) throw new Error('ROOT_E2E_TODAY_NOTE_COUNT_MISMATCH');
    return;
  }
  throw new Error('ROOT_E2E_ASSERTION_UNKNOWN');
}

async function runToolCase({ smokeCase, state, pool, handlers, toolsByName, options, services }) {
  const startedAt = Date.now();
  try {
    if (smokeCase.attachment) await ensureAttachmentFixture(state, services, pool);
    await runHook(smokeCase.before, state, pool);
    const message = interpolate(smokeCase.message, placeholders(state));
    const sessionId = `${state.runId}-${smokeCase.id}`.slice(0, 96);
    const body = {
      message,
      sessionId,
      stream: false,
      history: [],
      scope: { mode: 'workspace', externalWeb: smokeCase.externalWeb === true },
      clientCapabilities: [...CLIENT_CAPABILITIES],
      timeZone: 'Asia/Shanghai',
      ...(smokeCase.attachment ? { attachmentIds: [state.attachmentId] } : {}),
    };
    const request = makeRequest({
      user: state.user,
      body,
      fingerprint: `${state.runId}-${smokeCase.id}`,
    });
    const response = await invokeHandler(handlers.agentChat, request);
    const data = response.body?.data || {};
    if (response.statusCode !== 200 || Number(response.body?.status) !== 200) {
      const error = new Error(data.code || 'ROOT_E2E_AGENT_HTTP_FAILED');
      error.code = data.code || 'ROOT_E2E_AGENT_HTTP_FAILED';
      throw error;
    }
    const log = await waitForAgentLog(pool, data.requestId);
    const usedTools = parseJsonArray(log.tools_used);
    const actual = usedTools.find((item) => item?.name === smokeCase.toolName);
    if (!actual) throw new Error('ROOT_E2E_EXPECTED_TOOL_NOT_EXECUTED');
    if (smokeCase.kind === 'read' && actual.status !== 'success') {
      throw new Error('ROOT_E2E_READ_TOOL_FAILED');
    }
    if (smokeCase.kind === 'write' && actual.status !== 'confirmation_required') {
      throw new Error('ROOT_E2E_WRITE_CARD_NOT_RECORDED');
    }
    if (usedTools.some((item) => item?.status === 'error')) throw new Error('ROOT_E2E_TOOL_RESULT_ERROR');

    const answer = String(data.response || '');
    if (smokeCase.kind === 'read') {
      if (answerFailed(answer)) throw new Error('ROOT_E2E_ANSWER_INVALID');
      if ((data.confirmations || []).length) throw new Error('ROOT_E2E_UNEXPECTED_CONFIRMATION');
      await assertCaseAnswer(smokeCase, answer, state, pool);
      return {
        id: smokeCase.id,
        toolName: smokeCase.toolName,
        passed: true,
        outcome: 'answer',
        responseChars: answer.length,
        durationMs: Date.now() - startedAt,
      };
    }

    const confirmations = Array.isArray(data.confirmations) ? data.confirmations : [];
    const confirmation = confirmations.find((item) => item?.toolName === smokeCase.toolName);
    const tool = toolsByName.get(smokeCase.toolName);
    if (confirmations.length !== 1 || !tool || !nonEmptyCard(confirmation, tool)) {
      throw new Error('ROOT_E2E_CONFIRMATION_CARD_INVALID');
    }
    let replayVerified = false;
    if (options.executeWrites && smokeCase.execute !== false) {
      const executed = await executeConfirmation({ handlers, user: state.user, confirmation, runId: state.runId });
      replayVerified = executed.replayVerified;
      await assertWriteOutcome(smokeCase.toolName, state, pool);
      await runHook(smokeCase.after, state, pool);
    }
    return {
      id: smokeCase.id,
      toolName: smokeCase.toolName,
      passed: true,
      outcome: options.executeWrites ? 'executed' : 'confirmation',
      riskLevel: confirmation.riskLevel,
      replayVerified,
      durationMs: Date.now() - startedAt,
    };
  } catch (error) {
    return {
      id: smokeCase.id,
      toolName: smokeCase.toolName,
      passed: false,
      outcome: 'failed',
      errorCode: stableCode(error),
      durationMs: Date.now() - startedAt,
    };
  }
}

async function callExpectedFailure({ handler, user, confirmation, runId, expectedStatus, expectedCode }) {
  const request = makeRequest({
    user,
    body: { confirmationToken: confirmation.token, sessionId: confirmation.sessionId },
    fingerprint: `${runId}-expected-failure-${confirmation.id}`,
  });
  request.originalUrl = '/api/chat/agent/confirm';
  const response = await invokeHandler(handler, request);
  if (response.statusCode !== expectedStatus || response.body?.data?.code !== expectedCode) {
    const error = new Error('ROOT_E2E_EXPECTED_FAILURE_MISMATCH');
    error.code = 'ROOT_E2E_EXPECTED_FAILURE_MISMATCH';
    throw error;
  }
}

function clientLikeFollowUpGrounding(data) {
  const sourceSetId = String(data?.resolvedGrounding?.sourceSetId || '').trim();
  const contextRefs = (Array.isArray(data?.entityRefs) ? data.entityRefs : [])
    .map((item) => ({ type: String(item?.type || '').trim(), id: String(item?.id || '').trim() }))
    .filter((item) => item.type && item.id);
  const hasMaterialCandidate = Boolean(sourceSetId || contextRefs.length);
  return {
    grounding: {
      mode: hasMaterialCandidate ? 'inherit_candidate' : 'workspace',
      contextRefs: [],
      scopeRefs: [],
      attachmentIds: [],
      ...(sourceSetId ? { sourceSetId } : {}),
    },
    ...(!sourceSetId && contextRefs.length
      ? { followUpMaterials: { contextRefs, scopeRefs: [], attachmentIds: [] } }
      : {}),
  };
}

async function runNoteArtifactRegression({ state, pool, handlers, toolsByName, refinementRounds = 5 }) {
  const startedAt = Date.now();
  const sevenDayPrefix = `${state.prefix} 7天总结`;
  const summaryPrefix = `${state.prefix} 今日总结`;
  try {
    const createNoteTool = toolsByName.get('create_note');
    const sevenDayMessage =
      `总结我最近 7 天的全部笔记，生成一篇新笔记，标题必须以“${sevenDayPrefix}”开头，` +
      '正文至少 800 字；不要编造材料里的事实。';
    const sevenDayBody = {
      message: sevenDayMessage,
      sessionId: '',
      stream: false,
      history: [],
      scope: { mode: 'workspace', externalWeb: false },
      clientCapabilities: [...CLIENT_CAPABILITIES],
      timeZone: 'Asia/Shanghai',
    };
    const sevenDayRequest = makeRequest({
      user: state.user,
      body: sevenDayBody,
      fingerprint: `${state.runId}-artifact-seven-day`,
    });
    const sevenDay = await invokeHandler(handlers.agentChat, sevenDayRequest);
    const sevenDayData = sevenDay.body?.data || {};
    const sevenDayCard = sevenDayData.confirmations?.[0];
    if (sevenDay.statusCode !== 200 || Number(sevenDay.body?.status) !== 200) {
      throw new Error('ROOT_E2E_ARTIFACT_HTTP_FAILED');
    }
    if (sevenDayData.confirmations?.length !== 1 || !nonEmptyCard(sevenDayCard, createNoteTool)) {
      throw new Error('ROOT_E2E_ARTIFACT_CARD_INVALID');
    }
    if (!String(sevenDayCard.args?.title || '').startsWith(sevenDayPrefix)) {
      throw new Error('ROOT_E2E_ARTIFACT_SEVEN_DAY_TITLE_MISMATCH');
    }
    if (String(sevenDayCard.args?.content || '').replace(/\s/gu, '').length < 800) {
      throw new Error('ROOT_E2E_ARTIFACT_SEVEN_DAY_TOO_SHORT');
    }
    const sessionId = String(sevenDayData.sessionId || sevenDayCard.sessionId || '');
    if (!sessionId || sevenDayCard.sessionId !== sessionId) {
      throw new Error('ROOT_E2E_ARTIFACT_SESSION_INVALID');
    }

    // 完整复刻页面行为：同一会话内保留旧待确认卡，并机械续带上一轮 Source Set
    //（旧客户端则续带 entityRefs）。最新消息把“最近 7 天”改成“今天”，服务端必须
    // 丢弃旧范围、重新查询今天，并原子替换旧卡。
    const todayMessage =
      `改为只根据我今天的全部笔记生成一篇新笔记，标题必须以“${summaryPrefix}”开头，` +
      '正文至少 2000 字；可以补充分析、经验和下一步建议，但不要编造材料里的事实。';
    const [todayNoteRows] = await pool.query(
      `SELECT id FROM note
        WHERE create_by = ? AND create_time >= CURDATE()
          AND create_time < DATE_ADD(CURDATE(), INTERVAL 1 DAY) AND COALESCE(del_flag, 0) = 0`,
      [state.user.id],
    );
    const expectedTodayNoteIds = new Set(todayNoteRows.map((item) => String(item.id)));
    const assertTodayMaterials = (data, errorCode) => {
      const refs = (Array.isArray(data?.entityRefs) ? data.entityRefs : []).filter(
        (item) => item?.type === 'note' && item?.id,
      );
      if (
        refs.length < Math.min(12, expectedTodayNoteIds.size) ||
        refs.some((item) => !expectedTodayNoteIds.has(String(item.id)))
      ) {
        const error = new Error(errorCode);
        error.code = errorCode;
        throw error;
      }
      return refs.length;
    };
    const todayRequest = makeRequest({
      user: state.user,
      body: {
        message: todayMessage,
        sessionId,
        stream: false,
        history: [{ role: 'user', content: sevenDayMessage }],
        scope: { mode: 'workspace', externalWeb: false },
        clientCapabilities: [...CLIENT_CAPABILITIES],
        timeZone: 'Asia/Shanghai',
        pendingNoteDraft: { confirmationId: sevenDayCard.id, confirmationToken: sevenDayCard.token },
        ...clientLikeFollowUpGrounding(sevenDayData),
      },
      fingerprint: `${state.runId}-artifact-today`,
    });
    const today = await invokeHandler(handlers.agentChat, todayRequest);
    const todayData = today.body?.data || {};
    const todayCard = todayData.confirmations?.[0];
    if (
      today.statusCode !== 200 ||
      Number(today.body?.status) !== 200 ||
      todayData.confirmations?.length !== 1 ||
      !nonEmptyCard(todayCard, createNoteTool) ||
      todayCard.token === sevenDayCard.token
    ) {
      throw new Error('ROOT_E2E_ARTIFACT_TODAY_CARD_INVALID');
    }
    const todayTitle = String(todayCard.args?.title || '');
    const todayContent = String(todayCard.args?.content || '');
    if (!todayTitle.startsWith(summaryPrefix) || /最近\s*7\s*天|7\s*天/iu.test(todayTitle)) {
      throw new Error('ROOT_E2E_ARTIFACT_SCOPE_TITLE_MISMATCH');
    }
    if (todayContent.replace(/\s/gu, '').length < 2000) throw new Error('ROOT_E2E_ARTIFACT_TOO_SHORT');
    assertTodayMaterials(todayData, 'ROOT_E2E_ARTIFACT_MATERIALS_INCOMPLETE');
    await callExpectedFailure({
      handler: handlers.confirmAgentTool,
      user: state.user,
      confirmation: sevenDayCard,
      runId: state.runId,
      expectedStatus: 410,
      expectedCode: 'TOOL_CONFIRMATION_EXPIRED',
    });

    let latestCard = todayCard;
    let latestData = todayData;
    const userHistory = [
      { role: 'user', content: sevenDayMessage },
      { role: 'user', content: todayMessage },
    ];
    for (let round = 1; round <= refinementRounds; round += 1) {
      const refinementMessage =
        `第 ${round} 次重新生成：保留当前草稿已经引用的全部材料和核心事实，` +
        '内容更详细，至少 2500 字，不要编造材料里的事实。';
      const refinementRequest = makeRequest({
        user: state.user,
        body: {
          message: refinementMessage,
          sessionId,
          stream: false,
          history: [...userHistory],
          scope: { mode: 'workspace', externalWeb: false },
          clientCapabilities: [...CLIENT_CAPABILITIES],
          timeZone: 'Asia/Shanghai',
          pendingNoteDraft: { confirmationId: latestCard.id, confirmationToken: latestCard.token },
          ...clientLikeFollowUpGrounding(latestData),
        },
        fingerprint: `${state.runId}-artifact-refine-${round}`,
      });
      const refined = await invokeHandler(handlers.agentChat, refinementRequest);
      const refinedData = refined.body?.data || {};
      const refinedCard = refinedData.confirmations?.[0];
      if (
        refined.statusCode !== 200 ||
        Number(refined.body?.status) !== 200 ||
        refinedData.confirmations?.length !== 1 ||
        !nonEmptyCard(refinedCard, createNoteTool) ||
        refinedCard.token === latestCard.token
      ) {
        throw new Error('ROOT_E2E_ARTIFACT_REFINEMENT_CARD_INVALID');
      }
      const refinedTitle = String(refinedCard.args?.title || '');
      const refinedContent = String(refinedCard.args?.content || '');
      if (!refinedTitle.startsWith(summaryPrefix) || /最近\s*7\s*天|7\s*天/iu.test(refinedTitle)) {
        throw new Error('ROOT_E2E_ARTIFACT_REFINEMENT_SCOPE_MISMATCH');
      }
      if (refinedContent.replace(/\s/gu, '').length < 2500) {
        throw new Error('ROOT_E2E_ARTIFACT_REFINEMENT_TOO_SHORT');
      }
      assertTodayMaterials(refinedData, 'ROOT_E2E_ARTIFACT_REFINEMENT_MATERIALS_INCOMPLETE');
      await callExpectedFailure({
        handler: handlers.confirmAgentTool,
        user: state.user,
        confirmation: latestCard,
        runId: `${state.runId}-round-${round}`,
        expectedStatus: 410,
        expectedCode: 'TOOL_CONFIRMATION_EXPIRED',
      });
      userHistory.push({ role: 'user', content: refinementMessage });
      latestCard = refinedCard;
      latestData = refinedData;
    }

    const confirmed = await executeConfirmation({
      handlers,
      user: state.user,
      confirmation: latestCard,
      runId: state.runId,
    });
    const finalTitle = String(latestCard.args?.title || '');
    const [persisted] = await pool.query(
      `SELECT id, content FROM note
        WHERE create_by = ? AND title = ? AND del_flag = 0
        ORDER BY create_time DESC LIMIT 2`,
      [state.user.id, finalTitle],
    );
    if (persisted.length !== 1 || String(persisted[0].content || '').replace(/\s/gu, '').length < 2500) {
      throw new Error('ROOT_E2E_ARTIFACT_NOT_PERSISTED');
    }
    return {
      id: 'note-artifact-multiturn-scope-length-refinement',
      passed: true,
      outcome: 'executed',
      minimumChars: 2500,
      materialCount: Array.isArray(latestData.entityRefs) ? latestData.entityRefs.length : 0,
      refinementRounds,
      staleTokensRejected: refinementRounds + 1,
      replayVerified: confirmed.replayVerified,
      durationMs: Date.now() - startedAt,
    };
  } catch (error) {
    return {
      id: 'note-artifact-multiturn-scope-length-refinement',
      passed: false,
      outcome: 'failed',
      errorCode: stableCode(error),
      durationMs: Date.now() - startedAt,
    };
  }
}

async function waitForBookmarkHealth(state, services, timeoutMs = 120_000) {
  const deadline = Date.now() + timeoutMs;
  let lastNotice = 0;
  while (services.isChecking(state.user.id) && Date.now() < deadline) {
    if (Date.now() - lastNotice >= 10_000) {
      process.stderr.write('[root-e2e] 等待书签体检后台任务收尾…\n');
      lastNotice = Date.now();
    }
    await delay(500);
  }
  if (services.isChecking(state.user.id)) throw new Error('ROOT_E2E_BOOKMARK_HEALTH_TIMEOUT');
}

function placeholdersFor(items) {
  return items.map(() => '?').join(',');
}

async function cleanupFixtures(state, pool, services) {
  const cleanup = { passed: true, errorCode: null };
  try {
    await waitForBookmarkHealth(state, services);

    if (state.attachmentId) {
      await services.deleteDocumentSource({ userId: state.user.id, sourceId: state.attachmentId });
    }

    const [files] = await pool.query('SELECT id, obs_key FROM files WHERE create_by = ? AND file_name LIKE ?', [
      state.user.id,
      `${state.assetPrefix}%`,
    ]);
    for (const file of files) {
      if (file.obs_key) await services.deleteObjectFromObs(file.obs_key);
    }

    const connection = await pool.getConnection();
    const noteImageUrls = [];
    try {
      await connection.beginTransaction();
      const [notes] = await connection.query('SELECT id, content FROM note WHERE create_by = ? AND title LIKE ?', [
        state.user.id,
        `${state.prefix}%`,
      ]);
      const noteIds = notes.map((row) => String(row.id));
      if (noteIds.length) {
        const marks = placeholdersFor(noteIds);
        const [images] = await connection.query(`SELECT url FROM note_images WHERE note_id IN (${marks})`, noteIds);
        noteImageUrls.push(...images.map((row) => row.url).filter(Boolean));
        for (const note of notes) {
          const matches = String(note.content || '').match(/https:\/\/boluo66\.top\/uploads\/[^"'<>\s]+/giu) || [];
          noteImageUrls.push(...matches);
        }
        await connection.query(
          `DELETE FROM resource_inbox WHERE user_id = ? AND resource_type = 'note' AND resource_id IN (${marks})`,
          [state.user.id, ...noteIds],
        );
        await connection.query(
          `DELETE FROM resource_tag_relations WHERE user_id = ? AND resource_type = 'note' AND resource_id IN (${marks})`,
          [state.user.id, ...noteIds],
        );
        await connection.query(
          `DELETE FROM ai_content_chunks WHERE subject_user_id = ? AND resource_type = 'note' AND resource_id IN (${marks})`,
          [state.user.id, ...noteIds],
        );
        await connection.query(`DELETE FROM note_resource_refs WHERE source_note_id IN (${marks})`, noteIds);
        await connection.query(`DELETE FROM note_versions WHERE note_id IN (${marks})`, noteIds);
        await connection.query(`DELETE FROM note_images WHERE note_id IN (${marks})`, noteIds);
        await connection.query(`DELETE FROM note WHERE create_by = ? AND id IN (${marks})`, [
          state.user.id,
          ...noteIds,
        ]);
      }

      const [bookmarks] = await connection.query('SELECT id FROM bookmark WHERE user_id = ? AND name LIKE ?', [
        state.user.id,
        `${state.prefix}%`,
      ]);
      const bookmarkIds = bookmarks.map((row) => String(row.id));
      if (bookmarkIds.length) {
        const marks = placeholdersFor(bookmarkIds);
        await connection.query(`DELETE FROM bookmark_snapshot WHERE user_id = ? AND bookmark_id IN (${marks})`, [
          state.user.id,
          ...bookmarkIds,
        ]);
        await connection.query(`DELETE FROM bookmark_health WHERE user_id = ? AND bookmark_id IN (${marks})`, [
          state.user.id,
          ...bookmarkIds,
        ]);
        await connection.query(`DELETE FROM bookmark_icon_jobs WHERE user_id = ? AND bookmark_id IN (${marks})`, [
          state.user.id,
          ...bookmarkIds,
        ]);
        await connection.query(
          `DELETE FROM resource_inbox WHERE user_id = ? AND resource_type = 'bookmark' AND resource_id IN (${marks})`,
          [state.user.id, ...bookmarkIds],
        );
        await connection.query(
          `DELETE FROM resource_tag_relations WHERE user_id = ? AND resource_type = 'bookmark' AND resource_id IN (${marks})`,
          [state.user.id, ...bookmarkIds],
        );
        await connection.query(
          `DELETE FROM ai_content_chunks WHERE subject_user_id = ? AND resource_type = 'bookmark' AND resource_id IN (${marks})`,
          [state.user.id, ...bookmarkIds],
        );
        await connection.query(`DELETE FROM bookmark WHERE user_id = ? AND id IN (${marks})`, [
          state.user.id,
          ...bookmarkIds,
        ]);
      }

      const fileIds = files.map((row) => String(row.id));
      if (fileIds.length) {
        const marks = placeholdersFor(fileIds);
        await connection.query(
          `DELETE FROM resource_inbox WHERE user_id = ? AND resource_type = 'file' AND resource_id IN (${marks})`,
          [state.user.id, ...fileIds],
        );
        await connection.query(
          `DELETE FROM resource_tag_relations WHERE user_id = ? AND resource_type = 'file' AND resource_id IN (${marks})`,
          [state.user.id, ...fileIds],
        );
        await connection.query(
          `DELETE FROM ai_content_chunks WHERE subject_user_id = ? AND resource_type = 'file' AND resource_id IN (${marks})`,
          [state.user.id, ...fileIds],
        );
        await connection.query(`DELETE FROM files WHERE create_by = ? AND id IN (${marks})`, [
          state.user.id,
          ...fileIds,
        ]);
      }
      await connection.query('DELETE FROM folders WHERE create_by = ? AND name LIKE ?', [
        state.user.id,
        `${state.prefix}%`,
      ]);

      const [todos] = await connection.query(
        'SELECT id, series_id FROM todo_items WHERE user_id = ? AND title LIKE ?',
        [state.user.id, `${state.prefix}%`],
      );
      const [series] = await connection.query('SELECT id FROM todo_series WHERE user_id = ? AND title LIKE ?', [
        state.user.id,
        `${state.prefix}%`,
      ]);
      const todoIds = todos.map((row) => String(row.id));
      const seriesIds = [
        ...new Set([
          ...series.map((row) => String(row.id)),
          ...todos.map((row) => String(row.series_id || '')).filter(Boolean),
        ]),
      ];
      if (todoIds.length) {
        const marks = placeholdersFor(todoIds);
        await connection.query(`DELETE FROM todo_plan_requests WHERE user_id = ? AND todo_id IN (${marks})`, [
          state.user.id,
          ...todoIds,
        ]);
        await connection.query(`DELETE FROM todo_reminder_jobs WHERE user_id = ? AND todo_id IN (${marks})`, [
          state.user.id,
          ...todoIds,
        ]);
        await connection.query(`DELETE FROM todo_reminder_rules WHERE user_id = ? AND todo_id IN (${marks})`, [
          state.user.id,
          ...todoIds,
        ]);
        await connection.query(`DELETE FROM todo_items WHERE user_id = ? AND id IN (${marks})`, [
          state.user.id,
          ...todoIds,
        ]);
      }
      if (seriesIds.length) {
        const marks = placeholdersFor(seriesIds);
        await connection.query(`DELETE FROM todo_reminder_jobs WHERE user_id = ? AND series_id IN (${marks})`, [
          state.user.id,
          ...seriesIds,
        ]);
        await connection.query(`DELETE FROM todo_reminder_rules WHERE user_id = ? AND series_id IN (${marks})`, [
          state.user.id,
          ...seriesIds,
        ]);
        await connection.query(`DELETE FROM todo_series_resource_refs WHERE user_id = ? AND series_id IN (${marks})`, [
          state.user.id,
          ...seriesIds,
        ]);
        await connection.query(`DELETE FROM todo_plan_requests WHERE user_id = ? AND series_id IN (${marks})`, [
          state.user.id,
          ...seriesIds,
        ]);
        await connection.query(`DELETE FROM todo_series WHERE user_id = ? AND id IN (${marks})`, [
          state.user.id,
          ...seriesIds,
        ]);
      }

      await connection.query(
        'DELETE FROM resource_tag_relations WHERE user_id = ? AND tag_id IN (SELECT id FROM tag WHERE user_id = ? AND name LIKE ?)',
        [state.user.id, state.user.id, `${state.prefix}%`],
      );
      await connection.query('DELETE FROM tag WHERE user_id = ? AND name LIKE ?', [state.user.id, `${state.prefix}%`]);
      await connection.query('DELETE FROM knowledge_base WHERE title LIKE ?', [`${state.prefix}%`]);

      await connection.commit();
    } catch (error) {
      await connection.rollback().catch(() => {});
      throw error;
    } finally {
      connection.release();
    }
    if (noteImageUrls.length) await services.cleanupOrphanNoteImages([...new Set(noteImageUrls)]);
    if (state.localImageDir) await fs.rm(state.localImageDir, { recursive: true, force: true });
  } catch (error) {
    cleanup.passed = false;
    cleanup.errorCode = stableCode(error);
  }
  return cleanup;
}

function buildState({ user, targetUserId }) {
  const stamp = new Date()
    .toISOString()
    .replace(/[-:TZ.]/g, '')
    .slice(0, 14);
  const nonce = crypto.randomBytes(3).toString('hex');
  const runId = `root-e2e-${stamp}-${nonce}`;
  const prefix = `[AI-E2E ${stamp}-${nonce}]`;
  const assetPrefix = `ai-e2e-${stamp}-${nonce}`;
  return {
    runId,
    prefix,
    assetPrefix,
    user,
    targetUserId,
    noteTitle: `${prefix} 短笔记`,
    todoTitle: `${prefix} 普通待办`,
    planTitle: `${prefix} 重复提醒计划`,
    imageNoteTitle: `${prefix} 图片笔记`,
    folderName: `${prefix} 文件夹`,
    fileName: `${assetPrefix}.png`,
    tagName: `${prefix} 标签`,
    kbTitle: `${prefix} 内部知识`,
    bookmarkTitle: `${prefix} 书签`,
    bookmarkUrl: `https://example.com/?lightnote_e2e=${encodeURIComponent(assetPrefix)}`,
    summaryPrefix: `${prefix} 今日总结`,
    attachmentId: '',
    noteId: '',
    todoId: '',
    todoPlanTodoId: '',
    todoSeriesId: '',
    cloudFileId: '',
  };
}

function formatProgress(item, index, total) {
  const suffix = item.passed ? 'PASS' : `FAIL ${item.errorCode}`;
  return `[root-e2e] ${index}/${total} ${item.toolName || item.id} ${suffix}\n`;
}

export function formatRootE2EText(report) {
  if (report.dryRun) {
    return `Root 真实链路门禁 dry-run：注册 ${report.coverage.registered} 个工具，矩阵覆盖 ${report.coverage.covered} 个；未调用模型、工具或数据库。`;
  }
  const lines = [
    `Root 真实链路门禁：${report.passed ? '通过' : '未通过'}`,
    `Provider：${report.provider}；工具 ${report.summary.passedTools}/${report.summary.totalTools}；写操作 ${report.summary.executedWrites}/${report.summary.totalWrites}；幂等重放 ${report.summary.replayVerified}/${report.summary.totalWrites}`,
    `笔记 7 天→今天/字数/连续续写：${report.artifact?.passed ? '通过' : `未通过(${report.artifact?.errorCode || '未运行'})`}；夹具清理：${report.cleanup.passed ? '通过' : `未通过(${report.cleanup.errorCode})`}`,
    `脱敏报告：${report.reportPath}`,
  ];
  const failures = report.cases.filter((item) => !item.passed);
  if (failures.length) lines.push(`失败项：${failures.map((item) => `${item.toolName}:${item.errorCode}`).join('，')}`);
  return lines.join('\n');
}

export async function runRootE2E(options) {
  if (!options.live) {
    const coverage = validateRootE2ECoverage(rootE2EToolNames());
    return {
      passed: coverage.valid,
      dryRun: true,
      suite: options.suite,
      provider: options.provider,
      coverage,
      businessToolsExecuted: 0,
    };
  }

  dotenv.config({ path: path.join(SERVER_ROOT, '.env'), quiet: true });
  process.env.AI_AGENT_RUNTIME_V2_MODE = 'enforce';
  process.env.AGENT_LLM_PROVIDER = options.provider;
  const localImageDir = await fs.mkdtemp(path.join(os.tmpdir(), 'lightnote-root-e2e-images-'));
  process.env.LIGHT_NOTE_IMAGE_DIR = localImageDir;

  const [
    { default: pool },
    handlers,
    { default: tools },
    documentServices,
    linkHealthServices,
    obsServices,
    noteImageServices,
  ] = await Promise.all([
    import('../../db/index.js'),
    import('../../router_handle/agentHandle.js'),
    import('../../util/agent/tools/index.js'),
    import('../../util/aiDocument/service.js'),
    import('../../util/linkHealth.js'),
    import('../../util/obsClient.js'),
    import('../../util/noteImages.js'),
  ]);
  const services = {
    createTemporaryDocumentSource: documentServices.createTemporaryDocumentSource,
    confirmTemporaryDocumentSource: documentServices.confirmTemporaryDocumentSource,
    deleteDocumentSource: documentServices.deleteDocumentSource,
    isChecking: linkHealthServices.isChecking,
    deleteObjectFromObs: obsServices.deleteObjectFromObs,
    cleanupOrphanNoteImages: noteImageServices.cleanupOrphanNoteImages,
  };
  const coverage = validateRootE2ECoverage(tools.map((tool) => tool.name));
  if (!coverage.valid) {
    const error = new Error('ROOT_E2E_TOOL_COVERAGE_INVALID');
    error.code = 'ROOT_E2E_TOOL_COVERAGE_INVALID';
    throw error;
  }
  const rootAlias = String(process.env.ROOT_E2E_ACCOUNT_ALIAS || '菠萝').trim();
  const [rootRows] = await pool.query(
    `SELECT id, role, alias FROM user
      WHERE role = 'root' AND alias = ? AND COALESCE(del_flag, 0) = 0
      ORDER BY create_time ASC LIMIT 1`,
    [rootAlias],
  );
  if (!rootRows[0]) throw new Error('ROOT_E2E_ROOT_ACCOUNT_NOT_FOUND');
  const [targetRows] = await pool.query(
    `SELECT id FROM user
      WHERE role NOT IN ('root', 'test') AND COALESCE(del_flag, 0) = 0
      ORDER BY create_time DESC LIMIT 1`,
  );
  const state = buildState({ user: rootRows[0], targetUserId: String(targetRows[0]?.id || rootRows[0].id) });
  state.localImageDir = localImageDir;
  const toolsByName = new Map(tools.map((tool) => [tool.name, tool]));
  const requestedCaseIds = new Set(options.caseIds);
  const selectedCases = selectRootE2ECases(options.suite).filter(
    (item) => !requestedCaseIds.size || requestedCaseIds.has(item.id),
  );
  if (!selectedCases.length) throw new Error('ROOT_E2E_CASE_SELECTION_EMPTY');
  const results = [];
  let artifact = { id: 'note-artifact-multiturn-scope-length-refinement', passed: true, outcome: 'skipped' };
  let cleanup = { passed: false, errorCode: 'ROOT_E2E_CLEANUP_NOT_RUN' };
  try {
    for (const smokeCase of selectedCases) {
      const item = await runToolCase({
        smokeCase,
        state,
        pool,
        handlers,
        toolsByName,
        options,
        services,
      });
      results.push(item);
      process.stderr.write(formatProgress(item, results.length, selectedCases.length));
    }
    if (options.artifactRegression) {
      artifact = await runNoteArtifactRegression({
        state,
        pool,
        handlers,
        toolsByName,
        refinementRounds: options.artifactRefinementRounds,
      });
      process.stderr.write(formatProgress(artifact, selectedCases.length + 1, selectedCases.length + 1));
    }
  } finally {
    cleanup = await cleanupFixtures(state, pool, services);
  }

  const writeResults = results.filter((item) => toolsByName.get(item.toolName)?.isWrite === true);
  const summary = {
    totalTools: results.length,
    passedTools: results.filter((item) => item.passed).length,
    totalWrites: writeResults.length,
    executedWrites: writeResults.filter((item) => item.passed && item.outcome === 'executed').length,
    replayVerified: writeResults.filter((item) => item.replayVerified).length,
  };
  const passed =
    coverage.valid &&
    results.length === selectedCases.length &&
    results.every((item) => item.passed) &&
    artifact.passed &&
    cleanup.passed &&
    (!options.executeWrites || summary.replayVerified === summary.totalWrites);
  const reportPath = path.join('/tmp', `lightnote-${state.runId}.json`);
  const report = {
    schemaVersion: 1,
    passed,
    dryRun: false,
    suite: options.suite,
    provider: options.provider,
    runtime: 'turn_contract_v2_enforce',
    rootIdentityVerified: true,
    coverage,
    summary,
    cases: results,
    artifact,
    cleanup,
    reportPath,
  };
  await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
  await pool.end();
  return report;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  let options;
  try {
    options = parseRootE2EArgs(process.argv.slice(2));
    const report = await runRootE2E(options);
    process.stdout.write(
      `${options.format === 'json' ? JSON.stringify(report, null, 2) : formatRootE2EText(report)}\n`,
    );
    process.exit(report.passed ? 0 : 1);
  } catch (error) {
    process.stderr.write(`Root 真实链路门禁失败：${stableCode(error)}\n`);
    process.exit(1);
  }
}
