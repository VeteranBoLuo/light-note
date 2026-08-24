const STAGE_GROUPS = Object.freeze([
  { prefix: 'VISION', pattern: /^(?:image_recognition|vision)/u },
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
  // 视觉模型与通用文本 Provider 隔离。全局紧急切到千问时，不能把带图片的请求误发给文本模型。
  const providerOverride = clean(
    env[`AGENT_${group}_PROVIDER`] || (group === 'VISION' ? 'deepseek' : env.AGENT_LLM_PROVIDER || 'deepseek'),
  );
  const modelOverride = clean(
    env[`AGENT_${group}_MODEL`] ||
      (group === 'VISION' && providerOverride === 'deepseek'
        ? env.DEEPSEEK_VISION_MODEL || 'deepseek-v4-flash-vision-exp'
        : ''),
  );
  return {
    stageGroup: group.toLowerCase(),
    providerOverride,
    ...(modelOverride ? { modelOverride } : {}),
  };
}
