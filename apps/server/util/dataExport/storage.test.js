import { describe, expect, it } from 'vitest';
import { filesFitStaging, stagingBytesForFiles } from './storage.js';

const GB = 1024 ** 3;

describe('backup staging estimate', () => {
  it('reserves twice the file size plus 8GB headroom for the shared system disk', () => {
    expect(stagingBytesForFiles(0)).toBe(0);
    expect(stagingBytesForFiles(2 * GB)).toBe(12 * GB);
  });

  it('rejects accounts whose files would leave the server without headroom', () => {
    expect(filesFitStaging(2.2 * GB, 24 * GB)).toBe(true);
    // 线上 49GB 系统盘剩约 29GB 时，12.06GB 原件打包后只会剩约 4GB，不能放行。
    expect(filesFitStaging(12.06 * GB, 29 * GB)).toBe(false);
    expect(filesFitStaging(10 * GB, 29 * GB)).toBe(true);
    expect(filesFitStaging(0, 0.6 * GB)).toBe(true);
  });
});
