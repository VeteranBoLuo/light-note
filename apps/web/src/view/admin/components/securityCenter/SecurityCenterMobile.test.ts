import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const mobileSource = readFileSync(resolve(process.cwd(), 'src/view/admin/components/securityCenter/SecurityCenterMobile.vue'), 'utf8');
const routeSource = readFileSync(resolve(process.cwd(), 'src/router/modules/securityCenter.ts'), 'utf8');

describe('移动端安全中心模块切换', () => {
  it('四个导航切换独立内容模块，不再通过滚动模拟 Tab', () => {
    for (const tab of ['overview', 'review', 'quality', 'access']) {
      expect(mobileSource).toContain(`selectTab('${tab}')`);
      expect(mobileSource).toContain(`data-section="${tab}"`);
      expect(mobileSource).toContain(`mobileTab === '${tab}'`);
    }
    expect(mobileSource).not.toContain('scrollIntoView');
    expect(mobileSource).not.toContain("router.push('/securityCenter/access-control')");
  });

  it('旧移动端入口保留目标模块，不再全部落到同一个固定页面', () => {
    expect(routeSource).toContain("query: { tab: 'overview' }");
    expect(routeSource).toContain("query: { tab: 'review' }");
    expect(routeSource).toContain("query: { tab: 'quality' }");
    expect(routeSource).toContain("query: { tab: 'access' }");
  });
});
