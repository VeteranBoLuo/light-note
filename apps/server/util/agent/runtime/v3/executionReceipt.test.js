import { describe, expect, it } from 'vitest';
import { buildAgentExecutionReceipt, buildPublicAgentExecutionReceipt } from './executionReceipt.js';

describe('Agent V3 ExecutionReceipt', () => {
  it('只有真实成功工具才披露检索，失败工具单独记录 tool_failed', () => {
    const receipt = buildAgentExecutionReceipt({
      runId: 'run-1',
      usedTools: [
        { toolRunId: 'tr-1', name: 'query_notes', capabilityId: 'note.query', effect: 'read', status: 'success' },
        { toolRunId: 'tr-2', name: 'query_todos', capabilityId: 'todo.query', effect: 'read', status: 'error' },
      ],
    });
    expect(receipt.evidenceModes).toEqual(['workspace_queried', 'tool_failed']);
    expect(buildPublicAgentExecutionReceipt(receipt)).toMatchObject({
      toolSummary: { attempted: 2, succeeded: 1, failed: 1 },
    });
  });

  it('没有成功工具和材料时只披露 none，不因请求意图伪造已检索', () => {
    const receipt = buildAgentExecutionReceipt({
      runId: 'run-2',
      usedTools: [{ name: 'query_notes', effect: 'read', status: 'confirmation_required' }],
    });
    expect(receipt.evidenceModes).toEqual(['none']);
  });

  it('只持久化有界 exact facts，公开回执不包含审计资源 ID 集合', () => {
    const factBundle = {
      digest: 'a'.repeat(64),
      facts: [
        {
          id: 'f1',
          goalId: 'g1',
          kind: 'count',
          key: 'note.query.total',
          value: 2,
          unit: 'note',
          exact: true,
          qualifiers: { completeness: 'complete' },
          evidenceRef: 'tr-1',
        },
        { id: 'f2', kind: 'tool_summary', value: '长摘要', exact: false },
      ],
    };
    const receipt = buildAgentExecutionReceipt({
      runId: 'run-3',
      factBundle,
      sourceSetIds: ['ss-1'],
      resultSetIds: ['rs-1'],
    });
    expect(receipt.facts).toHaveLength(1);
    expect(receipt.resultSetIds).toEqual(['rs-1']);
    expect(buildPublicAgentExecutionReceipt(receipt, factBundle)).not.toHaveProperty('resultSetIds');
    expect(buildPublicAgentExecutionReceipt(receipt, factBundle)?.factBlocks).toEqual([
      expect.objectContaining({ factId: 'f1', kind: 'count', value: 2 }),
    ]);
  });
});
