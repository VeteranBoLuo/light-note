import {
  AI_SKILL_PROTOCOL_VERSION,
  validateAiSkillRequest,
  validateAiSkillResponse,
} from '@lightnote/shared/ai-skill-protocol';
import { createAiSkillExecutionConfig } from '../aiBillingCatalog.js';
import { runAiExecution } from '../aiExecution/service.js';
import { assertAiSkillDomainEnabled } from '../aiProductFeature.js';
import { resolveAiSkillContext, resolveAiSkillIdentity } from './contextResolver.js';
import { aiSkillError } from './errors.js';
import { callGroundedSkillModel } from './model.js';
import { resolveAiSkill } from './registry.js';
import { appendAiSkillTurn, resolveAiSkillThread } from './threadService.js';
import { buildAiSkillTelemetryDimensions, recordAiSkillTelemetry } from './telemetry.js';

function messagesWithBoundedHistory(messages, history = []) {
  if (!history.length || !Array.isArray(messages) || messages.length < 2) return messages;
  const [system, ...rest] = messages;
  const current = rest.at(-1);
  const prefix = rest.slice(0, -1);
  return [
    system,
    ...prefix,
    {
      role: 'system',
      content:
        '下面是同一 Skill、同一材料范围内的少量对话，只用于理解“它、第二点、继续”等省略表达。历史回答不是事实来源；任何事实都必须重新由本轮证据支持。',
    },
    ...history,
    current,
  ];
}

function resultText(result) {
  if (typeof result?.content === 'string') return result.content;
  return JSON.stringify(result || {});
}

function resolveAiSkillResultOutcome(response) {
  const warningCodes = new Set(
    (Array.isArray(response?.coverage?.warnings) ? response.coverage.warnings : []).map(
      (warning) => String(warning || '').split(':', 1)[0],
    ),
  );
  if (warningCodes.has('image_recognition_fallback')) {
    return { status: 'partial', errorCode: 'IMAGE_RECOGNITION_FALLBACK' };
  }
  if (warningCodes.has('image_recognition_uncertain')) {
    return { status: 'partial', errorCode: 'IMAGE_RECOGNITION_UNCERTAIN' };
  }
  return { status: 'success' };
}

function resolveInternalModelPolicy(modelPolicy = {}, overrides = {}) {
  const resolved = { ...modelPolicy };
  const baseMaxTokens = Number(modelPolicy.maxTokens);
  const requestedMaxTokens = Number(overrides.maxTokens);
  if (Number.isFinite(requestedMaxTokens) && requestedMaxTokens > 0) {
    resolved.maxTokens = Math.trunc(
      Number.isFinite(baseMaxTokens) && baseMaxTokens > 0
        ? Math.min(baseMaxTokens, requestedMaxTokens)
        : requestedMaxTokens,
    );
  }
  const requestedTimeoutMs = Number(overrides.timeoutMs);
  if (Number.isFinite(requestedTimeoutMs) && requestedTimeoutMs > 0) {
    resolved.timeoutMs = Math.min(180_000, Math.max(1_000, Math.trunc(requestedTimeoutMs)));
  }
  return Object.freeze(resolved);
}

export async function executeAiSkill(rawRequest, req, dependencies = {}) {
  const request = validateAiSkillRequest(rawRequest);
  const resolveSkill = dependencies.resolveSkill || resolveAiSkill;
  const assertDomainEnabled = dependencies.assertDomainEnabled || assertAiSkillDomainEnabled;
  const resolveContext = dependencies.resolveContext || resolveAiSkillContext;
  const resolveThread = dependencies.resolveThread || resolveAiSkillThread;
  const appendTurn = dependencies.appendTurn || appendAiSkillTurn;
  const runExecution = dependencies.runExecution || runAiExecution;
  const callModel = dependencies.callModel || callGroundedSkillModel;
  const skill = resolveSkill(request.skillId, request.skillVersion);
  const internalExecutionOverrides = dependencies.executionConfigOverrides || {};
  const telemetryIdentity = resolveAiSkillIdentity(req);
  const telemetryStartedAt = Date.now();
  const recordTelemetry = (event, extra = {}) =>
    recordAiSkillTelemetry({
      recorder: dependencies.recordTelemetry,
      identity: telemetryIdentity,
      event,
      dimensions: {
        ...buildAiSkillTelemetryDimensions({
          skill,
          request,
          durationMs: extra.durationMs,
          response: extra.response,
          error: extra.error,
        }),
        ...(extra.outcome ? { outcome: extra.outcome } : {}),
      },
    });
  void recordTelemetry('ai_skill_started');
  try {
    const internalCaller = String(dependencies.internalCaller || '');
    const allowedInternalCallers = Array.isArray(skill.allowedInternalCallers) ? skill.allowedInternalCallers : [];
    if (
      skill.internalOnly &&
      (internalExecutionOverrides.billingPolicy !== 'system' || !allowedInternalCallers.includes(internalCaller))
    ) {
      throw aiSkillError('AI_SKILL_INTERNAL_ONLY', '该 AI 能力只能由对应的产品流程调用', 403);
    }
    assertDomainEnabled(skill.domain);
    const result = await runExecution(
      createAiSkillExecutionConfig(skill, request, {
        requestId: request.requestId,
        request: req,
        identity: req?.billingUser || req?.user,
        subjectIdentity: req?.resourceUser || req?.user,
        // 是否真正调用模型只能在 Context/prepare 后确定。公开 Skill 默认使用 user 策略，
        // 仅受信任的内部调用方可覆盖为 system；两者都在 Gateway 首次访问 Provider 时懒占位。
        taskType: `skill_${skill.id.replace('.', '_')}`,
        skillVersion: skill.version,
        surface: request.client.surface,
        persistence: dependencies.persistence,
        resolveResultOutcome: resolveAiSkillResultOutcome,
        ...(internalExecutionOverrides.billingPolicy === 'system'
          ? {
              billingPolicy: 'system',
              systemId: String(internalExecutionOverrides.systemId || 'ai_skill_internal').slice(0, 64),
            }
          : {}),
      }),
      async () => {
        const input = skill.validateInput(request.input);
        const context = await resolveContext({ skill, request, req, database: dependencies.database });
        const thread = await resolveThread({ skill, request, context, database: dependencies.database });
        const scopedContext = Object.freeze({
          ...context,
          threadId: thread?.id || null,
          history: thread?.history || Object.freeze([]),
        });
        const prepared = await skill.prepare({
          input,
          context: scopedContext,
          request,
          dependencies: {
            database: dependencies.database,
            signal: dependencies.signal,
            ...(dependencies.skillDependencies || {}),
          },
        });
        const modelCalled = prepared.modelCalled !== false && !prepared.result;
        const sources = prepared.sources || [];
        const coverage = prepared.coverage || { complete: true, warnings: [] };
        const invokeModel = prepared.callModel || callModel;
        const modelResult = prepared.result
          ? null
          : await invokeModel({
              messages: messagesWithBoundedHistory(prepared.messages, scopedContext.history),
              sources,
              coverage,
              modelPolicy: resolveInternalModelPolicy(skill.modelPolicy, dependencies.modelPolicyOverrides),
              outputPolicy: prepared.outputPolicy || {},
              resultValidator: prepared.resultValidator,
              resultRepairInstruction: prepared.resultRepairInstruction,
              signal: dependencies.signal,
              structuredTool: prepared.structuredTool,
              validateArguments: prepared.validateArguments,
              trace: {
                traceId: request.requestId,
                taskType: `skill_${skill.id.replace('.', '_')}`,
                stage: `skill_${skill.id.replace('.', '_')}`,
              },
            });
        const skillResult = prepared.result || (prepared.mapResult ? prepared.mapResult(modelResult) : modelResult);
        const response = validateAiSkillResponse({
          protocolVersion: AI_SKILL_PROTOCOL_VERSION,
          requestId: request.requestId,
          skillId: skill.id,
          skillVersion: skill.version,
          status: skill.effect === 'preview' ? 'preview_ready' : 'completed',
          threadId: thread?.id || null,
          scopeDigest: scopedContext.scopeDigest,
          result: skillResult,
          sources,
          coverage,
          availableActions: prepared.availableActions || [],
          receipt: {
            resourceCount: scopedContext.resourceRefs.length,
            modelCalled,
            writeCommitted: false,
          },
          error: null,
        });
        await appendTurn({
          thread,
          skill,
          context: scopedContext,
          requestId: request.requestId,
          userText: input.question || input.instruction || '',
          assistantText: resultText(skillResult),
          database: dependencies.database,
        });
        return response;
      },
      dependencies.execution || {},
    );
    void recordTelemetry('ai_skill_completed', {
      durationMs: Date.now() - telemetryStartedAt,
      response: result,
      outcome: 'success',
    });
    return result;
  } catch (error) {
    const scopeRejected = String(error?.code || '').startsWith('AI_SKILL_SCOPE_');
    void recordTelemetry(scopeRejected ? 'ai_skill_scope_rejected' : 'ai_skill_failed', {
      durationMs: Date.now() - telemetryStartedAt,
      error,
      outcome: scopeRejected ? 'rejected' : 'failed',
    });
    throw error;
  }
}

export const aiSkillRuntimeInternals = Object.freeze({
  messagesWithBoundedHistory,
  resolveAiSkillResultOutcome,
  resultText,
});
