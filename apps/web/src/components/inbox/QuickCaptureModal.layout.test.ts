import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(resolve(process.cwd(), 'src/components/inbox/QuickCaptureModal.vue'), 'utf8');

describe('QuickCaptureModal 移动端布局', () => {
  it('待办面板变高时不允许捕获类型 Tab 被纵向 flex 压缩', () => {
    expect(source).toMatch(/\.capture-tabs\s*\{[\s\S]*?flex:\s*0 0 auto;/);
  });

  it('只为待办捕获提高移动端抽屉高度', () => {
    expect(source).toContain("height: captureType.value === 'todo' ? '88vh' : '83vh'");
  });

  it('四个捕获类型的顶部提示条保持统一起始高度且不参与纵向压缩', () => {
    expect(source).toMatch(
      /\.capture-intro-strip\s*\{[^}]*flex:\s*0 0 auto;[^}]*min-height:\s*64px;/,
    );
    expect(source).not.toMatch(/\.capture-intro-strip\s*\{[^}]*max-height:/);
  });
});
