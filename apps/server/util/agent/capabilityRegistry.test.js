import { describe, expect, it } from 'vitest';
import tools from './tools/index.js';
import {
  AGENT_ACTION_CAPABILITIES,
  buildAgentSemanticCapabilityCatalog,
  ENABLED_AGENT_ACTION_CAPABILITIES,
  getAgentCapabilityByToolName,
  validateAgentCapabilityToolContract,
} from './capabilityRegistry.js';
import { getAgentV3CapabilityByToolName } from './runtime/v3/capabilityManifest.js';

describe('Agent 动作能力注册表', () => {
  it('能力 id 唯一，且只有 enabled 能力可以绑定工具', () => {
    expect(new Set(AGENT_ACTION_CAPABILITIES.map((item) => item.id)).size).toBe(AGENT_ACTION_CAPABILITIES.length);
    for (const capability of AGENT_ACTION_CAPABILITIES) {
      if (capability.status === 'enabled') {
        expect(capability.toolName).toBeTruthy();
        expect(['low', 'medium', 'high']).toContain(capability.riskLevel);
        expect(['default', 'always']).toContain(capability.confirmationPolicy);
      } else {
        expect(capability.toolName).toBeFalsy();
      }
    }
  });

  it('注册写工具与 enabled 能力一一对应，风险和确认策略一致', () => {
    expect(validateAgentCapabilityToolContract(tools)).toEqual([]);
    const writeTools = tools.filter((tool) => tool.isWrite);
    expect(ENABLED_AGENT_ACTION_CAPABILITIES).toHaveLength(writeTools.length);
    for (const tool of writeTools) {
      expect(getAgentCapabilityByToolName(tool.name)).toMatchObject({
        status: 'enabled',
        toolName: tool.name,
        riskLevel: tool.riskLevel,
        confirmationPolicy: tool.confirmationPolicy,
      });
    }
  });

  it('语义能力目录同时覆盖读取工具、可用写能力和未开放动作', () => {
    const catalog = buildAgentSemanticCapabilityCatalog(tools, {
      availableToolNames: new Set([
        'query_notes',
        'set_todo_status',
        'delete_todo',
        'get_checkin_ranking',
        'start_link_health_check',
      ]),
    });

    expect(catalog.find((entry) => entry.id === 'read.query_notes')).toMatchObject({
      effect: 'read',
      status: 'enabled',
      domain: 'note',
      scopePolicy: 'grounding_scope_bound',
      toolNames: ['query_notes'],
    });
    expect(catalog.find((entry) => entry.id === 'todo.status.set')).toMatchObject({
      effect: 'write',
      status: 'enabled',
      domain: 'todo',
      requiredSlots: ['status'],
      scopePolicy: 'confirmation_owner_bound',
      toolNames: ['set_todo_status'],
    });
    expect(catalog.find((entry) => entry.id === 'todo.delete')).toMatchObject({
      effect: 'write',
      status: 'enabled',
      toolNames: ['delete_todo'],
    });
    expect(catalog.find((entry) => entry.id === 'note.delete')).toMatchObject({
      effect: 'write',
      status: 'planned',
      domain: 'note',
      scopePolicy: 'manual_only',
      toolNames: [],
    });
    expect(catalog.find((entry) => entry.id === 'data.permanent_delete')).toMatchObject({
      effect: 'write',
      status: 'forbidden',
      domain: 'content',
      appliesToDomains: ['content', 'note', 'bookmark', 'file', 'todo', 'tag'],
    });
    expect(catalog.find((entry) => entry.id === 'tag.assign')).toMatchObject({
      appliesToDomains: ['tag', 'bookmark', 'note', 'file'],
    });
    expect(catalog.find((entry) => entry.id === 'read.query_bookmarks')).toMatchObject({
      effect: 'read',
      status: 'unavailable',
      toolNames: [],
    });
    expect(catalog.find((entry) => entry.id === 'read.read_url')).toMatchObject({
      domain: 'web',
      appliesToDomains: ['web', 'bookmark'],
      resourceBindingDomains: ['bookmark', 'web'],
    });
    expect(catalog.find((entry) => entry.id === 'read.get_resource_creation_ranking')).toMatchObject({
      effect: 'read',
      status: 'unavailable',
      toolNames: [],
      appliesToDomains: ['admin', 'content', 'note', 'bookmark', 'file'],
      routing: expect.objectContaining({ requireAny: expect.any(Array), preferAny: expect.any(Array) }),
    });
    expect(catalog.find((entry) => entry.id === 'read.query_platform_resources')).toMatchObject({
      appliesToDomains: ['admin', 'content', 'note', 'bookmark', 'file'],
    });
    expect(catalog.find((entry) => entry.id === 'read.query_new_user_resources')).toMatchObject({
      appliesToDomains: ['admin', 'content', 'note', 'bookmark', 'file'],
    });
    expect(catalog.find((entry) => entry.id === 'read.get_checkin_ranking')).toMatchObject({
      effect: 'read',
      status: 'enabled',
      toolNames: ['get_checkin_ranking'],
    });
    expect(catalog.find((entry) => entry.id === 'operation.start_link_health_check')).toMatchObject({
      effect: 'write',
      operations: ['create'],
      scopePolicy: 'owner_bound',
      toolNames: ['start_link_health_check'],
    });
    expect(new Set(catalog.map((entry) => entry.id)).size).toBe(catalog.length);
  });

  it('旧运行链也使用同一能力策略目录，保留精确意图但不暴露受限工具', () => {
    const allToolNames = new Set(tools.map((tool) => tool.name));
    const readOnlyCatalog = buildAgentSemanticCapabilityCatalog(tools, {
      availableToolNames: allToolNames,
      capabilityPolicyProfile: 'read_only',
      resolveCapabilityMetadata: getAgentV3CapabilityByToolName,
    });
    expect(readOnlyCatalog.find((entry) => entry.id === 'todo.status.set')).toMatchObject({
      status: 'policy_blocked',
      policyBlockReason: 'read_only',
      toolNames: [],
    });
    expect(readOnlyCatalog.find((entry) => entry.id === 'read.query_notes')).toMatchObject({
      status: 'enabled',
      toolNames: ['query_notes'],
    });

    const chatOnlyCatalog = buildAgentSemanticCapabilityCatalog(tools, {
      availableToolNames: allToolNames,
      capabilityPolicyProfile: 'chat_only',
      resolveCapabilityMetadata: getAgentV3CapabilityByToolName,
    });
    expect(chatOnlyCatalog.find((entry) => entry.id === 'read.query_notes')).toMatchObject({
      status: 'policy_blocked',
      policyBlockReason: 'chat_only',
      toolNames: [],
    });
    expect(chatOnlyCatalog.find((entry) => entry.id === 'read.search_knowledge_base')).toMatchObject({
      status: 'enabled',
      toolNames: ['search_knowledge_base'],
    });
  });
});
