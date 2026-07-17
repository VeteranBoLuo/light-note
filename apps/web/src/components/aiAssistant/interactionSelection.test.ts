import { describe, expect, it } from 'vitest';
import type { AiAgentInteraction } from '@/types/aiAgent';
import {
  canSubmitInteraction,
  createInteractionSelection,
  freezeInteractionResponse,
  isRetryableInteractionError,
  toggleInteractionOption,
  updateInteractionCustomValue,
} from './interactionSelection';

function interaction(overrides: Partial<AiAgentInteraction> = {}): AiAgentInteraction {
  return {
    token: 'token',
    id: 'interaction-1',
    sessionId: 'session-1',
    type: 'single_choice',
    purpose: 'choice',
    title: '请选择',
    options: [
      { id: 'one', label: '一' },
      { id: 'two', label: '二' },
      { id: 'disabled', label: '不可用', disabled: true },
    ],
    minSelections: 1,
    maxSelections: 1,
    expiresIn: 300,
    ...overrides,
  };
}

describe('interactionSelection', () => {
  it('单选会替换旧选项并忽略禁用项', () => {
    const spec = interaction();
    let state = toggleInteractionOption(spec, createInteractionSelection(), 'one');
    state = toggleInteractionOption(spec, state, 'two');
    expect(state.selectedIds).toEqual(['two']);
    expect(toggleInteractionOption(spec, state, 'disabled')).toBe(state);
    expect(canSubmitInteraction(spec, state)).toBe(true);
  });

  it('多选遵守最大数量，自定义回答计入选择数', () => {
    const spec = interaction({ type: 'multi_choice', maxSelections: 2, allowCustom: true });
    let state = toggleInteractionOption(spec, createInteractionSelection(), 'one');
    state = toggleInteractionOption(spec, state, 'two');
    state = updateInteractionCustomValue(spec, state, '补充回答');
    expect(canSubmitInteraction(spec, state)).toBe(false);
    state = toggleInteractionOption(spec, state, 'two');
    expect(canSubmitInteraction(spec, state)).toBe(true);
  });

  it('单选输入自定义回答时清空预设选择', () => {
    const spec = interaction({ allowCustom: true });
    const selected = toggleInteractionOption(spec, createInteractionSelection(), 'one');
    const customized = updateInteractionCustomValue(spec, selected, '其他位置');
    expect(customized).toEqual({ selectedIds: [], customValue: '其他位置' });
  });

  it('冻结提交快照后，后续本地状态变化不会改变安全重试参数', () => {
    const state = { selectedIds: ['one'], customValue: '  自定义  ' };
    const snapshot = freezeInteractionResponse(state);
    state.selectedIds.push('two');
    state.customValue = '已修改';
    expect(snapshot).toEqual({ selectedIds: ['one'], customValue: '自定义', cancelled: false });
    expect(Object.isFrozen(snapshot)).toBe(true);
  });

  it('仅网络不确定、冲突和服务端错误允许使用原快照安全重试', () => {
    expect(isRetryableInteractionError({ status: 409 })).toBe(true);
    expect(isRetryableInteractionError({ status: 503 })).toBe(true);
    expect(isRetryableInteractionError({ status: 400 })).toBe(false);
  });
});
