import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(resolve(process.cwd(), 'src/components/cloudSpace/CloudStorageBar.vue'), 'utf8');
const pageSource = readFileSync(resolve(process.cwd(), 'src/view/cloudSpace/cloudSpace.vue'), 'utf8');

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
    expect(source).toMatch(
      /:global\(\[data-theme='night'\] \.storage-usage \.storage-bar\)\s*\{[\s\S]*?background:\s*#5d6677;/,
    );
    expect(source).toMatch(/&:hover\s*\{\s*background:\s*transparent;/);
  });

  it('offers a compact progress-only trigger for the mobile single-row toolbar', () => {
    expect(source).toContain("'storage-usage--compact': compact");
    expect(source).toMatch(/\.storage-usage\.storage-usage--compact[\s\S]*?height:\s*40px/u);
    expect(source).toMatch(/\.storage-title,[\s\S]*?\.storage-value,[\s\S]*?\.storage-status[\s\S]*?display:\s*none/u);
    expect(pageSource).toMatch(
      /<template #actions>[\s\S]*?<CloudStorageBar[\s\S]*?compact[\s\S]*?<div class="cloud-view-toggle"/u,
    );
    expect(pageSource).not.toMatch(/<div class="cloud-container"[\s\S]*?<CloudStorageBar/u);
    expect(pageSource).toMatch(/@media \(max-width: 767px\)[\s\S]*?\.cloud-view-label\s*\{\s*display:\s*none;/u);
  });

  it('forwards external layout attributes to the visible popover trigger', () => {
    expect(source).toContain('v-bind="$attrs"');
    expect(source).toContain('defineOptions({ inheritAttrs: false })');
  });

  it('explains the shared quota and separates current files from Trash', () => {
    expect(source).toContain("t('cloudSpace.storageSharedHint')");
    expect(source).toContain("t('cloudSpace.storageActiveFiles')");
    expect(source).toContain("t('cloudSpace.storageTrashFiles')");
    expect(source).toMatch(/max-height:\s*calc\(100vh - 16px\)/);
  });

  it('offers a unified permanent expansion entry for points and the benefit store', () => {
    expect(source).toContain("t('cloudSpace.storageAcquireTitle')");
    expect(source).toContain('<EntitlementAcquireModal v-model:visible="acquireVisible" asset="storage" />');
  });
});
