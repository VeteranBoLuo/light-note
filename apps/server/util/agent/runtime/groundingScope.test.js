import { describe, expect, it } from 'vitest';
import {
  buildDiscourseProjection,
  GROUNDING_SCOPE_MODE,
  inspectGroundingSubset,
  isGroundingScopeV2Enabled,
  resolveGroundingScope,
  selectGroundedAnswerMessages,
} from './groundingScope.js';

describe('GroundingScope V2', () => {
  it('生产默认关闭并支持显式急停、Root、测试账号和稳定百分比灰度', () => {
    expect(isGroundingScopeV2Enabled({ userId: 'u1', env: { NODE_ENV: 'production' } })).toBe(false);
    expect(isGroundingScopeV2Enabled({ userId: 'u1', userRole: 'root', env: { NODE_ENV: 'production' } })).toBe(true);
    expect(
      isGroundingScopeV2Enabled({
        userId: 'u1',
        userRole: 'root',
        env: { NODE_ENV: 'production', AI_GROUNDING_SCOPE_V2_ENABLED: 'false' },
      }),
    ).toBe(false);
    expect(
      isGroundingScopeV2Enabled({
        userId: 'u1',
        env: { NODE_ENV: 'production', AI_GROUNDING_SCOPE_V2_TEST_USER_IDS: 'u1' },
      }),
    ).toBe(true);
  });

  it('显式请求只允许 owner 校验后的本轮 refs，且去重', () => {
    const scope = resolveGroundingScope({
      requestedMode: 'explicit',
      resolvedContexts: {
        sources: [
          { type: 'note', id: 'n1', content: 'secret' },
          { type: 'note', id: 'n1' },
        ],
        allowedWebUrls: ['https://example.com/a'],
      },
      resolvedAttachments: { sources: [{ type: 'document', id: 'd1' }] },
      resolvedScopes: { noteIds: ['n2'] },
      sourceSetId: 'set-explicit',
    });

    expect(scope).toMatchObject({
      mode: GROUNDING_SCOPE_MODE.CURRENT_EXPLICIT_ONLY,
      generalKnowledgeAllowed: false,
      allowExternalWeb: false,
      sourceSetId: 'set-explicit',
    });
    expect(scope.allowedRefs).toEqual([
      { type: 'note', id: 'n1' },
      { type: 'document', id: 'd1' },
      { type: 'note', id: 'n2' },
    ]);
  });

  it('公开来源必须是 allowedRefs 子集，显式书签派生网页只按 URL 白名单放行', () => {
    const scope = {
      mode: GROUNDING_SCOPE_MODE.CURRENT_EXPLICIT_ONLY,
      allowedRefs: [{ type: 'note', id: 'n1' }],
      allowedWebUrls: ['https://example.com/a'],
    };
    const result = inspectGroundingSubset(
      [
        { type: 'note', id: 'n1' },
        { type: 'note', id: 'old' },
        { type: 'web', id: 'https://example.com/a', url: 'https://example.com/a' },
      ],
      scope,
    );
    expect(result.valid).toBe(false);
    expect(result.allowed).toHaveLength(2);
    expect(result.violations).toEqual([{ type: 'note', id: 'old' }]);
  });

  it('grounded answer 丢弃旧事实正文，DiscourseProjection 不复制正文', () => {
    const messages = [
      { role: 'system', content: 'system' },
      { role: 'user', content: '旧问题' },
      { role: 'assistant', content: 'OLD_ONLY_FACT' },
      { role: 'user', content: '当前问题 NEW_ONLY_FACT' },
    ];
    const projected = selectGroundedAnswerMessages({
      messages,
      historyMessageCount: 2,
      groundingScope: { mode: GROUNDING_SCOPE_MODE.CURRENT_EXPLICIT_ONLY },
      enabled: true,
    });
    expect(projected).toEqual([{ role: 'user', content: '当前问题 NEW_ONLY_FACT' }]);
    expect(JSON.stringify(buildDiscourseProjection(messages.slice(1, 3)))).not.toContain('OLD_ONLY_FACT');
  });

  it('Source Set 继承形成独立 GroundingScope，并同样隔离旧事实正文', () => {
    const scope = resolveGroundingScope({
      requestedMode: 'inherit_candidate',
      inheritedDecision: 'continue_with_materials',
      sourceSetId: 'set-1',
      resolvedContexts: { sources: [{ type: 'note', id: 'n1' }] },
      resolvedAttachments: { sources: [] },
      resolvedScopes: { noteIds: [] },
    });
    expect(scope).toMatchObject({
      mode: GROUNDING_SCOPE_MODE.INHERITED_SOURCE_SET,
      sourceSetId: 'set-1',
      allowedRefs: [{ type: 'note', id: 'n1' }],
      generalKnowledgeAllowed: false,
    });
    const projected = selectGroundedAnswerMessages({
      messages: [
        { role: 'system', content: 'system' },
        { role: 'assistant', content: 'OLD_ONLY_FACT' },
        { role: 'user', content: '继续总结' },
      ],
      historyMessageCount: 1,
      groundingScope: scope,
      enabled: true,
    });
    expect(JSON.stringify(projected)).not.toContain('OLD_ONLY_FACT');
  });
});
