import { describe, expect, it } from 'vitest';
import {
  authoritativeTemporalArgumentsForGoal,
  collectMissingTemporalSlotsV3,
  compileTemporalConstraintsV3,
  extractTemporalMentionsV3,
  resolveTemporalExpressionV3,
} from './temporalConstraints.js';

const context = { currentDate: '2026-08-20', currentDateTime: '2026-08-20 15:10:00' };

describe('Temporal Constraints V3', () => {
  it('最长优先提取时间表达式，不把“今天 16 点”拆成两个约束', () => {
    expect(extractTemporalMentionsV3('查一下今天下午 4 点提醒的待办')).toEqual([
      expect.objectContaining({ expression: '今天下午4点', precision: 'datetime' }),
    ]);
    expect(extractTemporalMentionsV3('昨天注册、今天创建资源')).toEqual([
      expect.objectContaining({ expression: '昨天' }),
      expect.objectContaining({ expression: '今天' }),
    ]);
  });

  it('按用户本地日期解析提醒时间，不依赖服务器所在时区', () => {
    expect(resolveTemporalExpressionV3('今天下午4点', { kind: 'datetime' }, context)).toMatchObject({
      argumentValue: '2026-08-20 16:00',
    });
    expect(resolveTemporalExpressionV3('后天', { kind: 'date' }, context)).toMatchObject({
      argumentValue: '2026-08-22',
    });
  });

  it('多个时间表达式必须逐一绑定，不能漏掉或凭历史补值', () => {
    const catalog = [
      {
        id: 'admin.new_user.resource.query',
        temporalSlots: [
          { name: 'registeredWithin', kind: 'range', autoBind: true },
          { name: 'resourceTimeRange', kind: 'range', autoBind: true },
        ],
      },
    ];
    const goals = [{ id: 'resources', capabilityId: 'admin.new_user.resource.query' }];
    expect(
      compileTemporalConstraintsV3(
        [{ goalId: 'resources', slot: 'registeredWithin', expression: '昨天' }],
        { goals, catalog, latestMessage: '昨天注册的用户今天创建了哪些资源', temporalContext: context },
      ),
    ).toBeNull();

    const compiled = compileTemporalConstraintsV3(
      [
        { goalId: 'resources', slot: 'registeredWithin', expression: '昨天' },
        { goalId: 'resources', slot: 'resourceTimeRange', expression: '今天' },
      ],
      { goals, catalog, latestMessage: '昨天注册的用户今天创建了哪些资源', temporalContext: context },
    );
    expect(authoritativeTemporalArgumentsForGoal({ temporalConstraints: compiled }, 'resources')).toEqual({
      registeredWithin: '昨天',
      resourceTimeRange: '今天',
    });
  });

  it('无时间表达时只按 Manifest 的显式默认策略补值或澄清', () => {
    const goals = [
      { id: 'ranking', capabilityId: 'admin.resource.ranking.read' },
      { id: 'new-user', capabilityId: 'admin.new_user.resource.query' },
    ];
    const catalog = [
      {
        id: 'admin.resource.ranking.read',
        temporalSlots: [
          {
            name: 'timeRange',
            kind: 'range',
            label: '资源创建时间',
            required: true,
            allowAll: true,
            defaultPolicy: 'all',
          },
        ],
      },
      {
        id: 'admin.new_user.resource.query',
        temporalSlots: [
          {
            name: 'registeredWithin',
            kind: 'range',
            label: '用户注册时间',
            required: true,
            defaultPolicy: 'clarify',
          },
        ],
      },
    ];
    const constraints = compileTemporalConstraintsV3([], { goals, catalog, latestMessage: '', temporalContext: context });
    expect(constraints).toEqual([
      expect.objectContaining({
        goalId: 'ranking',
        slot: 'timeRange',
        expression: '全部',
        argumentValue: '全部',
        implicit: true,
      }),
    ]);
    expect(collectMissingTemporalSlotsV3({ goals, catalog, constraints })).toEqual([
      expect.objectContaining({
        name: 'new-user.registeredWithin',
        reason: 'manifest_temporal_scope_required',
      }),
    ]);
  });
});
