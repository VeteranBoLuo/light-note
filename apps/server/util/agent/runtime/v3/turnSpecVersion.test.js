import { describe, expect, it } from 'vitest';
import { resolveTurnSpecV3OutputVersion } from './turnSpecVersion.js';

describe('TurnSpec V3 写版本灰度', () => {
  it('shadow 默认写 3.1，enforce 默认保持 3.0', () => {
    expect(resolveTurnSpecV3OutputVersion({ runtimeMode: 'v3_shadow', env: {} })).toBe('3.1');
    expect(resolveTurnSpecV3OutputVersion({ runtimeMode: 'v3_enforce', env: {} })).toBe('3.0');
  });

  it('只接受双读协议内的显式版本，无效配置失败关闭', () => {
    expect(
      resolveTurnSpecV3OutputVersion({
        runtimeMode: 'v3_shadow',
        env: { AI_AGENT_TURN_SPEC_V3_SHADOW_VERSION: '3.0' },
      }),
    ).toBe('3.0');
    expect(
      resolveTurnSpecV3OutputVersion({
        runtimeMode: 'v3_enforce',
        env: { AI_AGENT_TURN_SPEC_V3_ENFORCE_VERSION: '4.0' },
      }),
    ).toBe('3.0');
  });
});
