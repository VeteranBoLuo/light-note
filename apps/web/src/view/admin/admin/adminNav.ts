/**
 * 后台导航的数据与高亮解析。
 *
 * 从 Admin.vue 抽出来是为了能直接测：菜单本身是「哪些模块存在、归在哪一类、
 * 点了去哪」的事实表，出错的表现是入口消失或指错地方，比样式更该被锁住。
 */

export type AdminNavItem = {
  id: string;
  title: string;
  /** 后台子路由只给 id（拼成 /admin/{id}）；跨外壳的入口给绝对路径 */
  path?: string;
  /** 独立顶级路由（安全中心/通知中心/知识库）不在 /admin 外壳内，点击会整页切换 */
  external?: boolean;
  badge?: number;
  badgeHint?: string;
};

export type AdminNavEntry =
  | { kind: 'item'; key: string; icon: string; item: AdminNavItem }
  | { kind: 'group'; key: string; title: string; icon: string; items: AdminNavItem[] };

export type AdminNavIcons = {
  overview: string;
  user: string;
  ai: string;
  growth: string;
  log: string;
  security: string;
  tool: string;
};

export type AdminNavInput = {
  icons: AdminNavIcons;
  pendingOpinion: number;
  pendingSecurity: number;
  /** AI 问答测试集页标题走 i18n，由调用方注入 */
  aiEvaluationTitle: string;
};

/** 跨外壳入口：这些是独立顶级路由，路径不能按 /admin/{id} 拼 */
const EXTERNAL_PATHS: Record<string, string> = {
  knowledgeBase: '/knowledgeBase',
  notificationCenter: '/notificationCenter',
  securityCenter: '/securityCenter',
};

/**
 * 分组导航。此前是 14 项纯平铺，且 14 项里 6 项共用 icon.userCenter.log、3 项共用 sql，
 * 图标不携带任何信息还会误导（总览和 api 日志长得一样）。可用图标只有 9 个，
 * 所以改成「图标标类别、文字标条目」：每组一个语义正确的图标，组内条目不再挂重复图标。
 *
 * 安全中心 / 通知中心 / 知识库也列进来。它们是独立顶级路由，此前只能从主导航的管理
 * 下拉进入，进了 /admin 就再也看不到入口——后台实际被切成 4 座互不相连的孤岛。
 *
 * 只有一项的类别不给组头（「总览 / 系统总览」这种重复标题白占一行），直接作顶层条目。
 */
export function buildAdminNav({
  icons,
  pendingOpinion,
  pendingSecurity,
  aiEvaluationTitle,
}: AdminNavInput): AdminNavEntry[] {
  return [
    {
      kind: 'item',
      key: 'overview',
      icon: icons.overview,
      item: { id: 'overview', title: '总览' },
    },
    {
      kind: 'group',
      key: 'user',
      title: '用户',
      icon: icons.user,
      items: [
        { id: 'userMg', title: '用户管理' },
        {
          id: 'userOpinion',
          title: '用户反馈',
          badge: pendingOpinion,
          badgeHint: `${pendingOpinion} 条反馈待处理`,
        },
      ],
    },
    {
      // 日志紧跟用户：排查问题时「看某个用户 → 翻他的操作/接口日志」是最常走的一条线，
      // 中间隔着 AI 与增长运营会让这段来回跨半屏。
      kind: 'group',
      key: 'log',
      title: '日志',
      icon: icons.log,
      items: [
        { id: 'operationLog', title: '操作日志' },
        { id: 'apiLog', title: 'API 日志' },
        { id: 'todoPlanDiagnostics', title: '待办计划诊断' },
        { id: 'logCleanup', title: '日志清理' },
        { id: 'logExclude', title: '日志白名单' },
      ],
    },
    {
      kind: 'group',
      key: 'ai',
      title: 'AI',
      icon: icons.ai,
      items: [
        { id: 'agentLog', title: 'AI 监控' },
        { id: 'aiFeedback', title: 'AI 回答反馈' },
        { id: 'aiEvaluation', title: aiEvaluationTitle },
        { id: 'knowledgeBase', title: 'AI 知识库', path: EXTERNAL_PATHS.knowledgeBase, external: true },
      ],
    },
    {
      kind: 'group',
      key: 'growth',
      title: '增长运营',
      icon: icons.growth,
      items: [
        { id: 'conversion', title: '转化漏斗' },
        { id: 'pointsOps', title: '积分运营' },
        { id: 'notificationCenter', title: '通知中心', path: EXTERNAL_PATHS.notificationCenter, external: true },
      ],
    },
    {
      kind: 'item',
      key: 'security',
      icon: icons.security,
      item: {
        id: 'securityCenter',
        title: '安全中心',
        path: EXTERNAL_PATHS.securityCenter,
        external: true,
        badge: pendingSecurity,
        badgeHint: `${pendingSecurity} 个高危事件未处理`,
      },
    },
    {
      kind: 'group',
      key: 'tool',
      title: '工具',
      icon: icons.tool,
      items: [
        // 菜单里此前直接显示代码标识 "simpleSql"
        { id: 'simpleSql', title: 'SQL 控制台' },
        { id: 'resourceGovernance', title: '资源治理' },
      ],
    },
  ];
}

/**
 * 当前高亮项。跨外壳路由有自己的子路径（如 /securityCenter/events），
 * 取末段会得到 'events' 这种匹配不上任何菜单项的值，所以按前缀判定。
 */
export function resolveActiveNavId(path: string): string {
  for (const [id, prefix] of Object.entries(EXTERNAL_PATHS)) {
    if (path === prefix || path.startsWith(`${prefix}/`)) return id;
  }
  const last = path.split('/').filter(Boolean).pop();
  // /admin 本身会重定向到 /admin/overview，重定向完成前先高亮总览
  return !last || last === 'admin' ? 'overview' : last;
}

/** 菜单项的目标路径。后台子路由拼 /admin/{id}，跨外壳的用自带绝对路径。 */
export function adminNavTarget(item: AdminNavItem): string {
  return item.path || `/admin/${item.id}`;
}

/**
 * 移动端能到达的模块 → 手机专用路径。
 *
 * 手机后台是另一套扁平路由（App.vue 的 phoneReplaceMap 把 /admin/xxx 换成 /xxx），
 * 不在这张表里的模块在手机上**没有路由**，列进菜单会点出 404。
 *
 * 故意不收录：
 * - simpleSql / knowledgeBase：双栏工作台（编辑器占满高度），手机屏放不下；
 * - pointsOps：无手机路由，且发放积分是需要核对的写操作，不适合在手机上顺手做。
 */
const MOBILE_PATHS: Record<string, string> = {
  overview: '/overview',
  userMg: '/userMg',
  userOpinion: '/userOpinion',
  agentLog: '/agentLog',
  aiFeedback: '/aiFeedback',
  aiEvaluation: '/aiEvaluation',
  conversion: '/conversion',
  notificationCenter: '/notificationCenter',
  operationLog: '/operationLog',
  todoPlanDiagnostics: '/todoPlanDiagnostics',
  apiLog: '/apiLog',
  logCleanup: '/logCleanup',
  logExclude: '/logExclude',
  securityCenter: '/securityCenterMobile',
  resourceGovernance: '/resourceGovernance',
};

export type AdminMobileMenuItem = { id: string; title: string; url: string };

/**
 * 手机后台菜单。和桌面共用 buildAdminNav 的标题与分组顺序，避免两端漂移——
 * 此前两份菜单各写各的，手机端少 4 个模块、还留着「api日志」这种没统一过的写法。
 * PhoneMenu 按「数组的数组」分组渲染卡片，所以这里输出二维数组。
 */
export function buildAdminMobileMenu(input: AdminNavInput): AdminMobileMenuItem[][] {
  return buildAdminNav(input)
    .map((entry) => {
      const items = entry.kind === 'item' ? [entry.item] : entry.items;
      return items
        .filter((item) => MOBILE_PATHS[item.id])
        .map((item) => ({ id: item.id, title: item.title, url: MOBILE_PATHS[item.id] }));
    })
    .filter((group) => group.length > 0);
}
