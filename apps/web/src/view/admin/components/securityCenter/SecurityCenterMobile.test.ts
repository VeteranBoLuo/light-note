import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const mobileSource = readFileSync(
  resolve(process.cwd(), 'src/view/admin/components/securityCenter/SecurityCenterMobile.vue'),
  'utf8',
);
const routeSource = readFileSync(resolve(process.cwd(), 'src/router/modules/securityCenter.ts'), 'utf8');

describe('移动端安全中心模块切换', () => {
  it('只保留移动端可安全浏览的安全态势与事件复核', () => {
    for (const tab of ['overview', 'review']) {
      expect(mobileSource).toContain(`selectTab('${tab}')`);
      expect(mobileSource).toContain(`data-section="${tab}"`);
      expect(mobileSource).toContain(`mobileTab === '${tab}'`);
    }
    expect(mobileSource).not.toContain("selectTab('quality')");
    expect(mobileSource).not.toContain("selectTab('access')");
    expect(mobileSource).not.toContain('SecurityAccessControl');
    expect(mobileSource).not.toContain('securityV2.mobile.desktop');
    expect(mobileSource).not.toContain('scrollIntoView');
    expect(mobileSource).not.toContain("router.push('/securityCenter/access-control')");
    expect(mobileSource).not.toContain('function classify');
    expect(mobileSource).not.toContain('/disposition');
    expect(mobileSource).toContain('read-only');
  });

  it('旧移动端入口只保留受支持模块，桌面专属入口回到安全态势', () => {
    expect(routeSource).toContain("query: { tab: 'overview' }");
    expect(routeSource).toContain("query: { tab: 'review' }");
    expect(routeSource).not.toContain("query: { tab: 'quality' }");
    expect(routeSource).not.toContain("query: { tab: 'access' }");
  });

  it('安全态势包含五类趋势和仅在有数据时显示的最吵规则', () => {
    expect(mobileSource).toContain('v-if="trend.length"');
    expect(mobileSource).toContain('chartPoints(series.key)');
    for (const series of ['raw', 'confirmed', 'falsePositive', 'benignAnomaly', 'authorizedTest']) {
      expect(mobileSource).toContain(`key: '${series}'`);
    }
    expect(mobileSource).toContain('v-if="noisyRules.length"');
    expect(mobileSource).toContain("'/api/security/v2/rules/quality'");
  });

  it('消费 eventId 深链、保留 returnTo，并在关闭详情时只清理事件参数', () => {
    expect(mobileSource).toContain('normalizeAdminActionCenterReturnTo');
    expect(mobileSource).toContain('route.query.eventId');
    expect(mobileSource).toContain("tab: 'review', eventId: activeEventId.value");
    expect(mobileSource).toContain('eventId: undefined');
    expect(mobileSource).toContain('returnTo.value');
  });
});
