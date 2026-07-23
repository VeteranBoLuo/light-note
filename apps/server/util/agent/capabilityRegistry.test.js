import { describe, expect, it } from 'vitest';
import tools from './tools/index.js';
import {
  AGENT_ACTION_CAPABILITIES,
  buildAgentSemanticCapabilityCatalog,
  ENABLED_AGENT_ACTION_CAPABILITIES,
  getAgentCapabilityByToolName,
  validateAgentCapabilityToolContract,
} from './capabilityRegistry.js';

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
      availableToolNames: new Set(['query_notes', 'set_todo_status']),
    });

    expect(catalog.find((entry) => entry.id === 'read.query_notes')).toMatchObject({
      effect: 'read',
      status: 'enabled',
      toolNames: ['query_notes'],
    });
    expect(catalog.find((entry) => entry.id === 'todo.status.set')).toMatchObject({
      effect: 'write',
      status: 'enabled',
      toolNames: ['set_todo_status'],
    });
    expect(catalog.find((entry) => entry.id === 'note.delete')).toMatchObject({
      effect: 'write',
      status: 'planned',
      toolNames: [],
    });
    expect(catalog.find((entry) => entry.id === 'read.query_bookmarks')).toMatchObject({
      effect: 'read',
      status: 'unavailable',
      toolNames: [],
    });
    expect(new Set(catalog.map((entry) => entry.id)).size).toBe(catalog.length);
  });
});
