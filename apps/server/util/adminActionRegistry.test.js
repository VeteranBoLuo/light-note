import { describe, expect, it } from 'vitest';
import {
  ADMIN_ACTION_DEFINITIONS,
  assertRegisteredAdminAction,
  listAdminActionDefinitions,
} from './adminActionRegistry.js';

describe('adminActionRegistry', () => {
  it('动作键唯一且高风险动作要求审计', () => {
    const keys = ADMIN_ACTION_DEFINITIONS.map((item) => item.action);
    expect(new Set(keys).size).toBe(keys.length);
    for (const item of ADMIN_ACTION_DEFINITIONS) {
      expect(item.action).toMatch(/^[a-z][a-z0-9_.]+$/u);
      expect(item.reasonRequired).toBe(true);
      if (['high', 'critical'].includes(item.riskLevel)) expect(item.auditRequired).toBe(true);
    }
  });

  it('未知动作失败关闭', () => {
    expect(() => assertRegisteredAdminAction('unknown.action')).toThrowError(
      expect.objectContaining({ code: 'ADMIN_ACTION_UNREGISTERED' }),
    );
  });

  it('可以按风险筛选', () => {
    expect(listAdminActionDefinitions({ riskLevel: 'critical' }).every((item) => item.riskLevel === 'critical')).toBe(
      true,
    );
  });

  it('安全事件单条、事件簇和批量复核均纳入高风险审计', () => {
    for (const action of ['security.event.review', 'security.cluster.review', 'security.review.batch']) {
      expect(assertRegisteredAdminAction(action)).toMatchObject({
        action,
        riskLevel: 'high',
        reasonRequired: true,
        auditRequired: true,
      });
    }
  });
});
