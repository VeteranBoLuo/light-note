import { describe, expect, it } from 'vitest';
import { actionControlMessage, parseAgentActionControl } from './actionControl.js';

describe('Agent 动作控制语句', () => {
  it.each([
    '重新执行',
    '重试一下',
    '再试一次。',
    '继续刚才的操作',
    '那就重新执行吧',
    '重新执行刚才的操作',
    'retry',
    'try again',
    'do it again',
  ])('识别不携带新参数的重试语句：%s', (message) => {
    expect(parseAgentActionControl(message)).toEqual({ type: 'retry' });
  });

  it.each(['重新执行待办 A', '重试，但把标题改成 B', '刚才做成功了吗？', '再解释一次'])(
    '携带目标、修改或普通问答时不复用旧动作：%s',
    (message) => {
      expect(parseAgentActionControl(message)).toBeNull();
    },
  );

  it('所有非重试状态都返回确定性说明', () => {
    for (const state of ['none', 'pending', 'unknown', 'succeeded', 'ambiguous', 'unavailable']) {
      expect(actionControlMessage(state, 'zh-CN', 2)).toBeTruthy();
      expect(actionControlMessage(state, 'en-US', 2)).toBeTruthy();
    }
  });
});
