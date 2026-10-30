import { describe, expect, it } from 'vitest';
import { filesFitStaging, stagingBytesForFiles } from './storage.js';

const GB = 1024 ** 3;

describe('backup staging estimate', () => {
  it('reserves twice the file size because originals are copied before zipping', () => {
    expect(stagingBytesForFiles(0)).toBe(0);
    expect(stagingBytesForFiles(2 * GB)).toBe(4 * GB);
  });

  it('keeps 512MB free and rejects accounts whose files cannot be packed at once', () => {
    expect(filesFitStaging(2.2 * GB, 24 * GB)).toBe(true);
    expect(filesFitStaging(12.06 * GB, 24 * GB)).toBe(false);
    expect(filesFitStaging(0, 0.6 * GB)).toBe(true);
  });
});
