import { CODE_PREWARM_GROUPS, PREWARM_PRIORITY } from '@/config/staticPrewarmGroups';
import { syncServiceWorkerAssets } from './assetCache';
import { scheduleStaticPrewarm } from './staticPrewarm';

/**
 * 手机底栏、PC 侧栏、成长中心、手机“我的”页及其支持轻笺是常驻入口，空闲时先备好代码，移动网络下也执行（去重后约 2.9MB，gzip 传输约 0.8MB）；
 * 省流量和 2G/3G 下调度器整体暂停。其余页面与编辑器仍只在不限流量的网络下预热。
 */
export function scheduleAppStartupPrewarm() {
  const stops = [
    scheduleStaticPrewarm({
      groups: [
        'route.home',
        'route.noteLibrary',
        'route.inbox',
        'route.communityChat',
        'route.cloudSpace',
        'route.searchCenter',
        'route.tagMg',
        'route.growth',
        'route.workbenches',
        'route.personCenter',
        'route.support',
      ],
      priority: PREWARM_PRIORITY.browsing,
    }),
    scheduleStaticPrewarm({
      groups: ['route.communityFeed', 'route.bookmarkMg', 'route.noteDetail', 'editor.html', 'editor.markdown'],
      priority: PREWARM_PRIORITY.detail,
      optional: true,
    }),
  ];
  // Service Worker 接管后最后补齐全部代码，之后任何模块都能从持久缓存打开。
  // 全部代码 gzip 后约 7MB，且多数发布会改名大部分分包，只在不限流量网络下补齐。
  let disposed = false;
  void syncServiceWorkerAssets().then((controlled) => {
    if (!controlled || disposed) return;
    stops.push(
      scheduleStaticPrewarm({ groups: [...CODE_PREWARM_GROUPS], priority: PREWARM_PRIORITY.decorative, optional: true }),
    );
  });
  return () => {
    disposed = true;
    stops.forEach((stop) => stop());
  };
}
