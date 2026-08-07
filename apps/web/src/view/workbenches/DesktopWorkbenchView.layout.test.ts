import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const desktopSource = readFileSync(resolve(process.cwd(), 'src/view/workbenches/DesktopWorkbenchView.vue'), 'utf8');

describe('桌面工作台头部布局稳定性', () => {
  it('首屏常驻数据范围行并显示更新时间加载状态', () => {
    expect(desktopSource).toContain('<small class="workbench-data-scope">');
    expect(desktopSource).not.toContain('<small v-if="lastUpdatedAt" class="workbench-data-scope">');
    expect(desktopSource).toMatch(
      /workbench\.meta\.todayRange[\s\S]*?class="workbench-data-updated"[\s\S]*?lastUpdatedAt \?[\s\S]*?common\.loading/,
    );
    expect(desktopSource).toMatch(/\.workbench-data-scope\s*\{[\s\S]*?min-height:\s*1\.4em/);
    expect(desktopSource).toMatch(/\.workbench-data-updated\s*\{[\s\S]*?min-width:\s*12em/);
  });
});
