import { describe, it, expect, vi } from 'vitest';
import { lockOrganizeIdentity, publicOrganizeOptions } from './organizeSuggestionIdentity.js';

function db(actorRole = 'root', subjectRole = 'visitor', disabled = 0) {
  return {
    query: vi.fn(async (_sql, [id]) => [[{ id, role: id === 'admin' ? actorRole : subjectRole, del_flag: disabled }]]),
  };
}
describe('游客整理任务身份', () => {
  it('锁定真实管理员和游客，返回管理员计费身份', async () => {
    const c = db();
    expect(await lockOrganizeIdentity(c, 'guest', { maintenanceActorId: 'admin' })).toMatchObject({
      id: 'admin',
      role: 'root',
    });
    expect(c.query.mock.calls.map(([, args]) => args[0])).toEqual(['admin', 'guest']);
  });
  it.each([
    ['user', 'visitor', 0],
    ['root', 'user', 0],
    ['root', 'visitor', 1],
  ])('拒绝身份或可用状态变化 %s %s %s', async (actor, subject, disabled) => {
    await expect(
      lockOrganizeIdentity(db(actor, subject, disabled), 'guest', { maintenanceActorId: 'admin' }),
    ).rejects.toMatchObject({ code: 'AI_ACCOUNT_UNAVAILABLE' });
  });
  it('游客没有服务端维护身份不能执行', async () => {
    await expect(lockOrganizeIdentity(db(), 'guest', {})).rejects.toMatchObject({ code: 'AI_ACCOUNT_UNAVAILABLE' });
  });
  it('普通用户继续使用本人身份且不额外锁定账号', async () => {
    const c = db('root', 'user');
    expect(await lockOrganizeIdentity(c, 'user', {})).toMatchObject({ id: 'user', role: 'user' });
    expect(c.query).toHaveBeenCalledOnce();
  });
  it('游客可读结果不暴露维护管理员 ID', () => {
    expect(publicOrganizeOptions({ checks: ['tags'], maintenanceActorId: 'admin' })).toEqual({ checks: ['tags'] });
  });
});
