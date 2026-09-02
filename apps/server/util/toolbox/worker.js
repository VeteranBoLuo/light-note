import crypto from 'node:crypto';
import { AI_QUOTA_ERROR_CODES } from '@lightnote/shared/ai-quota-protocol';
import pool from '../../db/index.js';
import { executeAiSkill } from '../aiSkill/runtime.js';
import {
  attachCloudDocumentSource,
  confirmTemporaryDocumentSource,
  getDocumentSourceStatuses,
} from '../aiDocument/service.js';
import { getActiveSecurityRestrictions } from '../security/services/securityRestrictionService.js';
import { resolvePersonalKnowledgeResourceVersions } from '../personalKnowledgeSearch.js';
import { settleToolboxBilling } from './billing.js';
import { parseToolboxError, toolboxError } from './errors.js';
import { toolboxServiceInternals } from './service.js';

const DOCUMENT_WAIT_MS = 8_000;
const TOOLBOX_AI_TIMEOUT_MS = 150_000;
const TOOLBOX_LEASE_HEARTBEAT_MS = 60_000;
const TOOLBOX_LEASE_FAILURE_GRACE_MS = 8 * 60_000;
const MATERIAL_TO_NOTE_MAX_TOKENS = Object.freeze({ concise: 2_600, balanced: 4_200, detailed: 6_000 });
const AI_TOOL_STRATEGIES = Object.freeze({
  idea_to_draft: Object.freeze({
    skillId: 'toolbox.idea_to_draft',
    artifactType: 'note_draft',
    defaultTitle: '灵感初稿',
    draftState: 'editable',
  }),
  material_to_note: Object.freeze({
    skillId: 'toolbox.material_to_note',
    artifactType: 'note_draft',
    defaultTitle: '资料整理笔记',
    draftState: 'editable',
  }),
  research_brief: Object.freeze({
    skillId: 'toolbox.research_brief',
    artifactType: 'research_brief',
    defaultTitle: '研究速读包',
    draftState: 'needs_verification',
  }),
  study_kit: Object.freeze({
    skillId: 'toolbox.study_kit',
    artifactType: 'study_kit',
    defaultTitle: '学习套件',
    draftState: 'editable',
  }),
  concept_map: Object.freeze({
    skillId: 'toolbox.concept_map',
    artifactType: 'concept_map',
    defaultTitle: '概念图谱',
    draftState: 'editable',
  }),
  action_plan: Object.freeze({
    skillId: 'toolbox.action_plan',
    artifactType: 'action_plan',
    defaultTitle: '行动项清单',
    draftState: 'needs_verification',
  }),
  source_comparison: Object.freeze({
    skillId: 'toolbox.source_comparison',
    artifactType: 'comparison',
    defaultTitle: '多资料对比',
    draftState: 'editable',
  }),
  knowledge_audit: Object.freeze({
    skillId: 'toolbox.knowledge_audit',
    artifactType: 'knowledge_audit',
    defaultTitle: '知识库体检报告',
    draftState: 'needs_verification',
  }),
});
const TOOL_SKILLS = Object.freeze(
  Object.fromEntries(Object.entries(AI_TOOL_STRATEGIES).map(([toolId, strategy]) => [toolId, strategy.skillId])),
);
const AI_TOOL_INTENT_INSTRUCTIONS = Object.freeze({
  idea_to_draft: Object.freeze({
    article: '按可直接阅读的文章组织内容，重视开头、段落节奏、观点展开和收束。',
    proposal: '按可继续完善的方案初稿组织内容，明确目标、对象、思路、执行步骤与待确认项。',
    script: '按口播或视频脚本组织内容，提供自然开场、信息推进、转场和结尾行动建议。',
  }),
  material_to_note: Object.freeze({
    synthesize: '按主题综合整理材料，合并重复信息，同时保留来源依据、分歧和未知项。',
    outline: '优先建立层级清晰的笔记大纲，再把材料内容归入合适章节。',
    merge: '合并多份相近材料，删除重复表述，并明确标出互相冲突或版本不同的内容。',
  }),
  research_brief: Object.freeze({
    decision: '围绕待决策问题组织结论，明确支持依据、反例、限制和仍需核验的信息。',
    landscape: '先给出主题全貌，再梳理主要观点、参与方、分支和材料覆盖边界。',
    verify: '重点核验材料中的关键说法，区分一致证据、冲突证据和无法确认的部分。',
  }),
  study_kit: Object.freeze({
    understand: '以建立理解为主，先给知识框架，再解释核心概念、关系和易混淆点。',
    memorize: '以记忆巩固为主，提炼关键定义、区别、条件和高质量问答卡片。',
    practice: '以自测为主，生成由浅入深的理解题和应用题，并将答案与解析独立放置。',
  }),
  concept_map: Object.freeze({
    overview: '生成结构总览图，优先呈现核心概念的层级、组成和依赖关系。',
    causal: '优先提炼材料中有明确依据的因果、条件和影响链路，不补造关系。',
    compare: '围绕对比对象组织图谱，突出共同点、差异、适用边界和关联。',
  }),
  action_plan: Object.freeze({
    meeting: '按会议落地场景提取已确认决定、行动项、负责人、期限和待澄清事项。',
    project: '按项目推进场景组织阶段、行动、依赖、风险和下一次检查点。',
    decision: '围绕已做或待做决策整理后续行动、验证条件、负责人和复盘时间。',
  }),
  source_comparison: Object.freeze({
    claims: '按关键说法逐项对齐资料，区分一致、差异、冲突和证据缺口。',
    viewpoints: '按观点与立场比较资料，明确各自主张、依据、前提和覆盖边界。',
    options: '按统一决策维度比较候选方案，保留优劣、适用条件和无法判断项。',
  }),
  knowledge_audit: Object.freeze({
    cleanup: '优先识别重复、可合并和低价值内容，并给出保留依据与清理顺序。',
    freshness: '优先检查日期、版本、时效性和相互冲突的陈述，标出需要复核的内容。',
    gaps: '优先发现证据薄弱、覆盖不足和关键知识缺口，并给出补齐建议。',
  }),
});
const NON_RETRYABLE_CODES = new Set([
  'AI_ACCESS_RESTRICTED',
  AI_QUOTA_ERROR_CODES.EXHAUSTED,
  AI_QUOTA_ERROR_CODES.INSUFFICIENT_FOR_REQUEST,
  'AI_SKILL_ROLE_FORBIDDEN',
  'AI_SKILL_SCOPE_RESOURCE_UNAVAILABLE',
  'AI_SKILL_SCOPE_STALE',
  'TOOLBOX_ACCOUNT_UNAVAILABLE',
  'TOOLBOX_INPUT_INVALID',
  'TOOLBOX_NO_READABLE_CONTENT',
  'TOOLBOX_OCR_EMPTY',
]);
const RETRYABLE_CODES = new Set([
  'AI_GATEWAY_TIMEOUT',
  'AI_TIMEOUT',
  'AI_FIRST_TOKEN_TIMEOUT',
  'AI_STREAM_IDLE_TIMEOUT',
  'AI_RATE_LIMITED',
  'AI_NETWORK_ERROR',
  'AI_PROVIDER_ERROR',
  'DOCUMENT_PARSE_TIMEOUT',
  'OCR_TIMEOUT',
]);
const RETRYABLE_NETWORK_CODE =
  /^(?:ECONNRESET|ECONNREFUSED|EHOSTUNREACH|ENETUNREACH|EPIPE|ETIMEDOUT|EAI_AGAIN|UND_ERR_)/u;

class ToolboxDocumentWait extends Error {
  constructor() {
    super('TOOLBOX_DOCUMENT_WAIT');
    this.code = 'TOOLBOX_DOCUMENT_WAIT';
  }
}

function safeJson(value, fallback = {}) {
  if (value == null) return fallback;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function safeWorkerError(error) {
  const parsed = parseToolboxError(error);
  return {
    code: String(error?.code || parsed.code || 'TOOLBOX_PROCESSING_FAILED').slice(0, 64),
    message: parsed.status >= 500 ? '工具任务遇到临时问题' : parsed.message.slice(0, 255),
    status: parsed.status,
  };
}

function toolboxAttemptRequestId(job) {
  const attempt = Math.max(1, Math.trunc(Number(job?.attempts) || 1));
  const bytes = crypto
    .createHash('sha256')
    .update(`toolbox:${String(job?.id || '')}:attempt:${attempt}`)
    .digest()
    .subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function toolboxModelPolicy(toolId, options = {}) {
  const detailLevel = ['concise', 'balanced', 'detailed'].includes(options.detailLevel)
    ? options.detailLevel
    : 'balanced';
  return Object.freeze({
    timeoutMs: TOOLBOX_AI_TIMEOUT_MS,
    ...(toolId === 'material_to_note' ? { maxTokens: MATERIAL_TO_NOTE_MAX_TOKENS[detailLevel] } : {}),
  });
}

function toolboxIntentInstruction(toolId, intent) {
  return AI_TOOL_INTENT_INSTRUCTIONS[toolId]?.[String(intent || '').trim()] || '';
}

function toolboxLeaseOwner(workerId) {
  const workerLabel = String(workerId || 'toolbox-worker').slice(0, 80);
  return `${workerLabel}:${crypto.randomUUID()}`;
}

async function terminalizeExhaustedToolboxLease(connection) {
  const [rows] = await connection.query(
    `SELECT * FROM toolbox_jobs
      WHERE status = 'processing'
        AND attempts >= max_attempts
        AND expires_at > NOW()
        AND COALESCE(locked_at, updated_at, create_time) < DATE_SUB(NOW(), INTERVAL 10 MINUTE)
      ORDER BY COALESCE(locked_at, updated_at, create_time) ASC, id ASC
      LIMIT 1 FOR UPDATE`,
  );
  const job = rows[0];
  if (!job) return null;
  const settlement = await settleToolboxBilling(connection, job, {
    outcome: 'failed',
    reasonCode: 'TOOLBOX_JOB_LEASE_EXHAUSTED',
  });
  await connection.query(
    `UPDATE toolbox_jobs
        SET status = 'failed', progress = 100, stage = 'failed', billing_status = ?, actual_points = ?,
            completed_at = CURRENT_TIMESTAMP, locked_at = NULL, locked_by = NULL,
            error_code = 'TOOLBOX_JOB_LEASE_EXHAUSTED',
            error_message = '任务执行中断且已达到最大重试次数，预占积分已释放'
      WHERE id = ? AND status = 'processing'`,
    [settlement.billingStatus, settlement.actualPoints, job.id],
  );
  return Object.freeze({ terminalized: true, id: job.id });
}

async function claimNextToolboxJob(workerId, database = pool) {
  const connection = await database.getConnection();
  try {
    await connection.beginTransaction();
    const terminalized = await terminalizeExhaustedToolboxLease(connection);
    if (terminalized) {
      await connection.commit();
      return terminalized;
    }
    const [rows] = await connection.query(
      `SELECT * FROM toolbox_jobs
        WHERE attempts < max_attempts
          AND expires_at > NOW()
          AND (
            (status = 'queued' AND available_at <= NOW()) OR
            (status = 'processing' AND locked_at < DATE_SUB(NOW(), INTERVAL 10 MINUTE))
          )
        ORDER BY available_at ASC, create_time ASC, id ASC
        LIMIT 1 FOR UPDATE`,
    );
    const job = rows[0];
    if (!job) {
      await connection.commit();
      return null;
    }
    const leaseOwner = toolboxLeaseOwner(workerId);
    await connection.query(
      `UPDATE toolbox_jobs
          SET status = 'processing', attempts = attempts + 1, locked_at = NOW(), locked_by = ?,
              stage = 'preparing', progress = GREATEST(progress, 8),
              started_at = COALESCE(started_at, CURRENT_TIMESTAMP), error_code = NULL, error_message = NULL
        WHERE id = ?`,
      [leaseOwner, job.id],
    );
    await connection.commit();
    return { ...job, status: 'processing', attempts: Number(job.attempts || 0) + 1, locked_by: leaseOwner };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function heartbeatToolboxJob(job, leaseOwner, database = pool) {
  const [updated] = await database.query(
    `UPDATE toolbox_jobs
        SET locked_at = NOW(), updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND status = 'processing' AND locked_by = ?`,
    [job.id, leaseOwner],
  );
  if (!updated.affectedRows) throw toolboxError('TOOLBOX_JOB_LEASE_LOST', '任务执行租约已失效', 409);
}

function startToolboxJobHeartbeat(job, leaseOwner, database = pool) {
  let active = true;
  let inFlight = null;
  let fatalError = null;
  let lastSuccessAt = Date.now();

  const beat = () => {
    if (!active || inFlight || fatalError) return;
    inFlight = heartbeatToolboxJob(job, leaseOwner, database)
      .then(() => {
        lastSuccessAt = Date.now();
      })
      .catch((error) => {
        if (error?.code === 'TOOLBOX_JOB_LEASE_LOST' || Date.now() - lastSuccessAt >= TOOLBOX_LEASE_FAILURE_GRACE_MS) {
          fatalError = error;
        }
      })
      .finally(() => {
        inFlight = null;
      });
  };

  const timer = setInterval(beat, TOOLBOX_LEASE_HEARTBEAT_MS);
  timer.unref?.();
  return Object.freeze({
    async stop() {
      active = false;
      clearInterval(timer);
      if (inFlight) await inFlight;
      if (fatalError) throw fatalError;
    },
  });
}

async function withToolboxLeaseHeartbeat(job, leaseOwner, operation, database = pool) {
  const heartbeat = startToolboxJobHeartbeat(job, leaseOwner, database);
  let result;
  let operationError = null;
  try {
    result = await operation();
  } catch (error) {
    operationError = error;
  }
  try {
    await heartbeat.stop();
  } catch (heartbeatError) {
    operationError = heartbeatError;
  }
  if (operationError) throw operationError;
  return result;
}

async function loadJobInputs(jobId, database = pool) {
  const [rows] = await database.query(
    `SELECT input_type, resource_type, resource_id, resource_version, document_source_id
       FROM toolbox_job_inputs WHERE job_id = ? ORDER BY input_index ASC`,
    [jobId],
  );
  return {
    resourceRefs: rows
      .filter((row) => row.input_type === 'resource')
      .map((row) => ({
        type: row.resource_type,
        id: String(row.resource_id),
        ...(row.resource_version ? { version: String(row.resource_version) } : {}),
      })),
    unattachedFileRefs: rows
      .filter((row) => row.input_type === 'resource' && row.resource_type === 'file' && !row.document_source_id)
      .map((row) => ({
        type: row.resource_type,
        id: String(row.resource_id),
      })),
    sourceIds: rows.filter((row) => row.document_source_id).map((row) => String(row.document_source_id)),
  };
}

async function loadWorkerIdentity(userId, database = pool) {
  const [rows] = await database.query('SELECT id, role, del_flag FROM user WHERE id = ? LIMIT 1', [userId]);
  const user = rows[0];
  if (!user || Number(user.del_flag || 0) !== 0 || !['user', 'test', 'root'].includes(String(user.role || ''))) {
    throw toolboxError('TOOLBOX_ACCOUNT_UNAVAILABLE', '账号当前不可用，任务已停止', 403);
  }
  const restrictions = await getActiveSecurityRestrictions(userId);
  const blocked = restrictions.some((item) =>
    ['full_lock', 'login_lock', 'write_lock', 'ai_lock'].includes(String(item.restriction_type || '')),
  );
  if (blocked) throw toolboxError('AI_ACCESS_RESTRICTED', '当前账号的处理权限已被限制', 403);
  return {
    user: { id: String(user.id), role: String(user.role), isAuthenticated: true },
    restrictions,
  };
}

async function assertResourceVersionsCurrent(job, inputs, database = pool) {
  if (!inputs.resourceRefs.length) return;
  const current = await resolvePersonalKnowledgeResourceVersions({
    userId: job.user_id,
    resourceRefs: inputs.resourceRefs,
    database,
  });
  if (current.length !== inputs.resourceRefs.length) {
    throw toolboxError('AI_SKILL_SCOPE_RESOURCE_UNAVAILABLE', '部分材料不存在、已删除或不属于当前账号', 404);
  }
  for (let index = 0; index < current.length; index += 1) {
    if (inputs.resourceRefs[index].version && current[index].version !== inputs.resourceRefs[index].version) {
      throw toolboxError('AI_SKILL_SCOPE_STALE', '部分材料在报价后已更新，请重新发起任务', 409);
    }
  }
}

async function ensureDocumentInputsReady(job, inputs, database = pool) {
  const documentSourceIds = [...inputs.sourceIds];
  for (const ref of inputs.unattachedFileRefs) {
    const source = await attachCloudDocumentSource({ userId: job.user_id, fileId: ref.id, sessionId: job.id });
    documentSourceIds.push(String(source.id));
    await database.query(
      `UPDATE toolbox_job_inputs
          SET document_source_id = ?
        WHERE job_id = ? AND input_type = 'resource' AND resource_type = 'file'
          AND resource_id = ? AND document_source_id IS NULL`,
      [source.id, job.id, ref.id],
    );
  }
  const uniqueIds = [...new Set(documentSourceIds)];
  if (!uniqueIds.length) return { sourceIds: [], statuses: [] };

  let statuses = await getDocumentSourceStatuses({ userId: job.user_id, sourceIds: uniqueIds });
  for (const status of statuses) {
    if (status.sourceType === 'temporary' && status.status === 'awaiting_upload') {
      await confirmTemporaryDocumentSource({ userId: job.user_id, sourceId: status.id });
    }
  }
  statuses = await getDocumentSourceStatuses({ userId: job.user_id, sourceIds: uniqueIds });
  if (statuses.length !== uniqueIds.length) {
    throw toolboxError('TOOLBOX_DOCUMENT_SOURCE_UNAVAILABLE', '部分文件已不存在', 404);
  }
  if (statuses.some((item) => ['awaiting_upload', 'queued', 'parsing'].includes(item.status))) {
    throw new ToolboxDocumentWait();
  }
  const failed = statuses.find((item) => item.status === 'failed');
  if (failed) {
    throw toolboxError(
      String(failed.errorCode || 'TOOLBOX_DOCUMENT_PARSE_FAILED'),
      String(failed.errorMessage || '文件解析失败，请检查文件后重试'),
      400,
    );
  }
  return { sourceIds: uniqueIds, statuses };
}

async function requeueForDocuments(job, workerId, database = pool) {
  await database.query(
    `UPDATE toolbox_jobs
        SET status = 'queued', stage = 'waiting_document', progress = GREATEST(progress, 15),
            available_at = DATE_ADD(NOW(), INTERVAL ? SECOND), locked_at = NULL, locked_by = NULL,
            attempts = GREATEST(attempts - 1, 0)
      WHERE id = ? AND status = 'processing' AND locked_by = ?`,
    [Math.ceil(DOCUMENT_WAIT_MS / 1000), job.id, workerId],
  );
}

async function updateToolboxJobStage(job, workerId, stage, progress, database = pool) {
  const normalizedProgress = Math.max(1, Math.min(99, Math.round(Number(progress) || 1)));
  const [updated] = await database.query(
    `UPDATE toolbox_jobs
        SET stage = ?, progress = GREATEST(progress, ?), locked_at = NOW(), updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND status = 'processing' AND locked_by = ?`,
    [String(stage), normalizedProgress, job.id, workerId],
  );
  if (!updated.affectedRows) throw toolboxError('TOOLBOX_JOB_LEASE_LOST', '任务执行租约已失效', 409);
}

async function markExternalCostCommitted(job, workerId, stage, database = pool) {
  const [updated] = await database.query(
    `UPDATE toolbox_jobs
        SET external_cost_committed = 1, stage = ?, progress = GREATEST(progress, 56),
            locked_at = NOW(), updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND status = 'processing' AND locked_by = ?`,
    [stage, job.id, workerId],
  );
  if (!updated.affectedRows) throw toolboxError('TOOLBOX_JOB_LEASE_LOST', '任务执行租约已失效', 409);
}

function artifactContent(response) {
  const result = response?.result || {};
  return String(result.content || result.markdown || '').trim();
}

function coverageIsPartial(coverage) {
  const warnings = Array.isArray(coverage?.warnings) ? coverage.warnings : [];
  const resources = Array.isArray(coverage?.resources) ? coverage.resources : [];
  return (
    coverage?.complete === false ||
    coverage?.overall?.complete === false ||
    warnings.length > 0 ||
    resources.some((item) => item?.coverage?.complete === false || ['failed', 'no_text'].includes(item?.status))
  );
}

function toolboxAiExecutionOverrides(job) {
  return String(job?.billing_medium || 'points') === 'points'
    ? { executionConfigOverrides: { billingPolicy: 'system', systemId: 'toolbox_points' } }
    : {};
}

async function executeAiTool(job, inputs, identity) {
  const strategy = AI_TOOL_STRATEGIES[job.tool_id];
  if (!strategy) throw toolboxError('TOOLBOX_TOOL_EXECUTOR_MISSING', '工具执行器尚未配置', 500);
  const options = safeJson(job.options_json, {});
  const title = String(options.title || '').trim() || strategy.defaultTitle;
  const response = await executeAiSkill(
    {
      protocolVersion: 1,
      requestId: toolboxAttemptRequestId(job),
      skillId: strategy.skillId,
      skillVersion: 1,
      threadId: null,
      input: {
        title,
        question: String(options.question || '').trim(),
        instruction: toolboxIntentInstruction(job.tool_id, options.intent),
        detailLevel: options.detailLevel || 'balanced',
        ...(options.targetLength ? { targetLength: options.targetLength } : {}),
      },
      scope: { resourceRefs: inputs.resourceRefs },
      client: { locale: 'zh-CN', timezone: 'Asia/Singapore', surface: 'toolbox' },
    },
    {
      user: identity.user,
      billingUser: identity.user,
      resourceUser: identity.user,
      securityRestrictions: identity.restrictions,
      headers: {},
      body: {},
      path: '/toolbox/worker',
      method: 'POST',
      ip: 'toolbox-worker',
    },
    {
      database: pool,
      internalCaller: 'toolbox_worker',
      ...toolboxAiExecutionOverrides(job),
      modelPolicyOverrides: toolboxModelPolicy(job.tool_id, options),
    },
  );
  const content = artifactContent(response);
  if (!content || response?.receipt?.modelCalled === false) {
    throw toolboxError(
      'TOOLBOX_NO_READABLE_CONTENT',
      job.tool_id === 'idea_to_draft'
        ? '本次没有生成可用初稿，未保留本次计费'
        : '所选材料没有足够的可读内容，未保留本次计费',
      400,
    );
  }
  const partial = coverageIsPartial(response.coverage);
  return {
    type: strategy.artifactType,
    title,
    content,
    contentType: 'markdown',
    sources: Array.isArray(response.sources) ? response.sources : [],
    coverage: response.coverage || { complete: false, warnings: ['coverage_missing'] },
    meta: {
      draftState: strategy.draftState,
      sourceCount: Array.isArray(response.sources) ? response.sources.length : 0,
    },
    outcome: partial ? 'partial_succeeded' : 'succeeded',
  };
}

function markdownSafeHeading(value) {
  return String(value || '未命名文件')
    .replace(/[\r\n]+/g, ' ')
    .replace(/#/g, '＃')
    .trim();
}

async function executeOcrTool(job, documentState, database = pool) {
  const sourceIds = documentState.sourceIds;
  const placeholders = sourceIds.map(() => '?').join(',');
  const [rows] = await database.query(
    `SELECT source.id, source.file_name, source.file_type, source.status, source.error_code,
            source.coverage_metadata, chunk.chunk_index, chunk.content, chunk.locator_type, chunk.locator_value
       FROM ai_document_sources source
       LEFT JOIN ai_document_chunks chunk ON chunk.source_id = source.id
      WHERE source.user_id = ? AND source.id IN (${placeholders})
      ORDER BY FIELD(source.id, ${placeholders}), chunk.chunk_index ASC`,
    [job.user_id, ...sourceIds, ...sourceIds],
  );
  const byId = new Map(
    sourceIds.map((id) => [
      id,
      {
        id,
        title: documentState.statuses.find((item) => item.id === id)?.fileName || '未命名文件',
        chunks: [],
      },
    ]),
  );
  for (const row of rows) {
    if (row.content != null) byId.get(String(row.id))?.chunks.push(String(row.content));
  }
  const readable = [...byId.values()].filter((item) => item.chunks.length);
  if (!readable.length) throw toolboxError('TOOLBOX_OCR_EMPTY', '没有识别到可保存的文字，未扣除积分', 400);
  const content = readable
    .map((item) => `# ${markdownSafeHeading(item.title)}\n\n${item.chunks.join('\n\n')}`)
    .join('\n\n---\n\n');
  const partial =
    readable.length !== sourceIds.length ||
    documentState.statuses.some((item) => item.status === 'no_text' || item.coverage?.complete === false);
  const sources = documentState.statuses.map((item) => ({
    id: item.id,
    type: 'file',
    title: item.fileName,
    fileType: item.fileType,
    status: item.status,
  }));
  return {
    type: 'ocr_text',
    title: readable.length === 1 ? `${readable[0].title} · 识别文字` : `OCR 识别结果（${readable.length} 份）`,
    content,
    contentType: 'markdown',
    sources,
    coverage: {
      complete: !partial,
      warnings: partial ? ['部分文件未识别到文字或覆盖不完整'] : [],
      documents: documentState.statuses.map((item) => ({
        sourceId: item.id,
        fileName: item.fileName,
        status: item.status,
        parse: item.coverage,
      })),
    },
    meta: { sourceCount: sourceIds.length, printedTextOnly: true },
    outcome: partial ? 'partial_succeeded' : 'succeeded',
  };
}

async function completeToolboxJob(job, workerId, artifact, database = pool) {
  const connection = await database.getConnection();
  try {
    await connection.beginTransaction();
    const [rows] = await connection.query(
      `SELECT * FROM toolbox_jobs
        WHERE id = ? AND status = 'processing' AND locked_by = ?
        LIMIT 1 FOR UPDATE`,
      [job.id, workerId],
    );
    const current = rows[0];
    if (!current) {
      await connection.rollback();
      return false;
    }
    const artifactId = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + toolboxServiceInternals.ARTIFACT_RETENTION_DAYS * 24 * 60 * 60_000);
    await connection.query(
      `INSERT INTO toolbox_artifacts
        (id, job_id, user_id, tool_id, artifact_type, artifact_version, title, content, content_type,
         source_json, coverage_json, meta_json, status, expires_at)
       VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, 'ready', ?)`,
      [
        artifactId,
        current.id,
        current.user_id,
        current.tool_id,
        artifact.type,
        String(artifact.title || '工具箱产物').slice(0, 255),
        artifact.content,
        artifact.contentType,
        JSON.stringify(artifact.sources || []),
        JSON.stringify(artifact.coverage || {}),
        JSON.stringify(artifact.meta || {}),
        expiresAt,
      ],
    );
    const settlement = await settleToolboxBilling(connection, current, {
      outcome: artifact.outcome,
      reasonCode: artifact.outcome === 'partial_succeeded' ? 'PARTIAL_COVERAGE' : 'DELIVERED',
    });
    await connection.query(
      `UPDATE toolbox_jobs
          SET status = ?, progress = 100, stage = 'completed', artifact_id = ?,
              billing_status = ?, actual_points = ?, completed_at = CURRENT_TIMESTAMP,
              locked_at = NULL, locked_by = NULL, error_code = NULL, error_message = NULL
        WHERE id = ?`,
      [artifact.outcome, artifactId, settlement.billingStatus, settlement.actualPoints, current.id],
    );
    await connection.commit();
    return true;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

function shouldRetryJob(job, error) {
  const code = String(error?.code || '');
  if (Number(job.attempts || 0) >= Number(job.max_attempts || 3)) return false;
  if (
    NON_RETRYABLE_CODES.has(code) ||
    code.startsWith('TOOLBOX_INPUT_') ||
    code.startsWith('AI_SKILL_SCOPE_') ||
    code.startsWith('AI_SKILL_OUTPUT_') ||
    code.startsWith('AI_SKILL_STRUCTURED_OUTPUT_')
  ) {
    return false;
  }
  // 只允许已经被基础设施边界明确分类的网络、Provider、限流与超时错误重跑。
  // 未知 5xx 可能来自持久化、计费或程序契约；此时再次执行模型会扩大外部成本并掩盖根因。
  return RETRYABLE_CODES.has(code) || RETRYABLE_NETWORK_CODE.test(code);
}

async function failOrRetryToolboxJob(job, workerId, error, database = pool) {
  const parsed = safeWorkerError(error);
  const connection = await database.getConnection();
  try {
    await connection.beginTransaction();
    const [rows] = await connection.query(
      `SELECT * FROM toolbox_jobs
        WHERE id = ? AND status = 'processing' AND locked_by = ?
        LIMIT 1 FOR UPDATE`,
      [job.id, workerId],
    );
    const current = rows[0];
    if (!current) {
      await connection.rollback();
      return false;
    }
    if (shouldRetryJob(current, error)) {
      const delay = Math.min(120, 10 * 2 ** Math.max(0, Number(current.attempts || 1) - 1));
      await connection.query(
        `UPDATE toolbox_jobs
            SET status = 'queued', stage = 'retrying', available_at = DATE_ADD(NOW(), INTERVAL ? SECOND),
                locked_at = NULL, locked_by = NULL, error_code = ?, error_message = ?
          WHERE id = ?`,
        [delay, parsed.code, parsed.message, current.id],
      );
      await connection.commit();
      return true;
    }
    const settlement = await settleToolboxBilling(connection, current, {
      outcome: 'failed',
      reasonCode: parsed.code,
    });
    await connection.query(
      `UPDATE toolbox_jobs
          SET status = 'failed', progress = 100, stage = 'failed', billing_status = ?, actual_points = ?,
              completed_at = CURRENT_TIMESTAMP, locked_at = NULL, locked_by = NULL,
              error_code = ?, error_message = ?
        WHERE id = ?`,
      [settlement.billingStatus, settlement.actualPoints, parsed.code, parsed.message, current.id],
    );
    await connection.commit();
    return true;
  } catch (dbError) {
    await connection.rollback();
    throw dbError;
  } finally {
    connection.release();
  }
}

export async function runSingleToolboxJob(workerId, database = pool) {
  const job = await claimNextToolboxJob(workerId, database);
  if (!job) return false;
  if (job.terminalized) return true;
  const leaseOwner = job.locked_by;
  try {
    const artifact = await withToolboxLeaseHeartbeat(
      job,
      leaseOwner,
      async () => {
        const inputs = await loadJobInputs(job.id, database);
        await updateToolboxJobStage(job, leaseOwner, 'validating', 16, database);
        const identity = await loadWorkerIdentity(job.user_id, database);
        await assertResourceVersionsCurrent(job, inputs, database);
        const promptOnly = job.tool_id === 'idea_to_draft';
        await updateToolboxJobStage(job, leaseOwner, promptOnly ? 'preparing_prompt' : 'reading_sources', 28, database);
        let documentState = { sourceIds: [], statuses: [] };
        if (job.tool_id === 'ocr_to_text' || inputs.resourceRefs.some((item) => item.type === 'file')) {
          documentState = await ensureDocumentInputsReady(job, inputs, database);
        }
        await updateToolboxJobStage(job, leaseOwner, promptOnly ? 'prompt_ready' : 'sources_ready', 42, database);
        await markExternalCostCommitted(
          job,
          leaseOwner,
          job.tool_id === 'ocr_to_text' ? 'recognizing' : 'generating',
          database,
        );
        return job.tool_id === 'ocr_to_text'
          ? executeOcrTool(job, documentState, database)
          : executeAiTool(job, inputs, identity);
      },
      database,
    );
    await updateToolboxJobStage(job, leaseOwner, 'preparing_result', 84, database);
    await updateToolboxJobStage(job, leaseOwner, 'saving_result', 94, database);
    await completeToolboxJob(job, leaseOwner, artifact, database);
  } catch (error) {
    if (error instanceof ToolboxDocumentWait || error?.code === 'TOOLBOX_DOCUMENT_WAIT') {
      await requeueForDocuments(job, leaseOwner, database);
    } else {
      await failOrRetryToolboxJob(job, leaseOwner, error, database);
    }
  }
  return true;
}

export async function cleanupExpiredToolboxData(database = pool) {
  await database.query("UPDATE toolbox_quotes SET status = 'expired' WHERE status = 'active' AND expires_at <= NOW()");
  const [expiredJobs] = await database.query(
    `SELECT id, user_id FROM toolbox_jobs
      WHERE status IN ('queued', 'processing') AND expires_at <= NOW()
      ORDER BY expires_at ASC LIMIT 100`,
  );
  let expiredJobCount = 0;
  for (const item of expiredJobs) {
    const connection = await database.getConnection();
    try {
      await connection.beginTransaction();
      const [rows] = await connection.query(
        `SELECT * FROM toolbox_jobs
          WHERE id = ? AND user_id = ? AND status IN ('queued', 'processing')
          LIMIT 1 FOR UPDATE`,
        [item.id, item.user_id],
      );
      const job = rows[0];
      if (!job) {
        await connection.rollback();
        continue;
      }
      const settlement = await settleToolboxBilling(connection, job, {
        outcome: 'expired',
        reasonCode: 'JOB_RETENTION_EXPIRED',
      });
      await connection.query(
        `UPDATE toolbox_jobs SET status = 'expired', progress = 100, stage = 'expired',
            billing_status = ?, actual_points = ?, completed_at = CURRENT_TIMESTAMP,
            locked_at = NULL, locked_by = NULL, error_code = 'TOOLBOX_JOB_EXPIRED',
            error_message = '任务已过期，预占积分已释放'
          WHERE id = ?`,
        [settlement.billingStatus, settlement.actualPoints, job.id],
      );
      await connection.commit();
      expiredJobCount += 1;
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }
  const [expiredArtifacts] = await database.query(
    `UPDATE toolbox_artifacts
        SET status = 'expired', content = '', source_json = NULL, coverage_json = NULL, meta_json = NULL
      WHERE status = 'ready' AND expires_at <= NOW()`,
  );
  return { expiredJobs: expiredJobCount, expiredArtifacts: Number(expiredArtifacts.affectedRows || 0) };
}

export const toolboxWorkerInternals = Object.freeze({
  AI_TOOL_STRATEGIES,
  AI_TOOL_INTENT_INSTRUCTIONS,
  TOOL_SKILLS,
  artifactContent,
  claimNextToolboxJob,
  coverageIsPartial,
  loadJobInputs,
  markdownSafeHeading,
  safeWorkerError,
  shouldRetryJob,
  terminalizeExhaustedToolboxLease,
  toolboxIntentInstruction,
  toolboxAiExecutionOverrides,
  toolboxLeaseOwner,
  toolboxAttemptRequestId,
  toolboxModelPolicy,
  heartbeatToolboxJob,
  withToolboxLeaseHeartbeat,
  TOOLBOX_LEASE_HEARTBEAT_MS,
  updateToolboxJobStage,
});
