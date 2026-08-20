import { routeTurnSpecCapabilities } from './capabilityRouter.js';
import { planAgentExecution } from './executionPlanner.js';
import { compileAgentTurnSpec } from './intentCompiler.js';
import { validateExecutionPlan } from './planValidator.js';
import { runActionTurn } from './runners/actionRunner.js';
import { runAnswerTurn } from './runners/answerRunner.js';
import { runConversationTurn } from './runners/conversationRunner.js';
import { runMixedTurn } from './runners/mixedRunner.js';
import { RESOURCE_BINDING_ERROR_CODES } from './executionContext.js';

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

export async function runAgentRuntime({
  message,
  history,
  catalog,
  tools,
  contextSummary,
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
  compile = compileAgentTurnSpec,
  route = routeTurnSpecCapabilities,
  plan = planAgentExecution,
} = {}) {
  const compiled =
    compiledTurnSpecResult ||
    (await compile({
      message,
      history,
      domainCatalog: catalog,
      contextSummary,
      authoritativeGroundingPolicy: groundingPolicy,
      outputContract,
      signal,
      traceId,
      request,
      onResponse: onCompilerResponse,
    }));
  const turnSpec = compiled.turnSpec;
  if (turnSpec.confidence === 'low' || turnSpec.missingSlots.length > 0) {
    return {
      runner: 'clarification',
      state: 'clarification',
      turnSpec,
      question: turnSpec.clarificationQuestion,
      goalStates: goalStates(turnSpec, null),
      toolCalls: [],
    };
  }
  const routed = route({
    turnSpec,
    catalog,
    tools,
    message,
    contextTypes: contextSummary?.selectedResourceTypes,
  });
  if (routed.state === 'clarification') {
    return {
      runner: 'clarification',
      state: 'clarification',
      turnSpec,
      route: routed,
      question: '这个请求涉及的能力范围过多，请把最想先完成的一项说得更具体一些。',
      goalStates: goalStates(turnSpec, routed),
      toolCalls: [],
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
    };
  }
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
        executionContext,
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
    };
  }
  return { ...outcome, goalStates: goalStates(turnSpec, routed), compilerAttempts: compiled.attempts };
}

export const __testing = Object.freeze({ goalStates, runnerForRequestKind });
