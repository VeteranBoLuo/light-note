import { describe, expect, it } from 'vitest';
import tools from './tools/index.js';
import {
  AGENT_ACTION_CAPABILITIES,
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
});
