const DISABLED_VALUES = new Set(['0', 'false', 'off', 'no']);
const ENABLED_VALUES = new Set(['1', 'true', 'on', 'yes']);

function readFlag(name, fallback) {
  const raw = process.env[name];
  if (raw == null || String(raw).trim() === '') return fallback;
  const normalized = String(raw).trim().toLowerCase();
  if (DISABLED_VALUES.has(normalized)) return false;
  if (ENABLED_VALUES.has(normalized)) return true;
  console.warn('[ai-product] invalid feature flag %s; fallback=%s', name, fallback);
  return fallback;
}

const SKILL_FLAGS = Object.freeze({
  note: 'AI_SKILL_NOTE_ENABLED',
  bookmark: 'AI_SKILL_BOOKMARK_ENABLED',
  file: 'AI_SKILL_FILE_ENABLED',
  todo: 'AI_SKILL_TODO_ENABLED',
  search: 'AI_SKILL_SEARCH_ENABLED',
  help: 'AI_SKILL_HELP_ENABLED',
});

export function getAiProductFeatureState() {
  const kernelEnabled = readFlag('AI_SKILL_KERNEL_ENABLED', true);
  const skills = Object.fromEntries(
    Object.entries(SKILL_FLAGS).map(([domain, envName]) => [domain, kernelEnabled && readFlag(envName, true)]),
  );
  return Object.freeze({
    protocolVersion: 1,
    kernelEnabled,
    skills: Object.freeze(skills),
    // 旧会话是用户数据档案，不再是可回滚的产品运行模式。
    archive: Object.freeze({ readonly: true }),
  });
}

export function assertAiSkillDomainEnabled(domain) {
  const state = getAiProductFeatureState();
  if (state.kernelEnabled && state.skills[domain] === true) return state;
  const error = new Error('该模块的 AI 能力当前未开放');
  error.code = state.kernelEnabled ? 'AI_SKILL_DOMAIN_DISABLED' : 'AI_SKILL_KERNEL_DISABLED';
  error.status = 503;
  throw error;
}

export const aiProductFeatureInternals = { readFlag, SKILL_FLAGS };
