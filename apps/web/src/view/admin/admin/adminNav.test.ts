import { describe, expect, it } from 'vitest';
import { adminNavTarget, buildAdminNav, resolveActiveNavId, type AdminNavEntry } from './adminNav';

const ICONS = {
  overview: 'i-overview',
  user: 'i-user',
  ai: 'i-ai',
  growth: 'i-growth',
  log: 'i-log',
  security: 'i-security',
  tool: 'i-tool',
};

function nav(pendingOpinion = 0, pendingSecurity = 0) {
  return buildAdminNav({ icons: ICONS, pendingOpinion, pendingSecurity, aiEvaluationTitle: 'AI 问答测试' });
}

/** 摊平成条目列表，方便断言「某个模块有入口」 */
function allItems(entries: AdminNavEntry[]) {
  return entries.flatMap((entry) => (entry.kind === 'item' ? [entry.item] : entry.items));
}

describe('后台导航菜单', () => {
  it('覆盖全部 17 个后台模块，一个都不漏', () => {
    const ids = allItems(nav()).map((item) => item.id);
    // 14 个 /admin 子路由
    expect(ids).toEqual(
      expect.arrayContaining([
        'overview',
        'userMg',
        'userOpinion',
        'agentLog',
        'aiFeedback',
        'aiEvaluation',
        'conversion',
        'pointsOps',
        'operationLog',
        'apiLog',
        'logCleanup',
        'logExclude',
        'simpleSql',
        'imageMg',
      ]),
    );
    // 3 个独立顶级路由：此前完全没有后台入口，只能从主导航下拉进
    expect(ids).toEqual(expect.arrayContaining(['knowledgeBase', 'notificationCenter', 'securityCenter']));
    expect(ids).toHaveLength(17);
    expect(new Set(ids).size).toBe(17);
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
    const quiet = allItems(nav(0, 0));
    expect(quiet.every((item) => !item.badge)).toBe(true);

    const busy = allItems(nav(3, 12));
    const opinion = busy.find((item) => item.id === 'userOpinion');
    const security = busy.find((item) => item.id === 'securityCenter');
    expect(opinion?.badge).toBe(3);
    expect(opinion?.badgeHint).toContain('3 条反馈待处理');
    expect(security?.badge).toBe(12);
    expect(security?.badgeHint).toContain('12 个高危事件未处理');
  });

  it('只有一项的类别不给组头，多项的才分组', () => {
    const entries = nav();
    const standalone = entries.filter((entry) => entry.kind === 'item');
    expect(standalone.map((entry) => entry.key)).toEqual(['overview', 'security']);
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
    expect(titles).not.toContain('simpleSql');
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
      '/admin/simpleSql',
      '/admin/aiEvaluation',
      '/securityCenter/events',
      '/notificationCenter',
      '/knowledgeBase',
    ]) {
      expect(ids.has(resolveActiveNavId(path))).toBe(true);
    }
  });
});
