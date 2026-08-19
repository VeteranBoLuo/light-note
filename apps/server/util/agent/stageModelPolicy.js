const STAGE_GROUPS = Object.freeze([
  { prefix: 'INTENT', pattern: /^(?:intent_compiler|material_follow_up|note_draft_task)/u },
  { prefix: 'PLANNER', pattern: /^(?:execution_planner|planner|live_smoke)/u },
  { prefix: 'NOTE_DRAFT', pattern: /^(?:note_draft|pending_note_draft)/u },
  { prefix: 'COMPOSER', pattern: /^(?:final|live_smoke_answer|composer)/u },
]);

function clean(value) {
  return String(value || '').trim();
}

export function agentModelStage(stage) {
  const normalized = clean(stage).toLowerCase();
  return STAGE_GROUPS.find((group) => group.pattern.test(normalized))?.prefix || 'DEFAULT';
}

export function resolveAgentStageModelOptions(stage, env = process.env) {
  const group = agentModelStage(stage);
  const providerOverride = clean(env[`AGENT_${group}_PROVIDER`] || env.AGENT_LLM_PROVIDER || 'deepseek');
  const modelOverride = clean(env[`AGENT_${group}_MODEL`]);
  return {
    stageGroup: group.toLowerCase(),
    providerOverride,
    ...(modelOverride ? { modelOverride } : {}),
  };
}
