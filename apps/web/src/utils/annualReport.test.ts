import { describe, expect, it } from 'vitest';
import { annualReportStateKind, formatAnnualFullDate, type AnnualReport } from './annualReport';

const report = (patch: Partial<AnnualReport>): AnnualReport => ({ year: 2026, available: false, ...patch });

describe('annualReportStateKind', () => {
  it('follows the request state first', () => {
    expect(annualReportStateKind('loading', null)).toBe('loading');
    expect(annualReportStateKind('failed', report({ available: true }))).toBe('failed');
  });

  it('asks visitors to sign in rather than claiming the report is closed', () => {
    expect(annualReportStateKind('ready', report({ reason: 'login' }))).toBe('login');
    expect(annualReportStateKind('ready', report({ reason: 'upcoming', openFrom: '2026-12-15' }))).toBe('upcoming');
    expect(annualReportStateKind('ready', report({ openFrom: '2026-12-15' }))).toBe('upcoming');
  });

  it('shows the empty state for an open report without records', () => {
    expect(annualReportStateKind('ready', report({ available: true, tier: 'empty' }))).toBe('empty');
  });
});

describe('formatAnnualFullDate', () => {
  it('keeps the year because the join date can predate the report year', () => {
    expect(formatAnnualFullDate('2024-11-08', 'zh-CN')).toBe('2024年11月8日');
    expect(formatAnnualFullDate('2024-11-08', 'en-US')).toBe('Nov 8, 2024');
    expect(formatAnnualFullDate(null, 'zh-CN')).toBe('');
  });
});
