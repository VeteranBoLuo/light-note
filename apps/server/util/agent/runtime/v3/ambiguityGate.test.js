import { describe, expect, it } from 'vitest';
import { evaluateTurnSpecAmbiguities } from './ambiguityGate.js';

const goal = (id, kind, ambiguities = [], dependsOn = []) => ({ id, kind, ambiguities, dependsOn });

describe('Agent V3 goal ambiguity gate', () => {
  it('blocks_write 只阻断写目标，并传播到依赖该目标的后继', () => {
    const result = evaluateTurnSpecAmbiguities({
      goals: [
        goal('read', 'read', [{ impact: 'blocks_write', question: '写入目标是什么？' }]),
        goal('write', 'write', [{ impact: 'blocks_write', question: '写入目标是什么？' }]),
        goal('after', 'read', [], ['write']),
      ],
    });
    expect(result).toMatchObject({ state: 'partial', blockedGoalIds: ['write', 'after'], executableGoalIds: ['read'] });
  });

  it('fatal 阻断整轮，safe_default 与 optional 不阻断', () => {
    expect(
      evaluateTurnSpecAmbiguities({
        goals: [
          goal('safe', 'read', [{ impact: 'safe_default', question: '可使用默认值吗？' }]),
          goal('fatal', 'read', [{ impact: 'fatal', question: '你指的是哪一个？' }]),
        ],
      }),
    ).toMatchObject({
      state: 'clarification',
      fatal: true,
      blockedGoalIds: ['fatal', 'safe'],
      question: '你指的是哪一个？',
    });
  });
});
