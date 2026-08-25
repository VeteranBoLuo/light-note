import { describe, expect, it, vi } from 'vitest';
import { AI_SKILL_AUTHENTICATED_ROLES } from './accessPolicy.js';
import { resolveAiSkillContext } from './contextResolver.js';

const skill = Object.freeze({
  id: 'file.ask',
  version: 1,
  allowedRoles: AI_SKILL_AUTHENTICATED_ROLES,
  contextPolicy: Object.freeze({
    resourceTypes: ['file'],
    minResources: 1,
    maxResources: 1,
  }),
});

function request(resourceRefs) {
  return { scope: { resourceRefs } };
}

function authenticatedRequest(overrides = {}) {
  return {
    user: { id: 'user-1', role: 'user' },
    billingUser: { id: 'actor-1', role: 'root' },
    resourceUser: { id: 'user-1', role: 'user' },
    adminContext: { id: 'context-1', mode: 'maintain' },
    ...overrides,
  };
}

describe('resolveAiSkillContext', () => {
  it('以 subject owner 重读客户端候选资源，并生成绑定版本的稳定摘要', async () => {
    const resolveResourceVersions = vi
      .fn()
      .mockResolvedValue([{ type: 'file', id: 'file-1', version: '2026-08-23T12:00:00.000Z' }]);

    const context = await resolveAiSkillContext({
      skill,
      request: request([{ type: 'file', id: 'file-1', version: '2026-08-23T12:00:00.000Z' }]),
      req: authenticatedRequest(),
      resolveResourceVersions,
    });

    expect(resolveResourceVersions).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        resourceRefs: [{ type: 'file', id: 'file-1', version: expect.any(String) }],
      }),
    );
    expect(context.identity).toMatchObject({
      actorUserId: 'actor-1',
      actorRole: 'root',
      subjectUserId: 'user-1',
      adminContextMode: 'maintain',
      adminContextId: 'context-1',
    });
    expect(context.resourceRefs).toEqual([{ type: 'file', id: 'file-1', version: '2026-08-23T12:00:00.000Z' }]);
    expect(context.scopeDigest).toMatch(/^[a-f0-9]{64}$/u);
  });

  it('scopeDigest 绑定管理员授权上下文，材料相同也不会跨上下文复用', async () => {
    const resolveResourceVersions = vi.fn().mockResolvedValue([{ type: 'file', id: 'file-1', version: 'v1' }]);
    const first = await resolveAiSkillContext({
      skill,
      request: request([{ type: 'file', id: 'file-1' }]),
      req: authenticatedRequest({ adminContext: { id: 'context-1', mode: 'maintain' } }),
      resolveResourceVersions,
    });
    const second = await resolveAiSkillContext({
      skill,
      request: request([{ type: 'file', id: 'file-1' }]),
      req: authenticatedRequest({ adminContext: { id: 'context-2', mode: 'maintain' } }),
      resolveResourceVersions,
    });
    expect(first.scopeDigest).not.toBe(second.scopeDigest);
  });

  it('资源缺失或不属于当前 subject 时失败关闭', async () => {
    await expect(
      resolveAiSkillContext({
        skill,
        request: request([{ type: 'file', id: 'file-1' }]),
        req: authenticatedRequest(),
        resolveResourceVersions: vi.fn().mockResolvedValue([]),
      }),
    ).rejects.toMatchObject({ code: 'AI_SKILL_SCOPE_RESOURCE_UNAVAILABLE', status: 404 });
  });

  it('客户端声明的资源版本过期时拒绝继续使用旧正文', async () => {
    await expect(
      resolveAiSkillContext({
        skill,
        request: request([{ type: 'file', id: 'file-1', version: 'old-version' }]),
        req: authenticatedRequest(),
        resolveResourceVersions: vi.fn().mockResolvedValue([{ type: 'file', id: 'file-1', version: 'new-version' }]),
      }),
    ).rejects.toMatchObject({ code: 'AI_SKILL_SCOPE_STALE', status: 409 });
  });

  it('角色、资源类型和资源数量都由 Skill 声明约束', async () => {
    await expect(
      resolveAiSkillContext({
        skill,
        request: request([{ type: 'file', id: 'file-1' }]),
        req: authenticatedRequest({ billingUser: { id: 'visitor', role: 'visitor' } }),
      }),
    ).rejects.toMatchObject({ code: 'AI_SKILL_ROLE_FORBIDDEN', status: 403 });

    await expect(
      resolveAiSkillContext({
        skill,
        request: request([{ type: 'note', id: 'note-1' }]),
        req: authenticatedRequest(),
      }),
    ).rejects.toMatchObject({ code: 'AI_SKILL_SCOPE_TYPE_FORBIDDEN', status: 403 });

    await expect(
      resolveAiSkillContext({ skill, request: request([]), req: authenticatedRequest() }),
    ).rejects.toMatchObject({ code: 'AI_SKILL_SCOPE_SIZE_INVALID' });
  });

  it('test 只作为内部统计账号隐藏，产品 AI 权限与 user 一致', async () => {
    const resolveResourceVersions = vi.fn().mockResolvedValue([{ type: 'file', id: 'file-1', version: 'v1' }]);

    await expect(
      resolveAiSkillContext({
        skill,
        request: request([{ type: 'file', id: 'file-1' }]),
        req: authenticatedRequest({
          user: { id: 'test-1', role: 'test' },
          billingUser: { id: 'test-1', role: 'test' },
          resourceUser: { id: 'test-1', role: 'test' },
          adminContext: null,
        }),
        resolveResourceVersions,
      }),
    ).resolves.toMatchObject({
      identity: { actorUserId: 'test-1', actorRole: 'test', subjectUserId: 'test-1' },
    });
    expect(resolveResourceVersions).toHaveBeenCalledWith(expect.objectContaining({ userId: 'test-1' }));
  });
});
