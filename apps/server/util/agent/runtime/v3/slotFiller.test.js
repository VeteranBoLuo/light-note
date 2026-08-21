import { describe, expect, it, vi } from 'vitest';
import {
  buildSlotFillerToolDefinition,
  fillAgentGoalSlots,
  parseSlotFillerResponse,
  SLOT_FILLER_TOOL_NAME,
} from './slotFiller.js';

const goal = Object.freeze({
  id: 'g1',
  operation: 'read',
  description: '查询推广待办',
  targetDescription: '今天 16 点提醒的推广待办',
  slotClaims: {},
});
const capability = Object.freeze({
  id: 'todo.query',
  slots: Object.freeze([
    { name: 'keyword', source: 'model_text', required: false, maxLength: 100, enum: [] },
    { name: 'status', source: 'model_enum', required: false, maxLength: null, enum: ['pending', 'completed', 'all'] },
    { name: 'todoId', source: 'resource_binding', required: false, maxLength: null, enum: [] },
    { name: 'reminderAt', source: 'temporal', required: false, maxLength: null, enum: [] },
  ]),
});

function response(args, extraCalls = []) {
  return {
    toolCalls: [{ function: { name: SLOT_FILLER_TOOL_NAME, arguments: JSON.stringify(args) } }, ...extraCalls],
  };
}

describe('Agent V3 Slot Filler', () => {
  it('schema 和模型 payload 只暴露当前 goal 的 model slots', async () => {
    const definition = buildSlotFillerToolDefinition({ goal, capability });
    expect(Object.keys(definition.function.parameters.properties.slots.properties)).toEqual(['keyword', 'status']);

    const request = vi
      .fn()
      .mockResolvedValue(
        response({ version: '1.0', goalId: 'g1', slots: { keyword: '推广', status: 'pending' }, missing: [] }),
      );
    const filled = await fillAgentGoalSlots({ message: '查今天 16 点提醒的推广待办', goal, capability, request });
    expect(filled).toMatchObject({
      applicable: true,
      slotValues: { keyword: '推广', status: 'pending' },
      attempts: 1,
      planningMode: 'slot_filler',
    });
    const payload = JSON.parse(request.mock.calls[0][0][1].content);
    expect(payload).not.toHaveProperty('toolName');
    expect(JSON.stringify(payload)).not.toContain('todoId');
    expect(JSON.stringify(payload)).not.toContain('reminderAt');
    expect(request.mock.calls[0][0]).toHaveLength(2);
  });

  it('额外工具、额外 slot、非法 enum 和必填缺失都失败关闭', () => {
    expect(
      parseSlotFillerResponse(
        response({ version: '1.0', goalId: 'g1', slots: { keyword: '推广', status: 'pending' }, missing: [] }, [
          { function: { name: 'query_todos', arguments: '{}' } },
        ]),
        { goal, capability },
      ),
    ).toBeNull();
    expect(
      parseSlotFillerResponse(
        response({
          version: '1.0',
          goalId: 'g1',
          slots: { keyword: '推广', status: 'deleted', todoId: 'forged' },
          missing: [],
        }),
        { goal, capability },
      ),
    ).toBeNull();

    const requiredCapability = {
      ...capability,
      slots: [{ name: 'keyword', source: 'model_text', required: true, maxLength: 100, enum: [] }],
    };
    expect(
      parseSlotFillerResponse(response({ version: '1.0', goalId: 'g1', slots: { keyword: null }, missing: [] }), {
        goal,
        capability: requiredCapability,
      }),
    ).toBeNull();
  });

  it('3.1 规范化出的必填 null 仍会调用补槽器，可选 null 不会重复调用', async () => {
    const requiredCapability = {
      ...capability,
      slots: [{ name: 'keyword', source: 'model_text', required: true, maxLength: 100, enum: [] }],
    };
    const request = vi
      .fn()
      .mockResolvedValue(response({ version: '1.0', goalId: 'g1', slots: { keyword: '推广' }, missing: [] }));
    const filled = await fillAgentGoalSlots({
      message: '查推广待办',
      goal: { ...goal, slotClaims: { keyword: null } },
      capability: requiredCapability,
      request,
    });
    expect(filled).toMatchObject({ applicable: true, slotValues: { keyword: '推广' }, attempts: 1 });
    expect(request).toHaveBeenCalledOnce();

    const optionalRequest = vi.fn();
    const optional = await fillAgentGoalSlots({
      message: '查全部待办',
      goal: { ...goal, slotClaims: { keyword: null, status: null } },
      capability,
      request: optionalRequest,
    });
    expect(optional).toMatchObject({ applicable: true, attempts: 0 });
    expect(optionalRequest).not.toHaveBeenCalled();
  });
});
