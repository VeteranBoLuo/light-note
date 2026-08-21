import { planAgentExecution, buildPlannerTemporalContext } from '../executionPlanner.js';
import { validateExecutionPlan } from '../planValidator.js';
import { runActionTurn } from '../runners/actionRunner.js';
import { runAnswerTurn } from '../runners/answerRunner.js';
import { runConversationTurn } from '../runners/conversationRunner.js';
import { runMixedTurn } from '../runners/mixedRunner.js';
import { RESOURCE_BINDING_ERROR_CODES } from '../executionContext.js';
import { compileAgentTurnSpecV3 } from './intentCompiler.js';
import { digestExecutionContractV3 } from './turnSpec.js';
import { routeTurnSpecCapabilitiesV3 } from './capabilityRouter.js';

const CLARIFICATION_VALIDATION_ISSUES = new Set(['TOOL_ARGUMENT_REQUIRED', ...RESOURCE_BINDING_ERROR_CODES]);

function goalStates(turnSpec, route) {
  const routes = new Map((route?.goalRoutes || []).map((item) => [item.goalId, item]));
  return (turnSpec?.goals || []).map((goal) => {
    const routed = routes.get(goal.id);
    return {
      goalId: goal.id,
      status:
        routed?.status === 'ready' ? (goal.dependsOn.length ? 'deferred' : 'pending') : routed?.status || 'unsupported',
    };
  });
}

function runnerForRequestKind(requestKind) {
  if (requestKind === 'conversation') return runConversationTurn;
  if (['answer', 'product_help'].includes(requestKind)) return runAnswerTurn;
  if (requestKind === 'mixed') return runMixedTurn;
  return runActionTurn;
}

function availableInputKinds({ contextSummary = {}, discourseProjection = {}, groundingPolicy } = {}) {
  const values = new Set(['latest_message']);
  if (Number(contextSummary.selectedResourceCount) > 0) {
    values.add('selected_resource');
    values.add('selected_scope');
  }
  if (groundingPolicy === 'workspace_query') values.add('workspace_query');
  if (
    discourseProjection?.lastResultSet?.available === true ||
    (Array.isArray(discourseProjection?.resultSetCandidates) && discourseProjection.resultSetCandidates.length > 0)
  ) {
    values.add('last_result_refs');
  }
  if (contextSummary.attachmentCount > 0) values.add('selected_resource');
  if (contextSummary.dialogueAnchorAvailable === true) values.add('dialogue_anchor');
  return Object.freeze([...values]);
}

export async function runAgentRuntimeV3({
  message,
  recentDialogue = [],
  catalog,
  tools,
  discourseProjection,
  contextSummary,
  capabilityScope,
  groundingPolicy,
  outputContract,
  completedGoalIds = [],
  dependencyResults = [],
  executionContext = {},
  timeZone,
  now,
  signal,
  traceId,
  request,
  onCompilerResponse,
  onPlannerResponse,
  compiledTurnSpecResult,
  resolveExecutionContext,
  compile = compileAgentTurnSpecV3,
  route = routeTurnSpecCapabilitiesV3,
  plan = planAgentExecution,
} = {}) {
  const actorRole = String(contextSummary?.actorRole || 'user') === 'root' ? 'root' : 'user';
  const temporalContext = buildPlannerTemporalContext({ timeZone, now });
  const compiled =
    compiledTurnSpecResult ||
    (await compile({
      message,
      recentDialogue,
      catalog,
      discourseProjection,
      contextSummary,
      capabilityScope,
      authoritativeGroundingPolicy: groundingPolicy,
      outputContract,
      temporalContext,
      actorRole,
      signal,
      traceId,
      request,
      onResponse: onCompilerResponse,
    }));
  const turnSpec = compiled.turnSpec;
  const semanticDigest = String(turnSpec?.semanticDigest || turnSpec?.digest || '');
  if (turnSpec.confidence === 'low' || turnSpec.missingSlots.length > 0) {
    return {
      runner: 'clarification',
      state: 'clarification',
      turnSpec,
      question: turnSpec.clarificationQuestion,
      goalStates: goalStates(turnSpec, null),
      toolCalls: [],
      semanticDigest,
      executionDigest: null,
    };
  }

  const routed = route({
    turnSpec,
    catalog,
    tools,
    availableInputKinds: availableInputKinds({ contextSummary, discourseProjection, groundingPolicy }),
  });
  if (routed.state === 'clarification') {
    return {
      runner: 'clarification',
      state: 'clarification',
      turnSpec,
      route: routed,
      question: '这个请求包含的独立任务较多，请先说明最希望优先完成哪一项。',
      goalStates: goalStates(turnSpec, routed),
      toolCalls: [],
      semanticDigest,
      executionDigest: null,
    };
  }
  if (routed.state === 'unsupported') {
    return {
      runner: 'unsupported',
      state: 'unsupported',
      turnSpec,
      route: routed,
      goalStates: goalStates(turnSpec, routed),
      toolCalls: [],
      semanticDigest,
      executionDigest: null,
    };
  }

  const resolvedExecutionContext =
    typeof resolveExecutionContext === 'function'
      ? await resolveExecutionContext({ turnSpec, route: routed, executionContext })
      : executionContext;
  const effectiveExecutionContext = resolvedExecutionContext || executionContext;
  const executionDigest = digestExecutionContractV3({
    turnSpec,
    route: routed,
    executionContext: effectiveExecutionContext,
  });

  const runner = runnerForRequestKind(turnSpec.requestKind);
  const outcome = await runner({
    turnSpec,
    route: routed,
    planExecution: () =>
      plan({
        message,
        turnSpec,
        route: routed,
        completedGoalIds,
        dependencyResults,
        executionContext: effectiveExecutionContext,
        timeZone,
        now,
        signal,
        traceId,
        request,
        validate: validateExecutionPlan,
        onResponse: onPlannerResponse,
      }),
  });
  if (
    outcome.state === 'blocked' &&
    outcome.validation?.issues?.some((issue) => CLARIFICATION_VALIDATION_ISSUES.has(issue))
  ) {
    return {
      ...outcome,
      runner: 'clarification',
      state: 'clarification',
      question: '还缺少执行这项请求所需的关键信息，请补充明确的目标或参数。',
      toolCalls: [],
      goalStates: goalStates(turnSpec, routed),
      compilerAttempts: compiled.attempts,
      semanticDigest,
      executionDigest,
    };
  }
  return {
    ...outcome,
    goalStates: goalStates(turnSpec, routed),
    compilerAttempts: compiled.attempts,
    runtimeVersion: '3.0',
    semanticDigest,
    executionDigest,
  };
}

export const __testing = Object.freeze({ availableInputKinds, goalStates, runnerForRequestKind });
