import { describe, expect, it } from 'vitest';
import tools from '../../tools/index.js';
import {
  AGENT_CAPABILITY_MANIFEST,
  buildAgentV3CapabilityCatalog,
  capabilityProducesAgentV3Artifact,
  getAgentV3CapabilityByToolName,
  normalizeCapabilityScope,
  TOOL_CAPABILITY_MANIFEST,
  validateAgentV3CapabilityManifest,
} from './capabilityManifest.js';

describe('Agent V3 capability manifest', () => {
  it('能力产物判断对未知能力安全返回 false', () => {
    expect(capabilityProducesAgentV3Artifact(null)).toBe(false);
    expect(capabilityProducesAgentV3Artifact({ artifactKind: 'none' })).toBe(false);
    expect(capabilityProducesAgentV3Artifact({ artifactKind: 'note' })).toBe(true);
  });

  it('每个真实注册工具恰好对应一项显式能力，且依赖、风险和必填参数契约完整', () => {
    expect(Object.keys(TOOL_CAPABILITY_MANIFEST)).toHaveLength(tools.length);
    expect(validateAgentV3CapabilityManifest(tools)).toEqual([]);
    expect(new Set(AGENT_CAPABILITY_MANIFEST.map((item) => item.id)).size).toBe(AGENT_CAPABILITY_MANIFEST.length);
  });

  it('Manifest 3.1 为必填参数声明唯一 slot source，并只向模型开放 text/enum 槽', () => {
    for (const capability of Object.values(TOOL_CAPABILITY_MANIFEST)) {
      for (const required of capability.requiredSlots) {
        expect(capability.slots.filter((slot) => slot.name === required)).toHaveLength(1);
      }
    }
    expect(getAgentV3CapabilityByToolName('query_notes')?.slots).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'keyword', source: 'model_text', maxLength: 200 }),
        expect.objectContaining({ name: 'timeRange', source: 'temporal' }),
        expect.objectContaining({ name: 'user', source: 'server_scope' }),
      ]),
    );
    expect(getAgentV3CapabilityByToolName('read_url')?.slots).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: 'url', source: 'resource_binding', required: true })]),
    );
  });

  it('读网页能力稳定绑定到 read_url，不从工具名或中文描述推断', () => {
    expect(getAgentV3CapabilityByToolName('read_url')).toMatchObject({
      id: 'web.read',
      domains: ['web', 'bookmark'],
      resultKind: 'web_document',
    });
  });

  it('模块范围依据产出域与显式来源域做通用闭包，不依赖固定问法', () => {
    const available = new Set(tools.map((tool) => tool.name));
    const bookmarkCatalog = buildAgentV3CapabilityCatalog(tools, {
      availableToolNames: available,
      actorRole: 'user',
      capabilityScope: { domains: ['bookmark', 'web'] },
    });
    const bookmarkIds = new Set(bookmarkCatalog.map((item) => item.id));
    expect(bookmarkIds.has('bookmark.query')).toBe(true);
    expect(bookmarkIds.has('web.read')).toBe(true);
    expect(bookmarkIds.has('note.create')).toBe(true);
    expect(bookmarkIds.has('todo.create')).toBe(false);
    expect(bookmarkIds.has('account.profile.read')).toBe(false);

    const contentDomains = ['content', 'note', 'bookmark', 'file', 'todo', 'tag'];
    expect(normalizeCapabilityScope({ domains: contentDomains }, { actorRole: 'user' }).domains).toEqual(
      contentDomains,
    );
    const contentCatalog = buildAgentV3CapabilityCatalog(tools, {
      availableToolNames: available,
      actorRole: 'user',
      capabilityScope: { domains: contentDomains },
    });
    const contentIds = new Set(contentCatalog.map((item) => item.id));
    for (const id of ['note.query', 'bookmark.query', 'file.query', 'todo.query', 'tag.query', 'note.create']) {
      expect(contentIds.has(id)).toBe(true);
    }
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

  it('显式 scope 全部越权时失败关闭，混合 scope 只保留角色允许的领域', () => {
    expect(normalizeCapabilityScope({ domains: ['admin'] }, { actorRole: 'user' })).toMatchObject({
      mode: 'forbidden',
      domains: [],
      requestedDomains: ['admin'],
      rejectedDomains: ['admin'],
    });
    expect(normalizeCapabilityScope({ domains: ['todo', 'admin'] }, { actorRole: 'user' })).toMatchObject({
      mode: 'restricted',
      domains: ['todo'],
      rejectedDomains: ['admin'],
    });
    expect(
      buildAgentV3CapabilityCatalog(tools, {
        actorRole: 'user',
        capabilityScope: { domains: ['admin'] },
      }),
    ).toEqual([]);
  });

  it('必填 Root 时间槽与后台任务副作用策略由 Manifest 显式声明', () => {
    expect(getAgentV3CapabilityByToolName('get_resource_creation_ranking')?.temporalSlots).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'timeRange', required: true, defaultPolicy: 'all', allowAll: true }),
      ]),
    );
    expect(getAgentV3CapabilityByToolName('query_new_user_resources')?.temporalSlots).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'registeredWithin', required: true, defaultPolicy: 'clarify' }),
        expect.objectContaining({ name: 'resourceTimeRange', required: true, defaultPolicy: 'clarify' }),
      ]),
    );
    expect(getAgentV3CapabilityByToolName('start_link_health_check')).toMatchObject({
      effect: 'write',
      confirmationPolicy: 'none',
      sideEffectPolicy: 'idempotent_background_job',
    });
  });

  it('V3 编译器目录使用 Manifest 自己的时间口径，不继承 legacy 工具的追问规则', () => {
    const catalog = buildAgentV3CapabilityCatalog(tools, { actorRole: 'root' });
    const ranking = catalog.find((item) => item.id === 'admin.resource.ranking.read');
    const resources = catalog.find((item) => item.id === 'admin.resource.query');
    const newUserResources = catalog.find((item) => item.id === 'admin.new_user.resource.query');

    expect(ranking?.description).toContain('未指定时间口径时按全部时间');
    expect(ranking?.description).not.toContain('必须先追问');
    expect(resources?.description).toContain('未指定资源创建时间时按全部时间');
    expect(newUserResources?.description).toContain('两个时间范围缺失时必须先澄清');
  });
});
