import { describe, expect, it } from 'vitest';
import { resolveAiIdentity } from './aiIdentity.js';

describe('resolveAiIdentity', () => {
  it('普通登录账号的操作者与资源主体一致', () => {
    expect(resolveAiIdentity({ user: { id: 'user-1', role: 'user' } })).toEqual({
      actorUserId: 'user-1',
      actorRole: 'user',
      subjectUserId: 'user-1',
      subjectRole: 'user',
      adminContextId: null,
      adminContextMode: 'normal',
    });
  });

  it('管理员代管时分别使用计费操作者与权威资源主体', () => {
    expect(
      resolveAiIdentity({
        user: { id: 'root-1', role: 'root' },
        billingUser: { id: 'root-1', role: 'root' },
        resourceUser: { id: 'user-2', role: 'user' },
        adminContext: { id: 'context-1', mode: 'readonly' },
      }),
    ).toEqual({
      actorUserId: 'root-1',
      actorRole: 'root',
      subjectUserId: 'user-2',
      subjectRole: 'user',
      adminContextId: 'context-1',
      adminContextMode: 'readonly',
    });
  });

  it('缺少鉴权上下文时稳定回落为 visitor，不读取客户端 body', () => {
    expect(resolveAiIdentity({ body: { userId: 'forged' } })).toEqual({
      actorUserId: 'visitor',
      actorRole: 'visitor',
      subjectUserId: 'visitor',
      subjectRole: 'visitor',
      adminContextId: null,
      adminContextMode: 'normal',
    });
  });
});
