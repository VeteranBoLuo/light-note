import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(resolve(process.cwd(), 'src/components/inbox/QuickCaptureModal.vue'), 'utf8');

describe('QuickCaptureModal 移动端布局', () => {
  it('待办面板变高时不允许捕获类型 Tab 被纵向 flex 压缩', () => {
    expect(source).toMatch(/\.capture-tabs\s*\{[\s\S]*?flex:\s*0 0 auto;/);
  });
});
