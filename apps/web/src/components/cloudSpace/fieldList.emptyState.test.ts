import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(resolve(process.cwd(), 'src/components/cloudSpace/fieldList.vue'), 'utf8');

describe('cloud file empty state layout', () => {
  it('does not keep an empty scroll container above the empty state', () => {
    expect(source).toContain(`v-if="viewMode === 'card' && (cloud.loading || cloud.fileList.length)"`);
    expect(source).toContain(`v-if="viewMode === 'table' && (cloud.loading || cloud.fileList.length)"`);
    expect(source).toMatch(/\.file-empty-state\s*\{[\s\S]*?min-height:\s*0;[\s\S]*?flex:\s*1;/);
  });
});
