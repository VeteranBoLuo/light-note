#!/usr/bin/env node
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildAgentV3CapabilityCatalog,
  getAgentV3CapabilityById,
} from '../../util/agent/runtime/v3/capabilityManifest.js';
import { routeTurnSpecCapabilitiesV3 } from '../../util/agent/runtime/v3/capabilityRouter.js';
import { normalizeTurnSpecV3 } from '../../util/agent/runtime/v3/turnSpec.js';
import { compileDeterministicAgentWorkflow } from '../../util/agent/runtime/v3/workflowCompiler.js';

export const TURN_SPEC_V3_OFFLINE_CASES = Object.freeze([
  Object.freeze({ id: 'product-help', capabilityId: 'product_help.search', claims: { query: '如何创建笔记' } }),
  Object.freeze({ id: 'note-list', capabilityId: 'note.query', claims: { keyword: null } }),
  Object.freeze({ id: 'bookmark-list', capabilityId: 'bookmark.query', claims: { keyword: null, tag: null } }),
  Object.freeze({
    id: 'todo-list',
    capabilityId: 'todo.query',
    claims: { status: 'pending', keyword: null, sort: 'smart' },
  }),
  Object.freeze({ id: 'file-list', capabilityId: 'file.query', claims: { keyword: null } }),
  Object.freeze({ id: 'tag-list', capabilityId: 'tag.query', claims: {} }),
  Object.freeze({ id: 'account-profile', capabilityId: 'account.profile.read', claims: {} }),
]);

function modelSlotSchema(capability) {
  const properties = {};
  const required = [];
  for (const slot of capability.slots || []) {
    if (!['model_text', 'model_enum'].includes(slot.source)) continue;
    properties[slot.name] =
      slot.source === 'model_enum'
        ? { type: 'string', enum: slot.enum }
        : { type: 'string', maxLength: slot.maxLength || 1_000 };
    if (slot.required) required.push(slot.name);
  }
  return {
    type: 'object',
    additionalProperties: false,
    properties,
    ...(required.length ? { required } : {}),
  };
}

function syntheticTool(capability) {
  return Object.freeze({
    name: capability.toolName,
    description: capability.compilerDescription || capability.label,
    parameters: modelSlotSchema(capability),
    isWrite: capability.effect === 'write',
  });
}

function rawTurnSpec(smokeCase, capability, groundingPolicy) {
  return {
    version: '3.1',
    requestKind: capability.effect === 'read' ? 'answer' : 'action',
    confidence: 'high',
    continuationMode: 'independent',
    topicEpochAction: 'advance',
    goals: [
      {
        id: smokeCase.id,
        capabilityId: capability.id,
        operation: capability.operations[0],
        description: capability.label,
        targetDescription: capability.label,
        dependsOn: [],
        referentSelectors: [],
        relation: 'new_topic',
        evidencePolicy: { kind: groundingPolicy, goalIds: [] },
        slotClaims: smokeCase.claims,
        temporalClaims: [],
        outputContract: null,
        ambiguities: [],
      },
    ],
    groundingPolicy,
    temporalConstraints: [],
    missingSlots: [],
    clarificationQuestion: '',
  };
}

export function evaluateTurnSpecV3OfflineCase(smokeCase) {
  const capability = getAgentV3CapabilityById(smokeCase.capabilityId);
  if (!capability?.toolName) return { id: smokeCase.id, passed: false, reason: 'capability_missing' };
  const tool = syntheticTool(capability);
  const catalog = buildAgentV3CapabilityCatalog([tool], {
    availableToolNames: new Set([tool.name]),
    actorRole: 'user',
  });
  const groundingPolicy = capability.scopePolicy === 'public_product' ? 'general_knowledge' : 'workspace_query';
  const turnSpec = normalizeTurnSpecV3(rawTurnSpec(smokeCase, capability, groundingPolicy), {
    catalog,
    authoritativeGroundingPolicy: groundingPolicy,
    latestMessage: capability.label,
    actorRole: 'user',
  });
  if (!turnSpec) return { id: smokeCase.id, passed: false, reason: 'turn_spec_invalid' };
  const route = routeTurnSpecCapabilitiesV3({
    turnSpec,
    catalog,
    tools: [tool],
    availableInputKinds: ['latest_message', 'workspace_query'],
  });
  if (route.state !== 'ready') return { id: smokeCase.id, passed: false, reason: `route_${route.reason}` };
  const compiled = compileDeterministicAgentWorkflow({ turnSpec, route });
  return {
    id: smokeCase.id,
    capabilityId: capability.id,
    passed: compiled.applicable === true && compiled.planningMode === 'deterministic',
    reason: compiled.applicable ? 'deterministic' : compiled.reason,
    planningMode: compiled.planningMode || 'planner',
    toolCallCount: compiled.validation?.toolCalls?.length || 0,
  };
}

export function runTurnSpecV3OfflineEvaluation(cases = TURN_SPEC_V3_OFFLINE_CASES) {
  const results = cases.map(evaluateTurnSpecV3OfflineCase);
  const deterministicCount = results.filter((item) => item.passed).length;
  const total = results.length;
  return Object.freeze({
    passed: total > 0 && deterministicCount === total,
    runtime: 'turn_spec_v3_offline',
    modelCalls: 0,
    databaseQueries: 0,
    businessToolsExecuted: 0,
    total,
    deterministicCount,
    fastPathRate: total ? deterministicCount / total : 0,
    plannerFallbackRate: total ? (total - deterministicCount) / total : 0,
    results: Object.freeze(results),
  });
}

export function formatTurnSpecV3OfflineReport(report) {
  return [
    `TurnSpec V3 离线门禁：${report.passed ? '通过' : '未通过'}`,
    `高频查询 fast-path：${report.deterministicCount}/${report.total}（${(report.fastPathRate * 100).toFixed(0)}%）`,
    `Planner fallback：${(report.plannerFallbackRate * 100).toFixed(0)}%`,
    `模型调用 ${report.modelCalls}，数据库查询 ${report.databaseQueries}，业务工具执行 ${report.businessToolsExecuted}`,
    ...report.results.filter((item) => !item.passed).map((item) => `${item.id}: ${item.reason}`),
  ].join('\n');
}

const isCliEntry = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isCliEntry) {
  const report = runTurnSpecV3OfflineEvaluation();
  process.stdout.write(`${formatTurnSpecV3OfflineReport(report)}\n`);
  process.exit(report.passed ? 0 : 1);
}
