import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const inboxSource = readFileSync(resolve(process.cwd(), 'src/view/inbox/Inbox.vue'), 'utf8');
const inboxItemSource = readFileSync(resolve(process.cwd(), 'src/components/inbox/InboxItem.vue'), 'utf8');
const resourcePageShellSource = readFileSync(
  resolve(process.cwd(), 'src/components/base/ResourcePageShell.vue'),
  'utf8',
);
const themeSource = readFileSync(resolve(process.cwd(), 'src/assets/css/theme.less'), 'utf8');
const dayThemeStart = themeSource.indexOf("\n[data-theme='day'] {") + 1;
const nightThemeStart = themeSource.indexOf("\n[data-theme='night'] {") + 1;
const dayThemeSource = themeSource.slice(dayThemeStart, nightThemeStart);
const nightThemeSource = themeSource.slice(nightThemeStart);
const mobileTodoTemplate = inboxSource.slice(
  inboxSource.indexOf('<template v-if="isMobileTodoPrimary">'),
  inboxSource.indexOf('<template v-else>', inboxSource.indexOf('<template v-if="isMobileTodoPrimary">')),
);

describe('移动端待办页签布局', () => {
  it('待整理桌面端使用范围、队列和检查器三栏，移动端回落到单列', () => {
    expect(inboxSource).toContain('class="resource-inbox-scope"');
    expect(inboxSource).toContain(
      "'inbox-page--resource-workspace': !embedded && !isTodoFocused && !bookmark.isMobile",
    );
    expect(inboxSource).toContain('class="resource-inbox-inspector"');
    expect(inboxSource).toMatch(
      /\.inbox-page--resource-workspace\s*\{[\s\S]*?grid-template-columns:\s*210px minmax\(0, 1fr\) 320px/,
    );
    expect(inboxSource).toMatch(
      /@media \(min-width: 768px\) and \(max-width: 980px\)[\s\S]*?\.resource-inbox-scope,[\s\S]*?\.resource-inbox-inspector\s*\{[\s\S]*?display:\s*none/,
    );
    expect(inboxSource).toContain('v-if="!embedded && !isTodoFocused && isMobileResourceInbox"');
  });

  it('桌面待整理与资源中心其他视图保持相同标题和正文纵向基线', () => {
    expect(resourcePageShellSource).toMatch(/\.resource-page-shell\s*\{[\s\S]*?gap:\s*14px/);
    expect(resourcePageShellSource).toMatch(/\.resource-page-header\s*\{[\s\S]*?min-height:\s*54px/);
    expect(resourcePageShellSource).toMatch(/p\s*\{[\s\S]*?margin:\s*5px 0 0 17px/);
    expect(inboxSource).toMatch(
      /\.inbox-page--resource-workspace > \.inbox-hero\s*\{[\s\S]*?min-height:\s*54px;[\s\S]*?margin-bottom:\s*14px/,
    );
    expect(inboxSource).toMatch(/\.inbox-page--resource-workspace \.inbox-hero p\s*\{[\s\S]*?margin-top:\s*5px/);
  });

  it('待整理范围继续复用原类型、排序和资源操作', () => {
    expect(inboxSource).toContain('v-for="item in filterOptions"');
    expect(inboxSource).toContain('@click="changeInboxScope(item.key)"');
    expect(inboxSource).toContain('v-for="item in sortOptions"');
    expect(inboxSource).toContain('@click="changeInboxSort(item.value)"');
    expect(inboxSource).toContain('@click="openResource(inspectedInboxItem)"');
    expect(inboxSource).toContain('@click="completeOne(inspectedInboxItem)"');
    expect(inboxSource).toContain('@click="confirmDelete([inspectedInboxItem])"');
    expect(inboxSource).toContain('@click="openInboxResourceAi(inspectedInboxItem)"');
    expect(inboxSource).toContain(':skill-id="inboxAiSkillId"');
    expect(inboxSource).toContain("resourceType === 'file') return 'file.summarize'");
    expect(inboxSource).toContain("resourceType === 'note') return 'note.batch_summarize'");
    expect(inboxSource).toContain("resourceType === 'bookmark') return 'bookmark.summarize_page'");
    expect(inboxSource).toContain('auto-run-action-id="analyze"');
    expect(inboxSource).not.toContain('class="inbox-item__actions inbox-item__actions--desktop"');
    expect(inboxSource).toMatch(
      /\.resource-inbox-inspector__actions\s*\{[\s\S]*?grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/,
    );
    expect(inboxSource).not.toContain('.resource-inbox-inspector__actions :deep(.b_btn:first-child)');
    expect(inboxSource).not.toMatch(/resource-inbox-inspector__action--ai\s*\{[\s\S]*?color:/);
    expect(inboxSource).toContain('class="resource-inbox-inspector__summary"');
    expect(inboxSource).toContain("inspectedInboxItem.resourceType === 'note'");
    expect(inboxSource).toMatch(/\.resource-inbox-inspector\s*\{[\s\S]*?overflow:\s*hidden;/);
    expect(inboxSource).toMatch(
      /\.resource-inbox-inspector__summary\.is-scrollable\s*\{[\s\S]*?flex:\s*1 1 auto;[\s\S]*?overflow:\s*hidden auto;/,
    );
  });

  it('嵌入整理中心时只解析资源类型，空筛选稳定回落到全部资源而不是待办', () => {
    expect(inboxSource).toContain(":is=\"embedded ? 'div' : 'main'\"");
    expect(inboxSource).not.toContain('<main\n    class="inbox-page"');
    expect(inboxSource).toContain(
      'return embedded.value ? resolveResourceFilter(route.query.resourceType) : resolveRequestedFilter(route.query.tab);',
    );
    expect(inboxSource).toMatch(
      /const nextFilter = embedded\.value\s*\? resolveResourceFilter\(requestedFilter\)\s*: resolveRequestedFilter\(requestedFilter\)/,
    );
    expect(inboxSource).toMatch(
      /function resolveResourceFilter[\s\S]*?isMobileResourceInboxTab\(tab\) \? tab : \('all' as const\)/,
    );
  });

  it('嵌入整理中心默认浏览资源，只有显式进入批量模式才显示勾选与批量操作', () => {
    expect(inboxSource).toContain(
      'const usesExplicitResourceSelection = computed(() => embedded.value || isMobileResourceInbox.value)',
    );
    expect(inboxSource).toContain('@click="toggleResourceSelectionMode"');
    expect(inboxSource).toContain(':selectable="!usesExplicitResourceSelection || resourceSelectionMode"');
    expect(inboxSource).toContain('(!usesExplicitResourceSelection || resourceSelectionMode)');
    expect(inboxSource).toMatch(/function toggleResourceSelectionMode[\s\S]*?enterResourceSelection\(\)/);
    expect(inboxSource).toContain(':show-inline-actions="embedded && !bookmark.isMobile"');
    expect(inboxItemSource).toContain('class="inbox-item__actions inbox-item__actions--inline"');
    expect(inboxItemSource).toContain("t('inbox.organize')");
    expect(inboxItemSource).toContain("t('inbox.complete')");
  });

  it('移动端嵌入工具栏重置桌面宽度 flex 基准，不挤占待整理列表高度', () => {
    expect(inboxSource).toMatch(
      /@media \(max-width: 767px\)[\s\S]*?\.inbox-page--embedded \.inbox-toolbar__right--resources\s*\{[\s\S]*?flex:\s*0 0 auto;/,
    );
  });

  it('整理中心内层筛选使用轻量胶囊，并隐藏零值角标', () => {
    expect(inboxSource).toContain('const visibleBadge = (count: number) => (count > 0 ? count : undefined)');
    expect(inboxSource).toMatch(
      /\.inbox-page--embedded \.inbox-toolbar :deep\(\.is-pill \.tab\.is-active\)\s*\{[\s\S]*?border-color:\s*var\(--surface-border-color\);[\s\S]*?box-shadow:\s*none;/,
    );
    expect(inboxSource).toMatch(
      /\.inbox-page--embedded \.inbox-toolbar :deep\(\.tab-badge\)\s*\{[\s\S]*?height:\s*18px;[\s\S]*?font-size:\s*10px;/,
    );
  });

  it('桌面待整理搜索框占满工具栏剩余宽度，快速添加固定在最右侧', () => {
    expect(inboxSource).toContain('class="inbox-toolbar__right inbox-toolbar__right--resources"');
    expect(inboxSource).toMatch(
      /\.inbox-toolbar__right--resources\s*\{[\s\S]*?width:\s*100%;[\s\S]*?grid-template-columns:\s*minmax\(0, 1fr\) auto;[\s\S]*?flex:\s*1 1 auto;/,
    );
    expect(inboxSource).toMatch(
      /\.inbox-page--embedded \.inbox-toolbar__right--resources :deep\(\.b-input\),[\s\S]*?\.select-trigger[\s\S]*?> \.b_btn\s*\{[\s\S]*?height:\s*40px;[\s\S]*?min-height:\s*40px;/,
    );
  });

  it('桌面待办的搜索、排序与批量入口共享 40px 控件基线', () => {
    expect(inboxSource).toContain('class="todo-toolbar-control todo-toolbar-control--search"');
    expect(inboxSource).toContain('class="todo-toolbar-control todo-toolbar-control--sort"');
    expect(inboxSource).toContain('class="todo-toolbar-control todo-toolbar-control--batch"');
    expect(inboxSource).toMatch(
      /\.todo-toolbar-control--search :deep\(\.b-input\),[\s\S]*?\.todo-toolbar-control--sort :deep\(\.select-trigger\),[\s\S]*?\.todo-toolbar-control--batch\.b_btn\s*\{[\s\S]*?height:\s*40px;[\s\S]*?min-height:\s*40px;/,
    );
  });

  it('独立桌面页点击待整理卡片更新检查器，移动端与整理中心嵌入态直接打开资源', () => {
    expect(inboxSource).not.toContain('@mouseenter="inspectInboxResource(action.item)"');
    expect(inboxSource).not.toContain('@focusin="inspectInboxResource(action.item)"');
    expect(inboxSource).toContain('@open="handleInboxItemOpen(action.item)"');
    expect(inboxSource).toMatch(/const inspectedInboxItem = computed\([\s\S]*?inbox\.items\[0\]/);
    expect(inboxSource).toMatch(
      /function handleInboxItemOpen[\s\S]*?embedded\.value \|\| bookmark\.isMobile[\s\S]*?openResource\(item\)/,
    );
    expect(inboxSource).toContain('const sourceQuery = embedded.value ? { from: route.fullPath } : {};');
    expect(inboxSource).toMatch(/function inspectInboxResource[\s\S]*?inboxAiResource\.value = null/);
    expect(inboxSource).toMatch(/const aiKey = inboxAiResource\.value[\s\S]*?!keys\.has\(aiKey\)/);
  });

  it('切换议程或日历时仍保留状态页签，避免视图栏上移', () => {
    expect(mobileTodoTemplate).toMatch(/<BTabs\s+v-model:active-tab="todo\.status"/);
    expect(mobileTodoTemplate).not.toContain('v-if="todoView === \'list\'"');
  });

  it('移动端两组页签均使用原型的品牌紫色与固定高度', () => {
    expect(inboxSource).toContain('--todo-navigation-color: #655cff');
    expect(inboxSource).toMatch(/\.inbox-toolbar--todo-primary :deep\(\.tab-container\)[\s\S]*?min-height:\s*40px/);
    expect(inboxSource).toMatch(/\.inbox-toolbar--todo-primary :deep\(\.tab-container\)[\s\S]*?padding:\s*3px/);
    expect(inboxSource).toMatch(
      /\.inbox-page--mobile-todo \.todo-workspace-toolbar__views :deep\(\.tab\.is-active\)[\s\S]*?color:\s*var\(--todo-navigation-color\)/,
    );
    expect(inboxSource).toMatch(/:deep\(\.todo-workspace-toolbar__views\.tab-container\)[\s\S]*?min-height:\s*40px/);
  });

  it('PC 端用胶囊状态与文字视图区分两套切换，并保持在同一行', () => {
    expect(inboxSource).toContain("t('inbox.todoStatusGroupLabel')");
    expect(inboxSource).toContain("t('inbox.todoViewGroupLabel')");
    expect(inboxSource).toContain('class="inbox-toolbar__todo-status"');
    expect(inboxSource).not.toContain('class="inbox-toolbar__todo-group-label"');
    expect(inboxSource).not.toContain('class="inbox-toolbar__todo-divider"');
    expect(inboxSource).toMatch(/class="inbox-toolbar__todo-status"[\s\S]*?variant="pill"/);
    expect(inboxSource).toMatch(/class="inbox-toolbar__todo-views"[\s\S]*?variant="line"/);
    expect(inboxSource).toContain("'inbox-toolbar--todo-desktop': isTodoFocused && !isMobileTodoPrimary");
    expect(inboxSource).toMatch(
      /\.inbox-toolbar--todo-desktop\s*\{[\s\S]*?padding:\s*3px 0[\s\S]*?background:\s*transparent/,
    );
    expect(inboxSource).toMatch(
      /\.inbox-toolbar__todo-tabs\s*\{[\s\S]*?display:\s*flex[\s\S]*?gap:\s*clamp\(22px, 2vw, 32px\)/,
    );
    expect(inboxSource).toMatch(
      /\.inbox-toolbar \.inbox-toolbar__todo-status\s*\{[\s\S]*?width:\s*max-content;[\s\S]*?min-width:\s*max-content;[\s\S]*?flex:\s*0 0 auto;/,
    );
    expect(inboxSource).toMatch(
      /\.inbox-toolbar__todo-views :deep\(\.tab\.is-active\)[\s\S]*?color:\s*var\(--todo-accent-color\)/,
    );
  });

  it('桌面概览使用语义图标和独立深浅主题 Token', () => {
    expect(inboxSource).toContain('icon.todoSummary.overdue');
    expect(inboxSource).toContain('icon.todoSummary.today');
    expect(inboxSource).toContain('icon.todoSummary.week');
    expect(inboxSource).toContain('color="var(--todo-summary-icon-fg)"');
    expect(inboxSource).toMatch(
      /\.todo-summary-card__icon[\s\S]*?border:\s*1px solid var\(--todo-summary-icon-border\)/,
    );
    expect(inboxSource).toMatch(/\.todo-summary-card__icon[\s\S]*?background:\s*var\(--todo-summary-icon-bg\)/);
    expect(dayThemeSource).toContain('--todo-summary-icon-fg: #655cff');
    expect(dayThemeSource).toContain('--todo-summary-icon-bg: #efedff');
    expect(dayThemeSource).toContain('--todo-summary-icon-border: #dedaff');
    expect(nightThemeSource).toContain('--todo-summary-icon-fg: #aaa6ff');
    expect(nightThemeSource).toContain('--todo-summary-icon-bg: #3a3854');
    expect(nightThemeSource).toContain('--todo-summary-icon-border: #514d76');
  });

  it('桌面待办复用移动端独立卡片边界，移动端规则保持独立', () => {
    expect(inboxSource).toMatch(/\.inbox-content\s*\{[\s\S]*?border:\s*0;[\s\S]*?background:\s*transparent;/);
    expect(inboxSource).toMatch(
      /@media \(min-width: 768px\)[\s\S]*?\.inbox-page--todo-focused \.todo-group\s*\{[\s\S]*?border:\s*0;[\s\S]*?background:\s*transparent;/,
    );
    expect(inboxSource).toMatch(
      /@media \(min-width: 768px\)[\s\S]*?\.inbox-page--todo-focused \.todo-group__items :deep\(\.todo-item\)\s*\{[\s\S]*?border:\s*1px solid var\(--surface-border-color\);[\s\S]*?border-left:\s*4px solid/,
    );
    expect(inboxSource).toMatch(
      /\.inbox-page--todo-focused \.todo-group__items :deep\(\.todo-item\.is-completed\)\s*\{[\s\S]*?border-left-color:\s*var\(--success-color/,
    );
    expect(inboxSource).toMatch(
      /\.inbox-page--mobile-todo \.todo-group__items :deep\(\.todo-item\)\s*\{[\s\S]*?border-left:\s*4px solid/,
    );
    expect(inboxSource).toMatch(/\.inbox-toolbar\s*\{[\s\S]*?border:\s*0;[\s\S]*?box-shadow:\s*none;/);
  });

  it('待办工作区不叠加上下渐隐遮罩，避免页签附近和最后一项内容看起来被遮挡', () => {
    expect(inboxSource).toContain("'has-top-fade': showTopFade && !isTodoFocused");
    expect(inboxSource).toContain("'has-bottom-fade': showBottomFade && !isTodoFocused");
  });

  it('移动端保留页面标题和独立卡片，新建只使用顶栏入口', () => {
    expect(inboxSource).toContain('class="mobile-todo-heading"');
    expect(inboxSource).not.toContain('class="mobile-todo-create-fab"');
    expect(inboxSource).toContain("router.push({ name: 'todoCreate' })");
    expect(inboxSource).toMatch(/\.inbox-page--mobile-todo \.todo-group\s*\{[\s\S]*?border:\s*0;/);
    expect(inboxSource).toMatch(
      /\.inbox-page--mobile-todo \.todo-group__items :deep\(\.todo-item\)\s*\{[\s\S]*?border-left:\s*4px solid/,
    );
  });

  it('进入待办时保留有效选择，旧排序回退到默认智能排序', () => {
    expect(inboxSource).toContain("todo.sort = 'smart'");
    expect(inboxSource).toContain("['smart', 'action', 'priority', 'newest']");
    expect(inboxSource).not.toContain("inbox.sort = 'due' as any");
    expect(inboxSource).not.toContain('todo.sort = inbox.sort as TodoSort');
    expect(inboxSource.match(/v-model:value="todo\.sort"/g)).toHaveLength(2);
    expect(inboxSource).toContain('if (isTodoFocused.value) applyDefaultTodoSort()');
  });
});
