import { describe, expect, it } from 'vitest';
import { formatAdminDeviceLabel, formatAdminUserAgent } from './userAgentFormat';

describe('后台用户浏览器展示', () => {
  it('识别 Chromium 系浏览器时优先保留具体品牌', () => {
    expect(
      formatAdminUserAgent(
        'Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 Chrome/138.0.0.0 Safari/537.36 Edg/138.0.1.0',
      ),
    ).toEqual({ browser: 'Edge 138.0.1.0', device: 'Windows' });
  });

  it('识别 Safari，并可组合设备与浏览器标签', () => {
    const ua = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Version/18.5 Safari/605.1.15';
    expect(formatAdminDeviceLabel(ua)).toBe('macOS · Safari 18.5');
  });

  it('空 UA 使用调用方提供的兜底文案', () => {
    expect(formatAdminUserAgent('', '未知')).toEqual({ browser: '未知', device: '未知' });
  });
});
