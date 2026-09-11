import { beforeEach, describe, expect, it, vi } from 'vitest';
const { generate, wrap } = vi.hoisted(() => ({ generate: vi.fn(), wrap: vi.fn(() => ({})) }));
vi.mock('../db/index.js', () => ({ default: {} }));
vi.mock('../util/services/coreUsageReport.js', () => ({ generateCoreUsageReport: generate }));
vi.mock('../util/readOnlyDatabase.js', () => ({ createReadOnlyPool: wrap }));
const { getAdminCoreUsageReport } = await import('./adminCoreUsageHandle.js');
const res = () => ({ send: vi.fn() });
const req = (days = 30) => ({ user: { role: 'root' }, body: { days } });
describe('管理员手动核心使用报告', () => {
  beforeEach(() => generate.mockReset());
  it('普通身份与管理员代看不能触发报告', async () => {
    for (const request of [{ user: { role: 'user' } }, { ...req(), adminContext: {} }, {}]) {
      const response = res();
      await getAdminCoreUsageReport(request, response);
      expect(response.send).toHaveBeenCalledWith(expect.objectContaining({ status: 403 }));
    }
    expect(generate).not.toHaveBeenCalled();
  });
  it('限定范围，拒绝字符串和无界输入', async () => {
    for (const days of [14, 999, '30']) {
      const response = res();
      await getAdminCoreUsageReport(req(days), response);
      expect(response.send).toHaveBeenCalledWith(expect.objectContaining({ status: 400 }));
    }
    expect(generate).not.toHaveBeenCalled();
  });
  it('并发同范围合并，不同范围拒绝；结束后可重试，无定时缓存', async () => {
    let finish;
    generate.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const a = res(),
      b = res(),
      c = res();
    const one = getAdminCoreUsageReport(req(), a);
    const two = getAdminCoreUsageReport(req(), b);
    await getAdminCoreUsageReport(req(90), c);
    expect(c.send).toHaveBeenCalledWith(expect.objectContaining({ status: 409 }));
    expect(generate).toHaveBeenCalledTimes(1);
    finish({ version: 'core-usage-v1', metrics: {}, timings: ['private-diagnostics'] });
    await Promise.all([one, two]);
    expect(a.send.mock.calls).toEqual(b.send.mock.calls);
    expect(JSON.stringify(a.send.mock.calls)).not.toContain('private-diagnostics');
    generate.mockResolvedValue({ metrics: {} });
    await getAdminCoreUsageReport(req(90), res());
    expect(generate).toHaveBeenCalledTimes(2);
    expect(wrap).toHaveBeenCalledWith(expect.anything(), { transactionOnly: true });
  });
  it('失败隐藏原文并释放并发占位；覆盖不接受浏览器声明', async () => {
    generate.mockRejectedValueOnce(new Error('sensitive database details'));
    const a = res();
    await getAdminCoreUsageReport(req(), a);
    expect(a.send).toHaveBeenCalledWith(expect.objectContaining({ status: 500 }));
    expect(JSON.stringify(a.send.mock.calls)).not.toContain('sensitive');
    generate.mockResolvedValue({ metrics: {} });
    await getAdminCoreUsageReport({ ...req(), body: { days: 7, growthCoverageStart: '2020-01-01' } }, res());
    expect(generate.mock.calls[1][1]).toEqual({ days: 7, storageOffset: '+08:00', conversionRetentionDays: 180 });
  });
});
