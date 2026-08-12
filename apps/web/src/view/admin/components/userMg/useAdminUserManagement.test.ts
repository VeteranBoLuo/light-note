import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  adminUserMobileSort,
  adminUserRequestSort,
  createAdminUserActionReceipt,
  normalizeAdminUserListContext,
  readAdminUserListContext,
  saveAdminUserListContext,
} from './useAdminUserManagement';

function createStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  };
}

const translate = (key: string, named: Record<string, string | number> = {}) => {
  const suffix = Object.entries(named)
    .map(([name, value]) => `${name}=${value}`)
    .join(',');
  return suffix ? `${key}(${suffix})` : key;
};

describe('后台用户管理共享任务流', () => {
  it('只恢复合法的列表上下文，并限制搜索内容长度', () => {
    expect(
      normalizeAdminUserListContext({
        search: `  ${'a'.repeat(240)}  `,
        role: 'invalid',
        status: 'invalid',
        activity: 'day7',
        sortField: 'createTime',
        sortOrder: 'asc',
      }),
    ).toEqual({
      search: 'a'.repeat(200),
      role: '',
      status: 'active',
      activity: 'day7',
      sortField: 'createTime',
      sortOrder: 'asc',
    });
  });

  it('按管理员隔离同一标签页内的筛选上下文', () => {
    const storage = createStorage();
    saveAdminUserListContext(
      'root-a',
      {
        search: '山竹',
        role: 'test',
        status: 'all',
        activity: 'inactive30',
        sortField: 'createTime',
        sortOrder: 'asc',
      },
      storage,
    );

    expect(readAdminUserListContext('root-a', storage)).toMatchObject({
      search: '山竹',
      role: 'test',
      status: 'all',
      activity: 'inactive30',
      sortField: 'createTime',
      sortOrder: 'asc',
    });
    expect(readAdminUserListContext('root-b', storage)).toMatchObject({ search: '', status: 'active' });
  });

  it('桌面表头与移动排序使用同一套请求字段', () => {
    expect(adminUserRequestSort('newest')).toEqual({ field: 'createTime', order: 'desc' });
    expect(adminUserRequestSort('leastRecentlyActive')).toEqual({ field: 'lastActiveTime', order: 'asc' });
    expect(adminUserMobileSort({ sortField: 'createTime', sortOrder: 'asc' })).toBe('oldest');
    expect(adminUserMobileSort({ sortField: 'lastActiveTime', sortOrder: 'desc' })).toBe('recentlyActive');
  });

  it('成功回执保留完整请求与审计编号，并显式提示会话清理不确定性', () => {
    const success = createAdminUserActionReceipt(
      'edit',
      { affectedRows: 1, requestId: 'request-full-id', auditId: 'audit-full-id' },
      translate,
    );
    expect(success.tone).toBe('success');
    expect(success.content).toContain('request-full-id');
    expect(success.content).toContain('audit-full-id');
    expect(success.content).toContain('count=1');

    const warning = createAdminUserActionReceipt(
      'disable',
      { affectedRows: 1, requestId: 'request-disable', auditId: 'audit-disable', sessionsRevoked: false },
      translate,
    );
    expect(warning.tone).toBe('warning');
    expect(warning.content).toContain('adminUserManagement.receipt.sessionCleanupPending');
  });

  it('桌面与移动页面共用业务状态，用户详情跳转日志时携带安全返回路径', () => {
    const base = resolve(process.cwd(), 'src/view/admin/components');
    const desktop = readFileSync(resolve(base, 'userMg/UserMg.vue'), 'utf8');
    const mobile = readFileSync(resolve(base, 'userMg/UserMgMobile.vue'), 'utf8');
    const detail = readFileSync(resolve(base, 'userMg/User360Modal.vue'), 'utf8');
    const operationLog = readFileSync(resolve(base, 'operationLog/OperationLog.vue'), 'utf8');

    for (const source of [desktop, mobile]) {
      expect(source).toContain('useAdminUserManagementList');
      expect(source).toContain('useAdminUserOperations');
      expect(source).not.toContain('deleteUserById');
    }
    expect(detail).toContain('closeCurrentMobileOverlayThen(close');
    expect(detail).toContain("const returnTo = bookmark.isMobile ? '/userMg' : '/admin/userMg'");
    expect(operationLog).toContain("value === '/admin/userMg' || value === '/userMg'");
    expect(operationLog).toContain('goBackToUserManagement');
  });
});
