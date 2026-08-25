import { describe, expect, it } from 'vitest';
import { appendSessionAiTagSelection, replaceSessionAiTagSelection } from './aiTagSelection';

describe('AI 标签会话选择', () => {
  it('重新生成时替换旧 AI 标签并保留手动标签', () => {
    expect(
      replaceSessionAiTagSelection({
        currentIds: ['manual', 'old-a', 'old-b'],
        previousAiIds: ['old-a', 'old-b'],
        incomingAiIds: ['new-a', 'new-b'],
        cap: 4,
      }),
    ).toEqual({
      selectedIds: ['manual', 'new-a', 'new-b'],
      aiSelectedIds: ['new-a', 'new-b'],
      changed: true,
    });
  });

  it('确认创建的新标签加入 AI 来源集合并遵守资源上限', () => {
    expect(
      appendSessionAiTagSelection({
        currentIds: ['manual', 'matched'],
        previousAiIds: ['matched'],
        incomingAiIds: ['created-a', 'created-b', 'created-c'],
        cap: 4,
      }),
    ).toEqual({
      selectedIds: ['manual', 'matched', 'created-a', 'created-b'],
      aiSelectedIds: ['matched', 'created-a', 'created-b'],
      changed: true,
    });
  });
});
