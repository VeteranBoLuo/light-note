import { describe, expect, it } from 'vitest';
import {
  normalizeAiExecutionReceipt,
  normalizeAiResponseEnvelope,
  resolveAiExecutionReceiptNoticeKey,
  type AiExecutionReceipt,
} from './aiExecutionReceipt';

describe('AI execution receipt protocol', () => {
  it('只接受固定披露枚举和安全 fact block', () => {
    expect(
      normalizeAiExecutionReceipt({
        schemaVersion: 1,
        runId: 'run-1',
        terminal: 'completed',
        evidenceModes: ['workspace_queried', 'invented'],
        toolSummary: { attempted: 1, succeeded: 1, failed: 0 },
        factDigest: 'a'.repeat(64),
        factBlocks: [{ type: 'fact', factId: 'f1', kind: 'count', key: 'note.query.total', value: 2, unit: 'note' }],
      }),
    ).toMatchObject({ evidenceModes: ['workspace_queried'], factBlocks: [{ factId: 'f1', value: 2 }] });
  });

  it('响应 envelope 不接受未知 block', () => {
    expect(
      normalizeAiResponseEnvelope({
        schemaVersion: 1,
        blocks: [
          { type: 'prose', content: '分析' },
          { type: 'command', content: '执行写入' },
        ],
      }),
    ).toEqual({ schemaVersion: 1, blocks: [{ type: 'prose', content: '分析' }] });
  });

  it('只有真实执行证据才显示处理口径，没有引用或成功工具时保持隐藏', () => {
    const receipt = (evidenceModes: AiExecutionReceipt['evidenceModes'], succeeded: number) =>
      ({
        schemaVersion: 1,
        runId: 'run-1',
        terminal: 'completed',
        evidenceModes,
        toolSummary: { attempted: 1, succeeded, failed: succeeded ? 0 : 1 },
        factDigest: 'a'.repeat(64),
        factBlocks: [],
        writeCommitted: false,
      }) satisfies AiExecutionReceipt;

    expect(resolveAiExecutionReceiptNoticeKey(receipt(['current_materials_used'], 0))).toBe('currentMaterials');
    expect(resolveAiExecutionReceiptNoticeKey(receipt(['inherited_result_set'], 0))).toBe('inheritedResult');
    expect(resolveAiExecutionReceiptNoticeKey(receipt(['knowledge_base'], 1))).toBe('knowledgeBase');
    expect(resolveAiExecutionReceiptNoticeKey(receipt(['workspace_queried'], 1))).toBe('workspaceQueried');
    expect(resolveAiExecutionReceiptNoticeKey(receipt(['tool_failed'], 0))).toBe('toolFailed');
    expect(resolveAiExecutionReceiptNoticeKey(receipt(['none'], 0))).toBeUndefined();
    expect(resolveAiExecutionReceiptNoticeKey(receipt(['workspace_queried'], 0))).toBeUndefined();
    expect(resolveAiExecutionReceiptNoticeKey()).toBeUndefined();
  });
});
