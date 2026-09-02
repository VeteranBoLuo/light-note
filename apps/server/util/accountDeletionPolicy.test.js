import { describe, expect, it } from 'vitest';
import {
  ACCOUNT_RESOURCE_CLEANUP_STATE,
  classifyAccountResourceCleanup,
  isAccountDeletionRequestStalled,
} from './accountDeletionPolicy.js';

describe('账号资源清理政策', () => {
  it('只允许所属账号不存在或已经正式注销的资源进入物理清理', () => {
    expect(classifyAccountResourceCleanup(null)).toEqual({
      state: ACCOUNT_RESOURCE_CLEANUP_STATE.MISSING,
      eligible: true,
    });
    expect(classifyAccountResourceCleanup({ role: 'deleted', del_flag: 1 })).toEqual({
      state: ACCOUNT_RESOURCE_CLEANUP_STATE.FORMALLY_DELETED,
      eligible: true,
    });
    expect(classifyAccountResourceCleanup({ role: 'user', del_flag: 1 })).toEqual({
      state: ACCOUNT_RESOURCE_CLEANUP_STATE.DISABLED,
      eligible: false,
    });
    expect(classifyAccountResourceCleanup({ role: 'user', del_flag: 0 })).toEqual({
      state: ACCOUNT_RESOURCE_CLEANUP_STATE.ACTIVE,
      eligible: false,
    });
    expect(classifyAccountResourceCleanup({ role: 'deleted', del_flag: 0 })).toEqual({
      state: ACCOUNT_RESOURCE_CLEANUP_STATE.INCONSISTENT,
      eligible: false,
    });
  });

  it('统一识别等待重试、超时 processing 与缺少开始时间的异常任务', () => {
    const now = new Date('2026-09-02T12:00:00.000Z');
    expect(isAccountDeletionRequestStalled({ status: 'retry_wait' }, { now })).toBe(true);
    expect(
      isAccountDeletionRequestStalled(
        { status: 'processing', processing_started_at: '2026-09-02T11:44:59.000Z' },
        { now },
      ),
    ).toBe(true);
    expect(isAccountDeletionRequestStalled({ status: 'processing', processing_started_at: null }, { now })).toBe(true);
    expect(
      isAccountDeletionRequestStalled(
        { status: 'processing', processing_started_at: '2026-09-02T11:50:00.000Z' },
        { now },
      ),
    ).toBe(false);
    expect(isAccountDeletionRequestStalled({ status: 'completed' }, { now })).toBe(false);
  });
});
