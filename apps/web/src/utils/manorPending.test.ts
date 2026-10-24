import { beforeEach, describe, expect, it, vi } from 'vitest';
import { isUncertainManorResult, readPendingManorCommand, savePendingManorCommand } from './manorPending';

describe('庄园未确认结算的安全恢复', () => {
  const request = { requestId: 'request-1234567890', revision: 5, version: 'knowledge-manor-v1', action: 'buySeed', args: ['radish', 2] };
  beforeEach(() => sessionStorage.clear());
  it('按账号隔离，刷新重读仍沿用原请求号、版本和参数', () => {
    savePendingManorCommand('alice', request);
    expect(readPendingManorCommand('alice')).toEqual(request);
    expect(readPendingManorCommand('bob')).toBeNull();
    savePendingManorCommand('bob', { ...request, requestId: 'other-request-1234567890' });
    savePendingManorCommand('alice', null);
    expect(readPendingManorCommand('alice')).toBeNull();
    expect(readPendingManorCommand('bob')?.requestId).toBe('other-request-1234567890');
  });
  it('损坏或越界缓存不当成待结算指令', () => {
    for (const value of ['{', 'null', JSON.stringify({ ...request, revision: -1 }), JSON.stringify({ ...request, args: ['x'.repeat(2049)] })]) {
      sessionStorage.setItem('ln:manor-pending:alice', value);
      expect(readPendingManorCommand('alice')).toBeNull();
    }
  });
  it('仅网络或服务器未知结果保留重放，已明确拒绝的请求可以重新读取状态', () => {
    for (const code of ['OFFLINE', 'REQUEST_TIMEOUT', 'NETWORK_ERROR', 'ECONNRESET']) expect(isUncertainManorResult({ code })).toBe(true);
    expect(isUncertainManorResult({ status: 500 })).toBe(true);
    expect(isUncertainManorResult({ status: 409, code: 'MANOR_REVISION_CONFLICT' })).toBe(false);
    expect(isUncertainManorResult({ status: 403 })).toBe(false);
  });
  it('存储不可用时不影响当前会话内存状态', () => {
    const blocked = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked'); });
    expect(() => savePendingManorCommand('alice', request)).not.toThrow();
    blocked.mockRestore();
  });
});
