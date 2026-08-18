import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(resolve(process.cwd(), 'src/view/personCenter/PersonCenter.vue'), 'utf8');

describe('PersonCenter 顶栏头像成长提醒', () => {
  it('只裁剪普通头像，不裁剪同级的成长红点和头像框外饰', () => {
    expect(source).toContain('<span v-else class="navigation-avatar-clip">');
    expect(source).toContain('layout-mode="slot"');
    expect(source).toMatch(/\.navigation-icon\s*\{[^}]*overflow:\s*visible;/);
    expect(source).toMatch(
      /\.navigation-icon\s*\{[^}]*grid-template:\s*minmax\(0, 1fr\) \/ minmax\(0, 1fr\);[^}]*width:\s*40px;/,
    );
    expect(source).not.toMatch(/\.navigation-icon\s*\{[^}]*clip-path:\s*circle/);
    expect(source).toMatch(/\.navigation-avatar-clip\s*\{[^}]*clip-path:\s*circle\(50% at 50% 50%\);/);
    expect(source).toMatch(
      /<span v-else class="navigation-avatar-clip">[\s\S]*?<\/span>\s*<span v-if="growthInfo\?\.hasUnreadLevelUp" class="nav-avatar-dot">/,
    );
  });
});
