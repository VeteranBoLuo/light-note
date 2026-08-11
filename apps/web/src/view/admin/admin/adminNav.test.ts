import { describe, expect, it } from 'vitest';
import {
  adminNavTarget,
  buildAdminMobileMenu,
  buildAdminNav,
  resolveActiveNavId,
  type AdminNavEntry,
} from './adminNav';
import adminRouter from '@/router/modules/admin';

/**
 * 手机端可达路由。取自 router/modules/admin.ts 的顶级(扁平)路由
 * 与 securityCenter.ts 的 /securityCenterMobile，改路由时这里要同步。
 */
const MOBILE_ROUTES = new Set([
  '/overview',
  '/actionCenter',
  '/apiLog',
  '/operationLog',
  '/adminAudit',
  '/todoPlanDiagnostics',
  '/userMg',
  '/userOpinion',
  '/resourceGovernance',
  '/communityChatAccess',
  '/communityChatModeration',
  '/agentLog',
  '/aiFeedback',
  '/aiEvaluation',
  '/productInsights',
  '/conversion',
  '/logCleanup',
  '/logExclude',
  '/securityCenterMobile',
  '/notificationCenter',
  '/adminGovernance',
]);

const ICONS = {
  overview: 'i-overview',
  action: 'i-action',
  user: 'i-user',
  ai: 'i-ai',
  growth: 'i-growth',
  log: 'i-log',
  security: 'i-security',
  tool: 'i-tool',
};

function nav(pendingOpinion = 0, pendingSecurity = 0, pendingCommunity = 0, pendingModeration = 0) {
  return buildAdminNav({
    icons: ICONS,
    pendingOpinion,
    pendingSecurity,
    pendingCommunity,
    pendingModeration,
    actionCenterTitle: '待处理中心',
    adminAuditTitle: '管理员操作审计',
    productInsightsTitle: '产品运营分析',
    adminGovernanceTitle: '运行策略与权限',
    aiEvaluationTitle: 'AI 问答测试',
    communityAccessTitle: '社区准入',
    communityModerationTitle: '消息审核',
  });
}

/** 摊平成条目列表，方便断言「某个模块有入口」 */
function allItems(entries: AdminNavEntry[]) {
  return entries.flatMap((entry) => (entry.kind === 'item' ? [entry.item] : entry.items));
}

describe('后台导航菜单', () => {
  it('覆盖全部 23 个后台模块，一个都不漏', () => {
    const ids = allItems(nav()).map((item) => item.id);
    // 20 个 /admin 子路由
    expect(ids).toEqual(
      expect.arrayContaining([
        'overview',
        'actionCenter',
        'userMg',
        'userOpinion',
        'agentLog',
        'aiFeedback',
        'aiEvaluation',
        'productInsights',
        'conversion',
        'pointsOps',
        'communityChatAccess',
        'communityChatModeration',
        'operationLog',
        'adminAudit',
        'todoPlanDiagnostics',
        'apiLog',
        'logCleanup',
        'logExclude',
        'resourceGovernance',
        'adminGovernance',
      ]),
    );
    // 3 个独立顶级路由：此前完全没有后台入口，只能从主导航下拉进
    expect(ids).toEqual(expect.arrayContaining(['knowledgeBase', 'notificationCenter', 'securityCenter']));
    expect(ids).toHaveLength(23);
    expect(new Set(ids).size).toBe(23);
  });

  it('跨外壳的入口给绝对路径并标记 external，后台子路由拼 /admin/{id}', () => {
    const items = allItems(nav());
    const external = items.filter((item) => item.external);
    expect(external.map((item) => item.id).sort()).toEqual(['knowledgeBase', 'notificationCenter', 'securityCenter']);
    for (const item of external) {
      expect(item.path?.startsWith('/')).toBe(true);
      expect(item.path?.startsWith('/admin/')).toBe(false);
      expect(adminNavTarget(item)).toBe(item.path);
    }
    const internal = items.filter((item) => !item.external);
    for (const item of internal) {
      expect(adminNavTarget(item)).toBe(`/admin/${item.id}`);
    }
  });

  it('待处理为 0 时不出角标，有待处理才出，并带可读说明', () => {
    const quiet = allItems(nav(0, 0, 0));
    expect(quiet.every((item) => !item.badge)).toBe(true);

    const busy = allItems(nav(3, 12, 5, 7));
    const opinion = busy.find((item) => item.id === 'userOpinion');
    const security = busy.find((item) => item.id === 'securityCenter');
    const community = busy.find((item) => item.id === 'communityChatAccess');
    const moderation = busy.find((item) => item.id === 'communityChatModeration');
    expect(opinion?.badge).toBe(3);
    expect(opinion?.badgeHint).toContain('3 条反馈待处理');
    expect(security?.badge).toBe(12);
    expect(security?.badgeHint).toContain('12 个高危事件未处理');
    expect(community?.badge).toBe(5);
    expect(community?.badgeHint).toContain('5 条社区申请待审核');
    expect(moderation?.badge).toBe(7);
    expect(moderation?.badgeHint).toContain('7 条消息举报待处理');
  });

  /*
   * 顺序是有意的：日志紧跟用户,「看某个用户 → 翻他的操作/接口日志」是排查时最常走的
   * 一条线,中间隔着 AI 与增长运营会让这段来回跨半屏。原来 arrayContaining 只管
   * 「在不在」不管「在哪」,顺序被改了测试也不会响。
   */
  it('分组顺序固定：日志排在用户之后、AI 之前', () => {
    expect(nav().map((entry) => entry.key)).toEqual([
      'overview',
      'action',
      'user',
      'log',
      'ai',
      'growth',
      'security',
      'tool',
    ]);
  });

  it('手机菜单的分组顺序与桌面一致', () => {
    const groups = buildAdminMobileMenu({
      icons: ICONS,
      pendingOpinion: 0,
      pendingSecurity: 0,
      pendingCommunity: 0,
      pendingModeration: 0,
      actionCenterTitle: '待处理中心',
      adminAuditTitle: '管理员操作审计',
      productInsightsTitle: '产品运营分析',
      adminGovernanceTitle: '运行策略与权限',
      aiEvaluationTitle: 'AI 问答测试',
      communityAccessTitle: '社区准入',
      communityModerationTitle: '消息审核',
    });

    expect(groups.map((group) => group[0].id)).toEqual([
      'overview',
      'actionCenter',
      'userMg',
      'operationLog',
      'agentLog',
      'productInsights',
      'securityCenter',
      'adminGovernance',
    ]);
  });

  it('只有一项的类别不给组头，多项的才分组', () => {
    const entries = nav();
    const standalone = entries.filter((entry) => entry.kind === 'item');
    expect(standalone.map((entry) => entry.key)).toEqual(['overview', 'action', 'security']);
    for (const entry of entries) {
      if (entry.kind === 'group') expect(entry.items.length).toBeGreaterThan(1);
    }
  });

  it('每个分组一个图标，不复用同一个图标充数', () => {
    const icons = nav().map((entry) => entry.icon);
    expect(new Set(icons).size).toBe(icons.length);
  });

  it('菜单不显示代码标识', () => {
    const titles = allItems(nav()).map((item) => item.title);
    expect(titles.some((title) => /^[a-z][a-zA-Z]+$/.test(title))).toBe(false);
  });
});

describe('resolveActiveNavId', () => {
  it('后台子路由取末段', () => {
    expect(resolveActiveNavId('/admin/userMg')).toBe('userMg');
    expect(resolveActiveNavId('/admin/logExclude')).toBe('logExclude');
  });

  it('/admin 本身高亮总览（重定向完成前不该没有高亮）', () => {
    expect(resolveActiveNavId('/admin')).toBe('overview');
    expect(resolveActiveNavId('/admin/')).toBe('overview');
  });

  it('跨外壳路由按前缀判定，带子路径也能高亮对应项', () => {
    expect(resolveActiveNavId('/securityCenter')).toBe('securityCenter');
    // 取末段会得到 'events'，匹配不上任何菜单项
    expect(resolveActiveNavId('/securityCenter/events')).toBe('securityCenter');
    expect(resolveActiveNavId('/securityCenter/ips')).toBe('securityCenter');
    expect(resolveActiveNavId('/notificationCenter')).toBe('notificationCenter');
    expect(resolveActiveNavId('/knowledgeBase')).toBe('knowledgeBase');
  });

  it('前缀判定不误伤同前缀的其他路径', () => {
    expect(resolveActiveNavId('/securityCenterOther')).not.toBe('securityCenter');
  });

  it('高亮项都能在菜单里找到（避免菜单项与路由解析对不上）', () => {
    const ids = new Set(allItems(nav()).map((item) => item.id));
    for (const path of [
      '/admin/overview',
      '/admin/actionCenter',
      '/admin/aiEvaluation',
      '/admin/communityChatAccess',
      '/admin/communityChatModeration',
      '/admin/todoPlanDiagnostics',
      '/securityCenter/events',
      '/notificationCenter',
      '/knowledgeBase',
    ]) {
      expect(ids.has(resolveActiveNavId(path))).toBe(true);
    }
  });
});

describe('手机后台菜单', () => {
  const mobile = () =>
    buildAdminMobileMenu({
      icons: ICONS,
      pendingOpinion: 0,
      pendingSecurity: 0,
      pendingCommunity: 0,
      pendingModeration: 0,
      actionCenterTitle: '待处理中心',
      adminAuditTitle: '管理员操作审计',
      productInsightsTitle: '产品运营分析',
      adminGovernanceTitle: '运行策略与权限',
      aiEvaluationTitle: 'AI 问答测试',
      communityAccessTitle: '社区准入',
      communityModerationTitle: '消息审核',
    });

  it('每一项都指向真实存在的手机路由（点出 404 是最糟的菜单 bug）', () => {
    const items = mobile().flat();
    expect(items.length).toBeGreaterThan(0);
    for (const item of items) {
      expect(MOBILE_ROUTES.has(item.url), `${item.title} 指向了不存在的手机路由 ${item.url}`).toBe(true);
    }
  });

  it('凡是手机上有路由的模块都进菜单，不漏', () => {
    const urls = new Set(
      mobile()
        .flat()
        .map((item) => item.url),
    );
    for (const route of MOBILE_ROUTES) {
      expect(urls.has(route), `手机上有 ${route} 却没有菜单入口`).toBe(true);
    }
  });

  it('标题与桌面一致，不各写一套', () => {
    const desktop = new Map(allItems(nav()).map((item) => [item.id, item.title]));
    for (const item of mobile().flat()) {
      expect(item.title).toBe(desktop.get(item.id));
    }
  });

  it('手机上不可达的模块不进手机菜单', () => {
    const ids = mobile()
      .flat()
      .map((item) => item.id);
    expect(ids).not.toContain('knowledgeBase');
    expect(ids).not.toContain('pointsOps');
  });

  it('按桌面的分组顺序输出，空组不留下来', () => {
    const groups = mobile();
    expect(groups.every((group) => group.length > 0)).toBe(true);
    expect(groups[0][0].id).toBe('overview');
  });
});

describe('社区治理后台路由', () => {
  it('准入和消息审核的桌面后台子路由与移动端 Root 扁平路由同时存在', () => {
    const desktopShell = adminRouter.find((route) => route.path === '/admin');
    expect(desktopShell?.children?.some((route) => route.path === 'communityChatAccess')).toBe(true);
    expect(desktopShell?.children?.some((route) => route.path === 'communityChatModeration')).toBe(true);

    const mobileRoute = adminRouter.find((route) => route.path === 'communityChatAccess');
    expect(mobileRoute).toBeTruthy();
    expect(mobileRoute?.meta?.requireAuth).toBe(true);
    expect(mobileRoute?.meta?.roles).toHaveLength(1);

    const moderationMobileRoute = adminRouter.find((route) => route.path === 'communityChatModeration');
    expect(moderationMobileRoute).toBeTruthy();
    expect(moderationMobileRoute?.meta?.requireAuth).toBe(true);
    expect(moderationMobileRoute?.meta?.roles).toHaveLength(1);
  });
});
