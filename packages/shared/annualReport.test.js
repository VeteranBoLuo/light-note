import { describe, expect, it } from 'vitest';
import { FEATURE_ANNOUNCEMENTS } from './index.js';
import {
  ANNUAL_REPORT_CHAPTERS,
  ANNUAL_REPORT_LIGHT_CHAPTERS,
  getAnnualReportDefinition,
  isAnnualReportEntryWindow,
  isAnnualReportNoticeWindow,
  isAnnualReportOpen,
} from './annualReport.js';

describe('annual report contract', () => {
  const report = getAnnualReportDefinition(2026);

  it('only resolves configured integer years', () => {
    expect(report?.year).toBe(2026);
    expect(getAnnualReportDefinition('2026')).toBe(report);
    expect(getAnnualReportDefinition(2025)).toBeNull();
    expect(getAnnualReportDefinition('2026.5')).toBeNull();
    expect(getAnnualReportDefinition(null)).toBeNull();
  });

  it('opens at the absolute launch moment and closes entries a month after new year', () => {
    expect(isAnnualReportOpen(report, Date.parse('2026-12-14T23:59:59.999+08:00'))).toBe(false);
    expect(isAnnualReportOpen(report, Date.parse('2026-12-15T00:00:00.000+08:00'))).toBe(true);
    expect(isAnnualReportEntryWindow(report, Date.parse('2027-01-31T23:59:59.000+08:00'))).toBe(true);
    expect(isAnnualReportEntryWindow(report, Date.parse('2027-02-01T00:00:00.000+08:00'))).toBe(false);
    // 入口截止后报告本身仍可访问，旧通知链接不失效。
    expect(isAnnualReportOpen(report, Date.parse('2027-06-01T00:00:00.000+08:00'))).toBe(true);
  });

  it('limits notices to the first launch week', () => {
    expect(isAnnualReportNoticeWindow(report, Date.parse('2026-12-15T10:00:00+08:00'))).toBe(true);
    expect(isAnnualReportNoticeWindow(report, Date.parse('2026-12-21T10:00:00+08:00'))).toBe(true);
    expect(isAnnualReportNoticeWindow(report, Date.parse('2026-12-22T10:00:00+08:00'))).toBe(false);
  });

  it('keeps the announcement window aligned with the entry window', () => {
    const announcement = FEATURE_ANNOUNCEMENTS.ANNUAL_REPORT_2026;
    expect(announcement.id).toBe(report.announcementId);
    expect(Date.parse(announcement.publishedAt)).toBe(Date.parse(report.openFrom));
    expect(Date.parse(announcement.expiresAt)).toBe(Date.parse(report.entryUntil));
  });

  it('starts and ends every chapter list with the cover and poster', () => {
    for (const list of [ANNUAL_REPORT_CHAPTERS, ANNUAL_REPORT_LIGHT_CHAPTERS]) {
      expect(list[0]).toBe('cover');
      expect(list.at(-1)).toBe('poster');
    }
  });
});
