import { describe, expect, it } from 'vitest';
import { adaptAgentTurnEnvelope } from './turnEnvelope.js';

describe('TurnEnvelope V2 legacy adapter', () => {
  it('显式 refs 永远优先，客户端不能用 grounding 声明扩大范围', () => {
    const envelope = adaptAgentTurnEnvelope({
      contexts: [{ type: 'note', id: 'n1' }],
      followUpMaterials: { contextRefs: [{ type: 'note', id: 'old' }] },
      grounding: { mode: 'workspace' },
    });

    expect(envelope.grounding).toMatchObject({
      mode: 'explicit',
      legacyRequest: false,
      clientModeMismatch: true,
    });
  });

  it('旧客户端按显式、继承候选、工作区和空请求确定性适配', () => {
    expect(adaptAgentTurnEnvelope({ attachmentIds: ['doc-1'] }).grounding.mode).toBe('explicit');
    expect(adaptAgentTurnEnvelope({ followUpMaterials: {} }).grounding.mode).toBe('inherit_candidate');
    expect(adaptAgentTurnEnvelope({ scope: { mode: 'workspace' } }).grounding.mode).toBe('workspace');
    expect(adaptAgentTurnEnvelope({}).grounding).toMatchObject({ mode: 'none', legacyRequest: true });
  });

  it('V2-only 客户端可只发送 grounding 内的引用，适配层仍生成主链输入', () => {
    const envelope = adaptAgentTurnEnvelope({
      grounding: {
        mode: 'explicit',
        contextRefs: [{ type: 'note', id: 'n-v2' }],
        scopeRefs: [{ type: 'note_branch', id: 'b-v2' }],
        attachmentIds: ['d-v2'],
      },
    });
    expect(envelope.grounding).toMatchObject({
      mode: 'explicit',
      contextRefs: [{ type: 'note', id: 'n-v2' }],
      scopeRefs: [{ type: 'note_branch', id: 'b-v2' }],
      attachmentIds: ['d-v2'],
      legacyRequest: false,
      clientModeMismatch: false,
    });
  });

  it('V2 Source Set 请求确定性适配为继承候选，且不需要客户端重传引用', () => {
    const envelope = adaptAgentTurnEnvelope({
      grounding: { mode: 'inherit_candidate', sourceSetId: 'source-set-id' },
    });
    expect(envelope.grounding).toMatchObject({
      mode: 'inherit_candidate',
      sourceSetId: 'source-set-id',
      contextRefs: [],
      scopeRefs: [],
      attachmentIds: [],
      clientModeMismatch: false,
    });
  });

  it('grounding_scope_v2 客户端忽略旧 followUpMaterials，完整新查询保持工作区范围', () => {
    const envelope = adaptAgentTurnEnvelope({
      message: '查看最近 7 天书签的详细链接',
      clientCapabilities: ['grounding_scope_v2'],
      followUpMaterials: {
        contextRefs: [
          { type: 'note', id: 'old-note' },
          { type: 'bookmark', id: 'old-bookmark' },
        ],
      },
      grounding: { mode: 'workspace' },
      scope: { mode: 'workspace' },
    });

    expect(envelope.grounding).toMatchObject({
      mode: 'workspace',
      sourceSetId: '',
      contextRefs: [],
      scopeRefs: [],
      attachmentIds: [],
      clientModeMismatch: false,
    });
  });

  it('会话能力 profile 只接受固定策略枚举', () => {
    expect(adaptAgentTurnEnvelope({ capabilityPolicyProfile: 'read_only' }).capabilityPolicyProfile).toBe('read_only');
    expect(adaptAgentTurnEnvelope({ capabilityPolicyProfile: { profile: 'chat_only' } }).capabilityPolicyProfile).toBe(
      'chat_only',
    );
    expect(adaptAgentTurnEnvelope({ capabilityPolicyProfile: 'execute_everything' }).capabilityPolicyProfile).toBe(
      'auto',
    );
  });
});
