import { describe, expect, it } from 'vitest';
import {
  canCreateCleanupJob,
  getInvalidOwnerCleanupGovernanceRules,
  getOperatorReviewGovernanceRules,
  getOwnerStateGovernanceRules,
  resourceGovernanceCleanupEnabled,
} from './registry.js';

describe('resource governance cleanup registry', () => {
  it('清理开关缺失或非明确 true 时失败关闭', () => {
    expect(resourceGovernanceCleanupEnabled({})).toBe(false);
    expect(resourceGovernanceCleanupEnabled({ RESOURCE_GOVERNANCE_CLEANUP_ENABLED: 'yes' })).toBe(false);
    expect(resourceGovernanceCleanupEnabled({ RESOURCE_GOVERNANCE_CLEANUP_ENABLED: 'true' })).toBe(true);
  });

  it('业务孤儿、blocked、review 与非 open finding 都不能进入通用低风险批量清理', () => {
    expect(canCreateCleanupJob({ issueCode: 'OWNER_MISSING', riskLevel: 'review', state: 'open' })).toBe(false);
    expect(canCreateCleanupJob({ issueCode: 'LOCAL_IMAGE_UNREFERENCED', riskLevel: 'blocked', state: 'open' })).toBe(
      false,
    );
    expect(canCreateCleanupJob({ issueCode: 'LOCAL_IMAGE_UNREFERENCED', riskLevel: 'safe', state: 'queued' })).toBe(
      false,
    );
    expect(canCreateCleanupJob({ issueCode: 'LOCAL_IMAGE_UNREFERENCED', riskLevel: 'safe', state: 'open' })).toBe(true);
  });

  it('人工复核队列只包含需要管理员决策的治理规则', () => {
    const rules = getOperatorReviewGovernanceRules();
    expect(rules.map((rule) => rule.issueCode)).toEqual(['OWNER_MISSING', 'FORMALLY_DELETED_OWNER_HAS_RESOURCES']);
    expect(rules.every((rule) => rule.operatorReviewSeverity === 'high')).toBe(true);
  });

  it('账号状态展示与清理授权都由注册表提供，历史误报只有展示兼容', () => {
    expect(getOwnerStateGovernanceRules().map((rule) => rule.issueCode)).toEqual([
      'OWNER_MISSING',
      'SOFT_DELETED_OWNER_HAS_RESOURCES',
      'FORMALLY_DELETED_OWNER_HAS_RESOURCES',
      'ACCOUNT_DELETION_STALLED',
    ]);
    expect(getInvalidOwnerCleanupGovernanceRules().map((rule) => rule.issueCode)).toEqual([
      'OWNER_MISSING',
      'FORMALLY_DELETED_OWNER_HAS_RESOURCES',
      'ACCOUNT_DELETION_STALLED',
    ]);
  });
});
