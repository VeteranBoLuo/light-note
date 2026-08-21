import { TURN_SPEC_V3_ACCEPTED_VERSIONS, TURN_SPEC_V3_VERSION } from './turnSpec.js';

const SHADOW_DEFAULT_VERSION = '3.1';

function acceptedVersion(value, fallback) {
  const normalized = String(value || '').trim();
  return TURN_SPEC_V3_ACCEPTED_VERSIONS.includes(normalized) ? normalized : fallback;
}

/**
 * 规格写版本与 Runtime 灰度解耦：shadow 默认观测 3.1，enforce 默认继续写 3.0。
 * 两个开关都失败关闭到各自默认值，避免错误配置把生产执行协议意外升级。
 */
export function resolveTurnSpecV3OutputVersion({ runtimeMode = 'v3_enforce', env = process.env } = {}) {
  if (runtimeMode === 'v3_shadow') {
    return acceptedVersion(env.AI_AGENT_TURN_SPEC_V3_SHADOW_VERSION, SHADOW_DEFAULT_VERSION);
  }
  return acceptedVersion(env.AI_AGENT_TURN_SPEC_V3_ENFORCE_VERSION, TURN_SPEC_V3_VERSION);
}

export const __testing = Object.freeze({ acceptedVersion, SHADOW_DEFAULT_VERSION });
