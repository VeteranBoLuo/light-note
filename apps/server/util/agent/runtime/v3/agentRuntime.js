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
import { compileDeterministicAgentWorkflow } from './workflowCompiler.js';
import { fillAgentGoalSlots } from './slotFiller.js';
import { evaluateTurnSpecAmbiguities } from './ambiguityGate.js';

const CLARIFICATION_VALIDATION_ISSUES = new Set(['TOOL_ARGUMENT_REQUIRED', ...RESOURCE_BINDING_ERROR_CODES]);

function goalStates(turnSpec, route, { blockedGoalIds = [] } = {}) {
  const routes = new Map((route?.goalRoutes || []).map((item) => [item.goalId, item]));
  const blocked = new Set(blockedGoalIds);
  return (turnSpec?.goals || []).map((goal) => {
    const routed = routes.get(goal.id);
    return {
      goalId: goal.id,
      status: blocked.has(goal.id)
        ? 'clarification'
        : routed?.status === 'ready'
          ? goal.dependsOn.length
            ? 'deferred'
            : 'pending'
          : routed?.status || 'unsupported',
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
  compileWorkflow = compileDeterministicAgentWorkflow,
  fillSlots = fillAgentGoalSlots,
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
  const ambiguityGate = evaluateTurnSpecAmbiguities(turnSpec);
  if (
    turnSpec.missingSlots.length > 0 ||
    (turnSpec.version !== '3.1' && turnSpec.confidence === 'low') ||
    ambiguityGate.state === 'clarification'
  ) {
    return {
      runner: 'clarification',
      state: 'clarification',
      turnSpec,
      question: ambiguityGate.question || turnSpec.clarificationQuestion,
      goalStates: goalStates(turnSpec, null, { blockedGoalIds: ambiguityGate.blockedGoalIds }),
      toolCalls: [],
      blockedGoalIds: ambiguityGate.blockedGoalIds,
      ambiguityQuestions: ambiguityGate.questions,
      semanticDigest,
      executionDigest: null,
    };
  }
  const planningCompletedGoalIds = [...new Set([...completedGoalIds.map(String), ...ambiguityGate.blockedGoalIds])];

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
      goalStates: goalStates(turnSpec, routed, { blockedGoalIds: ambiguityGate.blockedGoalIds }),
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
      goalStates: goalStates(turnSpec, routed, { blockedGoalIds: ambiguityGate.blockedGoalIds }),
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
    planExecution: async () => {
      const deterministic = compileWorkflow({
        turnSpec,
        route: routed,
        completedGoalIds: planningCompletedGoalIds,
        executionContext: effectiveExecutionContext,
      });
      if (deterministic.applicable) return deterministic;
      // Slot Filler 属于 TurnSpec 3.1 的窄职责阶段。当前生产 Compiler 仍输出 3.0，
      // 不能因为引入新能力而提前改变既有 Planner 的调用次数与语义。
      if (turnSpec.version === '3.1' && deterministic.reason === 'workflow_model_slots_unresolved') {
        const pendingGoals = turnSpec.goals.filter((goal) => !planningCompletedGoalIds.includes(goal.id));
        if (pendingGoals.length === 1) {
          const goal = pendingGoals[0];
          const goalRoute = routed.goalRoutes.find((item) => item.goalId === goal.id);
          const capability =
            goalRoute?.toolNames?.length === 1 ? routed.capabilityByTool.get(goalRoute.toolNames[0]) : null;
          const filled = await fillSlots({
            message,
            goal,
            capability,
            signal,
            traceId,
            request,
            onResponse: onPlannerResponse,
          });
          if (filled.applicable) {
            const compiled = compileWorkflow({
              turnSpec,
              route: routed,
              completedGoalIds: planningCompletedGoalIds,
              executionContext: effectiveExecutionContext,
              slotValuesByGoal: new Map([[goal.id, filled.slotValues]]),
            });
            if (compiled.applicable) {
              return {
                ...compiled,
                attempts: filled.attempts,
                planningMode: 'slot_filler',
              };
            }
          }
        }
      }
      const planned = await plan({
        message,
        turnSpec,
        route: routed,
        completedGoalIds: planningCompletedGoalIds,
        dependencyResults,
        executionContext: effectiveExecutionContext,
        timeZone,
        now,
        signal,
        traceId,
        request,
        validate: validateExecutionPlan,
        onResponse: onPlannerResponse,
      });
      return { ...planned, planningMode: 'planner', deterministicFallbackReason: deterministic.reason };
    },
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
      goalStates: goalStates(turnSpec, routed, { blockedGoalIds: ambiguityGate.blockedGoalIds }),
      compilerAttempts: compiled.attempts,
      semanticDigest,
      executionDigest,
    };
  }
  return {
    ...outcome,
    goalStates: goalStates(turnSpec, routed, { blockedGoalIds: ambiguityGate.blockedGoalIds }),
    blockedGoalIds: ambiguityGate.blockedGoalIds,
    ambiguityQuestions: ambiguityGate.questions,
    compilerAttempts: compiled.attempts,
    runtimeVersion: '3.0',
    semanticDigest,
    executionDigest,
  };
}

export const __testing = Object.freeze({ availableInputKinds, goalStates, runnerForRequestKind });
