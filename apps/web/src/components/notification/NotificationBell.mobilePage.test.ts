import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(resolve(process.cwd(), 'src/components/notification/NotificationBell.vue'), 'utf8');

describe('移动端通知入口', () => {
  it('从铃铛进入独立通知页，不再渲染近全屏底部抽屉', () => {
    expect(source).toContain("router.push({ name: 'notifications' })");
    expect(source).not.toContain('<BDrawer');
    expect(source).not.toContain('mobile-full-screen');
  });

  it('通知页保留返回、全部已读、筛选分组和可滚动面板', () => {
    expect(source).toContain('v-if="page" class="nt-page"');
    expect(source).toContain('@click="leaveNotificationPage"');
    expect(source).toContain("t('notification.markAllRead')");
    expect(source).toMatch(/<NotificationCenterPanel[\s\S]*?mobile[\s\S]*?@switch-tab="switchTab"/);
    expect(source).toMatch(/\.nt-page[\s\S]*?height:\s*100%[\s\S]*?overflow:\s*hidden/);
  });

  it('移动端与 PC 共用通知中心，后端只放行直接回复，聊天室角标保持独立', () => {
    expect(source).toContain('useNotification()');
    expect(source).not.toContain('excludeCommunityChat: isMobileLayout');
  });

  it('从通知完成待办后立即刷新导航与底栏共用的注意力角标', () => {
    expect(source).toContain("import { inboxStore, useUserStore } from '@/store'");
    expect(source).toContain('const inbox = inboxStore()');
    expect(source).toMatch(
      /if \(res\.status === 200\) \{[\s\S]*n\.todoState = 'completed';[\s\S]*await Promise\.all\(\[markNotificationRead\(n\), inbox\.refreshCount\(\)\]\)/,
    );
  });

  it('PC 铃铛默认无底色，只在悬停或面板展开时强调', () => {
    expect(source).toContain(`:class="{ 'is-open': open }"`);
    expect(source).toContain(':aria-expanded="open"');
    expect(source).toMatch(/\.nt-bell\s*\{[\s\S]*?background:\s*transparent !important;/);
    expect(source).toMatch(/\.nt-bell:hover\s*\{[\s\S]*?var\(--menu-item-h-bg-color\) !important;/);
    expect(source).toMatch(
      /\.nt-bell\.is-open\s*\{[\s\S]*?color:\s*var\(--primary-color\);[\s\S]*?color-mix\(in srgb, var\(--primary-color\) 10%, transparent\) !important;/,
    );
  });
});
