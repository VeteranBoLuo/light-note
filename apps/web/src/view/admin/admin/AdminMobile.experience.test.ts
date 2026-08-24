import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = (relativePath: string) => readFileSync(resolve(process.cwd(), relativePath), 'utf8');

const adminMobileSource = source('src/view/admin/admin/AdminMobile.vue');
const adminDesktopSource = source('src/view/admin/admin/Admin.vue');
const userMobileSource = source('src/view/admin/components/userMg/UserMgMobile.vue');
const adminPageSource = source('src/components/admin/AdminDataPage.vue');
const adminRouterSource = source('src/router/modules/admin.ts');
const dateFilterSources = [
  source('src/view/admin/components/operationLog/OperationLog.vue'),
  source('src/view/admin/components/apiLog/ApiLog.vue'),
  source('src/view/admin/components/adminAudit/AdminAudit.vue'),
  source('src/view/admin/components/notificationCenter/EmailDeliveryPanel.vue'),
];

describe('mobile admin experience', () => {
  it('管理壳只复用轻量快照读取角标，不再触发完整总览聚合', () => {
    for (const shellSource of [adminDesktopSource, adminMobileSource]) {
      expect(shellSource).toContain('getAdminOverviewSnapshot(true)');
      expect(shellSource).not.toContain("'/api/common/getAdminOverview'");
    }
  });

  it('uses equal-width quick entries and grouped cards instead of the legacy flat phone menu', () => {
    expect(adminMobileSource).toContain('grid-template-columns: repeat(3, minmax(0, 1fr))');
    expect(adminMobileSource).toMatch(/\.admin-mobile-quick-entry\.b_btn\s*\{[\s\S]*?width:\s*100%;/);
    expect(adminMobileSource).toContain('admin-mobile-group__items');
    expect(adminMobileSource).toContain('<BButton');
    expect(adminMobileSource).not.toContain('PhoneMenu');
  });

  it('virtualizes users and automatically loads the next cursor page without a load-more button', () => {
    expect(userMobileSource).toContain('<BVirtualList');
    expect(userMobileSource).toContain('@load-more="loadMore"');
    expect(userMobileSource).toContain(':item-height="112"');
    expect(userMobileSource).not.toContain('mobile-user-load-more');
  });

  it('uses one controlled date-range picker across every admin log surface', () => {
    for (const pageSource of dateFilterSources) {
      expect(pageSource).toContain('<DateRangePicker');
      expect(pageSource).not.toContain('type="date"');
    }
  });

  it('keeps mobile admin headers centered and removes community access routes', () => {
    expect(adminPageSource).toContain("'is-scroll-layout': layout === 'scroll'");
    expect(adminPageSource).toContain('<BButton');
    expect(adminPageSource).not.toMatch(/<button\b/);
    expect(adminRouterSource).not.toContain("path: 'communityChatAccess'");
    expect(adminRouterSource).toContain("path: 'communityChatModeration'");
  });
});
