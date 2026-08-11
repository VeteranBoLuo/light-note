import { describe, expect, it } from 'vitest';
import { canCreateCleanupJob, resourceGovernanceCleanupEnabled } from './registry.js';

describe('resource governance cleanup registry', () => {
  it('清理开关缺失或非明确 true 时失败关闭', () => {
    expect(resourceGovernanceCleanupEnabled({})).toBe(false);
    expect(resourceGovernanceCleanupEnabled({ RESOURCE_GOVERNANCE_CLEANUP_ENABLED: 'yes' })).toBe(false);
    expect(resourceGovernanceCleanupEnabled({ RESOURCE_GOVERNANCE_CLEANUP_ENABLED: 'true' })).toBe(true);
  });

  it('业务孤儿、blocked、review 与非 open finding 都没有清理授权', () => {
    expect(canCreateCleanupJob({ issueCode: 'OWNER_MISSING', riskLevel: 'review', state: 'open' })).toBe(false);
    expect(canCreateCleanupJob({ issueCode: 'LOCAL_IMAGE_UNREFERENCED', riskLevel: 'blocked', state: 'open' })).toBe(
      false,
    );
    expect(canCreateCleanupJob({ issueCode: 'LOCAL_IMAGE_UNREFERENCED', riskLevel: 'safe', state: 'queued' })).toBe(
      false,
    );
    expect(canCreateCleanupJob({ issueCode: 'LOCAL_IMAGE_UNREFERENCED', riskLevel: 'safe', state: 'open' })).toBe(true);
  });
});
