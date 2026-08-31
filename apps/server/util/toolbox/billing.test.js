import { describe, expect, it, vi } from 'vitest';
import {
  reserveToolboxPoints,
  resolveToolboxActualPoints,
  settleReservedToolboxBilling,
  toolboxBillingInternals,
} from './billing.js';

describe('toolbox billing', () => {
  it('settles success fully, partial deliverables proportionally and failures at zero', () => {
    expect(resolveToolboxActualPoints({ quotedPoints: 20, outcome: 'succeeded' })).toBe(20);
    expect(resolveToolboxActualPoints({ quotedPoints: 20, outcome: 'partial_succeeded' })).toBe(15);
    expect(resolveToolboxActualPoints({ quotedPoints: 20, outcome: 'failed' })).toBe(0);
    expect(resolveToolboxActualPoints({ quotedPoints: 20, outcome: 'cancelled' })).toBe(0);
  });

  it('derives a bounded deterministic points receipt request id', () => {
    const first = toolboxBillingInternals.operationRequestId('request-id-123456789');
    expect(first).toBe(toolboxBillingInternals.operationRequestId('request-id-123456789'));
    expect(first.length).toBeLessThanOrEqual(64);
  });

  it('reserves points, writes one economy receipt and one traceable points log in the same transaction', async () => {
    const connection = {
      query: vi
        .fn()
        .mockResolvedValueOnce([[{ points: 100 }]])
        .mockResolvedValueOnce([[]])
        .mockResolvedValueOnce([{ insertId: 77 }])
        .mockResolvedValueOnce([{ affectedRows: 1 }])
        .mockResolvedValueOnce([{ affectedRows: 1 }]),
    };

    await expect(
      reserveToolboxPoints(connection, {
        userId: 'user-1',
        clientRequestId: 'job-request-1234',
        quote: { id: 'quote-1', quoted_points: 20 },
        jobId: 'job-1',
        toolId: 'research_brief',
        inputDigest: 'a'.repeat(64),
      }),
    ).resolves.toEqual({ operationId: 77, reservedPoints: 20, replay: false });

    expect(connection.query.mock.calls[2][0]).toContain('points_economy_operations');
    expect(connection.query.mock.calls[3]).toEqual([
      'UPDATE user_growth SET points = points - ? WHERE user_id = ? AND points >= ?',
      [20, 'user-1', 20],
    ]);
    expect(connection.query.mock.calls[4][0]).toContain("'toolbox_reserve'");
  });

  it('settles a partial result once and refunds only the unused reservation', async () => {
    const connection = {
      query: vi
        .fn()
        .mockResolvedValueOnce([{ affectedRows: 1 }])
        .mockResolvedValueOnce([{ affectedRows: 1 }])
        .mockResolvedValueOnce([{ affectedRows: 1 }])
        .mockResolvedValueOnce([{ affectedRows: 1 }]),
    };
    const job = {
      id: 'job-1',
      quote_id: 'quote-1',
      tool_id: 'research_brief',
      user_id: 'user-1',
      points_operation_id: 77,
      billing_status: 'reserved',
      quoted_points: 20,
      actual_points: 0,
    };

    await expect(
      settleReservedToolboxBilling(connection, job, {
        outcome: 'partial_succeeded',
        requestedActualPoints: 12,
        reasonCode: 'PARTIAL_COVERAGE',
      }),
    ).resolves.toEqual({ billingStatus: 'partially_settled', actualPoints: 12, refundedPoints: 8, replay: false });
    expect(connection.query.mock.calls[0]).toEqual([
      'UPDATE user_growth SET points = points + ? WHERE user_id = ?',
      [8, 'user-1'],
    ]);
    expect(connection.query.mock.calls[1][1]).toEqual([
      'user-1',
      8,
      'toolbox_adjustment',
      'job-1',
      expect.stringContaining('PARTIAL_COVERAGE'),
    ]);
    expect(connection.query.mock.calls[2][0]).toContain("status = 'reserved'");
  });

  it('treats a terminal billing receipt as an idempotent replay without a second refund', async () => {
    const connection = { query: vi.fn() };
    await expect(
      settleReservedToolboxBilling(
        connection,
        { billing_status: 'released', quoted_points: 20, actual_points: 0 },
        { outcome: 'failed' },
      ),
    ).resolves.toEqual({ billingStatus: 'released', actualPoints: 0, refundedPoints: 20, replay: true });
    expect(connection.query).not.toHaveBeenCalled();
  });
});
