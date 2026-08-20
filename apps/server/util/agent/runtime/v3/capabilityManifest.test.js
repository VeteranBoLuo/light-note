import { describe, expect, it } from 'vitest';
import tools from '../../tools/index.js';
import {
  AGENT_CAPABILITY_MANIFEST,
  buildAgentV3CapabilityCatalog,
  getAgentV3CapabilityByToolName,
  TOOL_CAPABILITY_MANIFEST,
  validateAgentV3CapabilityManifest,
} from './capabilityManifest.js';

describe('Agent V3 capability manifest', () => {
  it('每个真实注册工具恰好对应一项显式能力，且依赖、风险和必填参数契约完整', () => {
    expect(Object.keys(TOOL_CAPABILITY_MANIFEST)).toHaveLength(tools.length);
    expect(validateAgentV3CapabilityManifest(tools)).toEqual([]);
    expect(new Set(AGENT_CAPABILITY_MANIFEST.map((item) => item.id)).size).toBe(
      AGENT_CAPABILITY_MANIFEST.length,
    );
  });

  it('读网页能力稳定绑定到 read_url，不从工具名或中文描述推断', () => {
    expect(getAgentV3CapabilityByToolName('read_url')).toMatchObject({
      id: 'web.read',
      domains: ['web', 'bookmark'],
      resultKind: 'web_document',
    });
  });

  it('用户显式模块范围只收窄能力，不扩大角色权限', () => {
    const available = new Set(tools.map((tool) => tool.name));
    const todoCatalog = buildAgentV3CapabilityCatalog(tools, {
      availableToolNames: available,
      actorRole: 'user',
      capabilityScope: { domains: ['todo', 'admin'] },
    });
    expect(todoCatalog.some((item) => item.domains.includes('todo'))).toBe(true);
    expect(todoCatalog.some((item) => item.domains.includes('admin'))).toBe(false);

    const rootCatalog = buildAgentV3CapabilityCatalog(tools, {
      availableToolNames: available,
      actorRole: 'root',
      capabilityScope: { domains: ['admin'] },
    });
    expect(rootCatalog.some((item) => item.id === 'admin.user.query' && item.status === 'enabled')).toBe(true);
    expect(rootCatalog.some((item) => item.id === 'admin.mutation' && item.status === 'forbidden')).toBe(true);
  });
});
