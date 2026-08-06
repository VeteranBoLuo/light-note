import { beforeEach, describe, expect, it, vi } from 'vitest';

const recordAiProductEvent = vi.fn().mockResolvedValue(undefined);
vi.mock('@/api/aiTelemetry', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/api/aiTelemetry')>()),
  recordAiProductEvent,
}));

const {
  noteTreeChildCountBucket,
  noteTreeDepthBucket,
  noteTreeSubtreeSizeBucket,
  recordNoteTreeProductEvent,
} = await import('./noteTreeTelemetry');

describe('note tree product telemetry', () => {
  beforeEach(() => recordAiProductEvent.mockClear());

  it('只发送无正文的枚举桶，不发送标题、路径或资源 ID', async () => {
    await recordNoteTreeProductEvent('note_tree_node_moved', {
      surface: 'mobile',
      depth: 5,
      childCount: 12,
      subtreeSize: 68,
      durationMs: 3_500,
      result: 'success',
    });

    expect(recordAiProductEvent).toHaveBeenCalledWith('note_tree_node_moved', {
      surface: 'mobile',
      depthBucket: '5_6',
      childCountBucket: '11_50',
      subtreeSizeBucket: '51_200',
      durationBucket: '3_10s',
      result: 'success',
    });
  });

  it('对深度、子页面和子树规模使用稳定边界桶', () => {
    expect([0, 1, 3, 5, 7, 9].map(noteTreeDepthBucket)).toEqual([
      'root',
      '1_2',
      '3_4',
      '5_6',
      '7_8',
      'overflow',
    ]);
    expect([0, 1, 4, 11, 51].map(noteTreeChildCountBucket)).toEqual([
      '0',
      '1_3',
      '4_10',
      '11_50',
      '51_plus',
    ]);
    expect([0, 1, 2, 11, 51, 201].map(noteTreeSubtreeSizeBucket)).toEqual([
      '0',
      '1',
      '2_10',
      '11_50',
      '51_200',
      '201_plus',
    ]);
  });
});
