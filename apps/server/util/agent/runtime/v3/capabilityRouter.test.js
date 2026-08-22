import { describe, expect, it } from 'vitest';
import { routeTurnSpecCapabilitiesV3 } from './capabilityRouter.js';

const tool = { name: 'query_notes' };
const catalog = [
  {
    id: 'note.query',
    status: 'enabled',
    toolName: 'query_notes',
    operations: ['read'],
    effect: 'read',
  },
  {
    id: 'note.delete',
    status: 'planned',
    toolName: '',
    operations: ['delete'],
    effect: 'write',
  },
];

function spec(capabilityId, operation = 'read') {
  return {
    confidence: 'high',
    missingSlots: [],
    goals: [
      {
        id: 'goal',
        capabilityId,
        capabilityDomain: 'note',
        operation,
        dependsOn: [],
      },
    ],
  };
}

describe('Capability Router V3', () => {
  it('只按 capabilityId 精确映射，描述文字和相似度不参与路由', () => {
    const route = routeTurnSpecCapabilitiesV3({ turnSpec: spec('note.query'), catalog, tools: [tool] });
    expect(route).toMatchObject({ state: 'ready', candidates: [tool] });
    expect(route.goalRoutes[0]).toMatchObject({ capabilityIds: ['note.query'], toolNames: ['query_notes'] });
  });

  it('planned/forbidden/未知能力不会降级成另一个相似工具', () => {
    expect(
      routeTurnSpecCapabilitiesV3({ turnSpec: spec('note.delete', 'delete'), catalog, tools: [tool] }),
    ).toMatchObject({
      state: 'unsupported',
      reason: 'partial_support',
      candidates: [],
    });
    expect(routeTurnSpecCapabilitiesV3({ turnSpec: spec('read.query_notes'), catalog, tools: [tool] })).toMatchObject({
      state: 'unsupported',
      candidates: [],
    });
  });

  it('输入类型由结构化上下文确定，缺少显式资源时不开放资源专用能力', () => {
    const imageTool = { name: 'analyze_resource_images' };
    const scopedCatalog = [
      {
        id: 'content.image.analyze',
        status: 'enabled',
        toolName: 'analyze_resource_images',
        operations: ['read'],
        acceptedInputKinds: ['selected_resource'],
      },
    ];
    expect(
      routeTurnSpecCapabilitiesV3({
        turnSpec: spec('content.image.analyze'),
        catalog: scopedCatalog,
        tools: [imageTool],
      }),
    ).toMatchObject({ state: 'unsupported', candidates: [] });
    expect(
      routeTurnSpecCapabilitiesV3({
        turnSpec: spec('content.image.analyze'),
        catalog: scopedCatalog,
        tools: [imageTool],
        availableInputKinds: ['latest_message', 'selected_resource'],
      }),
    ).toMatchObject({ state: 'ready', candidates: [imageTool] });
  });

  it('profile 阻断是独立状态，不会误路由到相似的已启用能力', () => {
    const profileCatalog = [
      ...catalog,
      {
        id: 'note.create',
        status: 'policy_blocked',
        policyBlockReason: 'read_only',
        toolName: 'create_note',
        operations: ['create'],
        effect: 'write',
      },
    ];
    expect(
      routeTurnSpecCapabilitiesV3({
        turnSpec: spec('note.create', 'create'),
        catalog: profileCatalog,
        tools: [tool, { name: 'create_note' }],
      }),
    ).toMatchObject({ state: 'unsupported', reason: 'policy_blocked_goal', candidates: [] });
  });
});
