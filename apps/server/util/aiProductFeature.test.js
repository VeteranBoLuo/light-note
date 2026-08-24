import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  assertAiSkillDomainEnabled,
  getAiProductFeatureState,
} from './aiProductFeature.js';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('aiProductFeature', () => {
  it('默认启用模块 Skill，并退役旧万能助手', () => {
    expect(getAiProductFeatureState()).toEqual({
      protocolVersion: 1,
      kernelEnabled: true,
      skills: { note: true, bookmark: true, file: true, todo: true, search: true, help: true },
      archive: { readonly: true },
    });
    expect(assertAiSkillDomainEnabled('file').kernelEnabled).toBe(true);
  });

  it('Kernel 与模块开关必须同时开启', () => {
    vi.stubEnv('AI_SKILL_KERNEL_ENABLED', 'false');
    vi.stubEnv('AI_SKILL_FILE_ENABLED', '1');
    expect(getAiProductFeatureState().skills.file).toBe(false);
    expect(() => assertAiSkillDomainEnabled('file')).toThrowError(/未开放/u);
  });
});
