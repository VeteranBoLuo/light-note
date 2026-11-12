import { describe, expect, it, vi } from 'vitest';
import {
  generateReservationReport,
  normalizeReservationReportOptions,
  summarizeReservationReport,
} from './aiQuotaReservationReport.js';

const execution = (id, reserved = 100) => ({
  id,
  actorId: 'private-account',
  skillId: 'note.transform_text',
  subjectsJson: JSON.stringify([{ type: 'user', key: 'private-account', reservedTokens: reserved }]),
  inputDiagnostics: {
    version: 1,
    operation: 'polish',
    reservationBudget: {
      inputTokens: 3000,
      evidenceTokens: 8000,
      protocolTokens: 8000,
      outputTokens: 8192,
      visionTokens: 0,
      totalTokens: 27192,
      unclampedTokens: 27192,
    },
  },
});
const span = (executionId, totalTokens, billingScope = 'user', usageStatus = 'reported') => ({
  executionId,
  totalTokens,
  billingScope,
  usageStatus,
});

describe('AI reservation aggregate report', () => {
  it('aggregates all user spans per root and excludes platform repairs and missing usage', () => {
    const result = summarizeReservationReport(
      [execution('a'), execution('b'), execution('missing')],
      [span('a', 70), span('a', 50), span('a', 900, 'platform'), span('b', 80), span('missing', 0, 'user', 'missing')],
    );
    expect(result).toMatchObject({
      executions: 3,
      missingUsageExecutions: 1,
      missingUsageSpans: 1,
      extraTokensTotal: 20,
      groups: [
        {
          samples: 2,
          exceedances: 1,
          exceedanceRate: 0.5,
          extraPer1000: 10000,
          slackP50: -20,
          observationalOnly: true,
        },
      ],
    });
    expect(JSON.stringify(result)).not.toContain('private-account');
    expect(JSON.stringify(result)).not.toContain('"a"');
  });
  it('uses the actual actor reservation instead of the requested ceiling or user charge', () => {
    const result = summarizeReservationReport(
      [{ ...execution('a', 50), chargedTokens: 50, reservedTokens: 1000 }],
      [span('a', 70)],
    );
    expect(result.extraTokensTotal).toBe(20);
    expect(
      summarizeReservationReport([{ ...execution('a'), subjectsJson: 'broken' }], [span('a', 70)]).missingReservations,
    ).toBe(1);
  });
  it('loads complete spans for bounded executions and reports truncation', async () => {
    const database = {
      query: vi
        .fn()
        .mockResolvedValueOnce([[execution('a'), execution('b')]])
        .mockResolvedValueOnce([[span('a', 120)]]),
    };
    expect(await generateReservationReport(database, { limit: 1 })).toMatchObject({
      truncated: true,
      executions: 1,
      extraTokensTotal: 20,
    });
    expect(database.query.mock.calls[1][1]).toEqual(['a']);
    expect(database.query.mock.calls.every(([sql]) => /^\s*SELECT/.test(sql))).toBe(true);
  });
  it.each([{ days: 0 }, { days: 366 }, { limit: 20001 }, { limit: 1.5 }])(
    'rejects unsafe report scope %j',
    (options) => {
      expect(() => normalizeReservationReportOptions(options)).toThrow('AI_RESERVATION_REPORT_OPTIONS_INVALID');
    },
  );
});
