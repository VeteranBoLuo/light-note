import { describe, it, expect, vi } from 'vitest';
import { createProgressReporter, normalizeImportProgress } from './progress.js';
describe('import progress contract', () => {
  it('validates stages, numbers and removes source paths', () => {
    expect(normalizeImportProgress({ stage: 'fake' })).toBeNull();
    expect(
      normalizeImportProgress({ stage: 'reading', currentFile: '/private/test.html', imagesDone: -1 }),
    ).toMatchObject({ currentFile: 'test.html', imagesDone: 0, imagesTotal: null });
  });
  it('throttles counts, immediately changes phases and flushes final counts', async () => {
    let now = 0;
    const write = vi.fn();
    const report = createProgressReporter(write, () => now);
    await report({ stage: 'reading', filesDone: 0 });
    await report({ stage: 'reading', filesDone: 1 });
    expect(write).toHaveBeenCalledTimes(1);
    await report({ stage: 'extracting_images', imagesDone: 0 });
    await report({ stage: 'extracting_images', imagesDone: 5 });
    expect(write).toHaveBeenCalledTimes(2);
    await report.flush();
    expect(write.mock.calls.at(-1)[0].imagesDone).toBe(5);
    now = 1100;
    await report({ stage: 'extracting_images', imagesDone: 6 });
    expect(write).toHaveBeenCalledTimes(4);
  });
  it('serializes writes and surfaces lease failures on flush', async () => {
    const report = createProgressReporter(async () => {
      throw new Error('lease lost');
    });
    await expect(report({ stage: 'reading' })).rejects.toThrow('lease lost');
    await expect(report.flush()).rejects.toThrow('lease lost');
  });
});
