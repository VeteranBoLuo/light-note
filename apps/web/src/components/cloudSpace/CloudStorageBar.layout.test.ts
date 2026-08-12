import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(resolve(process.cwd(), 'src/components/cloudSpace/CloudStorageBar.vue'), 'utf8');

describe('CloudStorageBar compact layout', () => {
  it('keeps the preferred title, capacity, and percent horizontal layout', () => {
    expect(source).toMatch(
      /<div class="storage-head">[\s\S]*?storage-title[\s\S]*?storage-meta[\s\S]*?storage-value[\s\S]*?storage-percent[\s\S]*?<\/div>/,
    );
  });

  it('places the warning after the progress track so it cannot overlap capacity values', () => {
    expect(source).toMatch(
      /class="storage-bar"[\s\S]*?storage-bar-fill[\s\S]*?v-if="statusLabel" class="storage-status"/,
    );
  });

  it('uses an explicit visible dark-theme track and no card-like hover background', () => {
    expect(source).toMatch(/\[data-theme='night'\][\s\S]*?\.storage-bar\s*\{[\s\S]*?background:\s*#5d6677;/);
    expect(source).toMatch(/&:hover\s*\{\s*background:\s*transparent;/);
  });

  it('explains the shared quota and separates current files from Trash', () => {
    expect(source).toContain("t('cloudSpace.storageSharedHint')");
    expect(source).toContain("t('cloudSpace.storageActiveFiles')");
    expect(source).toContain("t('cloudSpace.storageTrashFiles')");
    expect(source).toMatch(/max-height:\s*calc\(100vh - 16px\)/);
  });
});
