import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  buildAnnualReport: vi.fn(),
  hasAnnualRecords: vi.fn(),
  unlockAnnualReviewAchievement: vi.fn(),
  now: Date.parse('2026-12-20T10:00:00+08:00'),
}));

// common.js 会加载全部路由，单测只需要响应信封与语言选择。
vi.mock('../util/common.js', () => ({
  resultData: (data = null, status = 200, msg = '') => ({ data, status, msg }),
  L: (_req, zh) => zh,
}));
vi.mock('../util/auth.js', () => ({
  ensureNotVisitor: (req, res) => {
    if (req.user?.id && req.user.role !== 'visitor') return true;
    res.send({ data: null, status: 'preview', msg: '' });
    return false;
  },
}));
vi.mock('../util/annualReport/build.js', () => ({
  buildAnnualReport: mocks.buildAnnualReport,
  hasAnnualRecords: mocks.hasAnnualRecords,
}));
vi.mock('../util/annualReport/access.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    canOpenAnnualReport: (definition, role) => actual.canOpenAnnualReport(definition, role, mocks.now),
    annualEntryActive: (definition, role) => actual.annualEntryActive(definition, role, mocks.now),
    unlockAnnualReviewAchievement: mocks.unlockAnnualReviewAchievement,
  };
});

const { getAnnualReport, getAnnualReportStatus, completeAnnualReport } = await import('./annualReportHandle.js');
const { canOpenAnnualReport } = await vi.importActual('../util/annualReport/access.js');
const { getAnnualReportDefinition } = await import('@lightnote/shared/annual-report');

function createRes() {
  const res = { body: null };
  res.send = vi.fn((body) => {
    res.body = body;
    return res;
  });
  res.status = vi.fn(() => res);
  res.json = vi.fn((body) => {
    res.body = body;
    return res;
  });
  return res;
}

const user = (role = 'user') => ({ id: 'u-1', role });

describe('annual report access window', () => {
  const definition = getAnnualReportDefinition(2026);
  const before = Date.parse('2026-12-14T12:00:00+08:00');

  it('lets internal accounts preview early and keeps visitors out', () => {
    expect(canOpenAnnualReport(definition, 'user', before)).toBe(false);
    expect(canOpenAnnualReport(definition, 'root', before)).toBe(true);
    expect(canOpenAnnualReport(definition, 'test', before)).toBe(true);
    expect(canOpenAnnualReport(definition, 'visitor', Date.parse('2027-01-02T00:00:00+08:00'))).toBe(false);
    expect(canOpenAnnualReport(definition, 'user', Date.parse('2026-12-15T00:00:00+08:00'))).toBe(true);
  });
});

describe('annual report handlers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.now = Date.parse('2026-12-20T10:00:00+08:00');
  });

  it('rejects unknown years', async () => {
    const res = createRes();
    await getAnnualReport({ query: { year: '2025' }, user: user(), headers: {} }, res);
    expect(res.body.status).toBe(404);
    expect(mocks.buildAnnualReport).not.toHaveBeenCalled();
  });

  it('answers visitors without probing records or recording a registration wall hit', async () => {
    const res = createRes();
    await getAnnualReportStatus({ query: { year: '2026' }, user: user('visitor'), headers: {} }, res);
    expect(res.body.data).toEqual({ year: 2026, available: false, eligible: false, entryActive: false });
    expect(mocks.hasAnnualRecords).not.toHaveBeenCalled();
  });

  it('keeps regular accounts closed before launch', async () => {
    mocks.now = Date.parse('2026-12-01T10:00:00+08:00');
    const res = createRes();
    await getAnnualReport({ query: { year: '2026' }, user: user(), headers: {} }, res);
    expect(res.body.data).toMatchObject({ year: 2026, available: false });
    expect(mocks.buildAnnualReport).not.toHaveBeenCalled();
  });

  it('reports entry state from cheap record presence', async () => {
    mocks.hasAnnualRecords.mockResolvedValue(true);
    const res = createRes();
    await getAnnualReportStatus({ query: { year: '2026' }, user: user(), headers: {} }, res);
    expect(res.body.data).toMatchObject({ available: true, eligible: true, entryActive: true });
    mocks.now = Date.parse('2027-02-02T10:00:00+08:00');
    const later = createRes();
    await getAnnualReportStatus({ query: { year: '2026' }, user: user(), headers: {} }, later);
    expect(later.body.data).toMatchObject({ available: true, eligible: true, entryActive: false });
  });

  it('coalesces concurrent report builds for the same account', async () => {
    let resolve;
    mocks.buildAnnualReport.mockReturnValue(new Promise((done) => (resolve = done)));
    const first = createRes();
    const second = createRes();
    const pending = [
      getAnnualReport({ query: { year: '2026' }, user: user(), headers: {} }, first),
      getAnnualReport({ query: { year: '2026' }, user: user(), headers: {} }, second),
    ];
    resolve({ year: 2026, tier: 'full', chapters: ['cover', 'poster'] });
    await Promise.all(pending);
    expect(mocks.buildAnnualReport).toHaveBeenCalledTimes(1);
    expect(first.body.data).toMatchObject({ available: true, tier: 'full' });
    expect(second.body.data).toMatchObject({ available: true, tier: 'full' });
  });

  it('hides internal error details when a build fails', async () => {
    mocks.buildAnnualReport.mockRejectedValue(new Error('ER_BAD_FIELD_ERROR: secret column'));
    const res = createRes();
    await getAnnualReport({ query: { year: '2026' }, user: user(), headers: {} }, res);
    expect(res.body.status).toBe(500);
    expect(JSON.stringify(res.body)).not.toContain('secret');
  });

  it('only records the commemorative achievement for accounts with records', async () => {
    mocks.hasAnnualRecords.mockResolvedValueOnce(false);
    const empty = createRes();
    await completeAnnualReport({ body: { year: 2026 }, user: user(), headers: {} }, empty);
    expect(empty.body.status).toBe(409);
    expect(mocks.unlockAnnualReviewAchievement).not.toHaveBeenCalled();

    mocks.hasAnnualRecords.mockResolvedValueOnce(true);
    mocks.unlockAnnualReviewAchievement.mockResolvedValueOnce({ key: 'annual_review_2026', newlyUnlocked: true });
    const done = createRes();
    await completeAnnualReport({ body: { year: 2026 }, user: user(), headers: {} }, done);
    expect(done.body.data).toEqual({ key: 'annual_review_2026', newlyUnlocked: true });
  });
});
