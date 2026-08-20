import { describe, expect, it } from 'vitest';
import { canToolConsumeAgentV3ResultSet } from './candidateAvailability.js';

describe('Agent V3 ResultSet 候选可用性', () => {
  const projection = (domains, refTypes) => ({
    lastResultSet: { available: true, domains, refTypes, refCount: 1 },
    resultSetCandidates: [],
  });

  it('按 Manifest 与多类型资源绑定开放网页和待办续问', () => {
    expect(
      canToolConsumeAgentV3ResultSet(
        {
          name: 'read_url',
          resourceBindings: [{ argument: 'url', refTypes: ['bookmark', 'web'], sourceField: 'url' }],
        },
        projection(['web', 'bookmark'], ['web']),
      ),
    ).toBe(true);
    expect(
      canToolConsumeAgentV3ResultSet(
        {
          name: 'query_todos',
          resourceBindings: [{ argument: 'todoId', refType: 'todo', sourceField: 'id' }],
        },
        projection(['todo'], ['todo']),
      ),
    ).toBe(true);
  });

  it('不因无关领域、不可继承能力或空投影开放工具', () => {
    const readUrl = {
      name: 'read_url',
      resourceBindings: [{ argument: 'url', refTypes: ['bookmark', 'web'], sourceField: 'url' }],
    };
    expect(canToolConsumeAgentV3ResultSet(readUrl, projection(['note'], ['note']))).toBe(false);
    expect(canToolConsumeAgentV3ResultSet(readUrl, {})).toBe(false);
    expect(canToolConsumeAgentV3ResultSet({ name: 'query_notes' }, projection(['note'], ['note']))).toBe(false);
  });

  it('多候选只决定能力是否可见，不在这里猜测具体集合', () => {
    expect(
      canToolConsumeAgentV3ResultSet(
        {
          name: 'read_url',
          resourceBindings: [{ argument: 'url', refTypes: ['bookmark', 'web'], sourceField: 'url' }],
        },
        {
          resultSetCandidates: [
            { available: true, domains: ['note'], refTypes: ['note'], refCount: 1 },
            { available: true, domains: ['web'], refTypes: ['web'], refCount: 1 },
          ],
        },
      ),
    ).toBe(true);
  });
});
