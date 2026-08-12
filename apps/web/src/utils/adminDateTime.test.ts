import { describe, expect, it } from 'vitest';
import { formatAdminDateTime, parseAdminDateTime } from './adminDateTime';

describe('后台北京时间格式化', () => {
  it('把 UTC 03:10 固定展示为北京时间 11:10', () => {
    expect(formatAdminDateTime('2026-08-12T03:10:00Z', 'zh-CN')).toContain('11:10');
  });

  it('无时区的后台业务时间默认按北京时间解释，不跟随设备时区猜测', () => {
    expect(parseAdminDateTime('2026-08-12 11:10:00')?.toISOString()).toBe('2026-08-12T03:10:00.000Z');
  });

  it('明确声明为 UTC 的 SQL 时间按 UTC 解释', () => {
    expect(parseAdminDateTime('2026-08-12 03:10:00', 'utc')?.toISOString()).toBe('2026-08-12T03:10:00.000Z');
  });
});
