const MODES = new Set(['disabled', 'shadow', 'enforce']);

/**
 * Phase 2 持久层有独立急停，默认关闭。部署代码或启用 Runtime V3 都不会隐式访问新表；
 * shadow 仅双写审计，enforce 才允许从 MySQL 恢复会话焦点。
 */
export function resolveAgentPersistenceMode(env = process.env) {
  const mode = String(env.AI_AGENT_STATE_PERSISTENCE_MODE || 'disabled')
    .trim()
    .toLowerCase();
  return MODES.has(mode) ? mode : 'disabled';
}

export function shouldWriteAgentPersistentState(mode) {
  return mode === 'shadow' || mode === 'enforce';
}

export function shouldRestoreAgentPersistentState(mode) {
  return mode === 'enforce';
}

export const __testing = Object.freeze({ MODES });
