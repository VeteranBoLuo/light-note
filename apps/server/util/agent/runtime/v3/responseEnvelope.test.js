import { describe, expect, it } from 'vitest';
import {
  buildAgentResponseEnvelope,
  renderAgentResponseEnvelope,
  renderDeterministicAgentFacts,
} from './responseEnvelope.js';

describe('Agent V3 response envelope', () => {
  const factBundle = {
    facts: [
      {
        id: 'f1',
        kind: 'count',
        key: 'note.query.total',
        value: 2,
        unit: 'note',
        label: '查询笔记',
        exact: true,
        qualifiers: { completeness: 'complete' },
      },
      {
        id: 'f2',
        kind: 'tool_summary',
        key: 'note.query.summary',
        value: '模型不可改写的内部摘要',
        exact: false,
        qualifiers: {},
      },
    ],
  };

  it('fact block 由服务端渲染，prose 只保留开放解释', () => {
    const envelope = buildAgentResponseEnvelope({ factBundle, prose: '补充分析。' });
    expect(envelope.blocks).toEqual([
      expect.objectContaining({ type: 'fact', factId: 'f1', value: 2 }),
      { type: 'prose', content: '补充分析。' },
    ]);
    expect(renderAgentResponseEnvelope(envelope)).toBe('查询笔记: 2 note（完整结果）\n\n补充分析。');
  });

  it('确定性渲染不会把 partial 冒充完整', () => {
    const partial = {
      facts: [
        {
          id: 'f1',
          kind: 'returned_count',
          key: 'todo.query.returned',
          value: 50,
          unit: 'todo',
          label: '查询待办',
          exact: true,
          qualifiers: { completeness: 'partial' },
        },
      ],
    };
    expect(renderDeterministicAgentFacts(partial)).toContain('部分结果');
  });

  it('实体链接使用有边界的 Markdown 目标，地址后的标题不会被吞进链接', () => {
    const entities = {
      facts: [
        {
          id: 'f1',
          kind: 'entity_list',
          key: 'bookmark.query.items',
          value: [{ type: 'bookmark', id: 'b1', title: '百度一下，你就知道', url: 'https://baidu.com/' }],
          unit: 'bookmark',
          label: '查询书签',
          exact: true,
          qualifiers: { completeness: 'complete' },
        },
      ],
    };
    expect(renderDeterministicAgentFacts(entities)).toContain('1. [百度一下，你就知道](<https://baidu.com/>)');
  });
});
