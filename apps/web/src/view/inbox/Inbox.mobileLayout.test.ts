import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const inboxSource = readFileSync(resolve(process.cwd(), 'src/view/inbox/Inbox.vue'), 'utf8');
const mobileTodoTemplate = inboxSource.slice(
  inboxSource.indexOf('<template v-if="isMobileTodoPrimary">'),
  inboxSource.indexOf('<template v-else>', inboxSource.indexOf('<template v-if="isMobileTodoPrimary">')),
);

describe('移动端待办页签布局', () => {
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

  it('桌面概览使用原型语义图标和紫色实底，不再复用灰色通用图标', () => {
    expect(inboxSource).toContain('icon.todoSummary.overdue');
    expect(inboxSource).toContain('icon.todoSummary.today');
    expect(inboxSource).toContain('icon.todoSummary.week');
    expect(inboxSource).toMatch(/\.todo-summary-card__icon[\s\S]*?background:\s*var\(--todo-navigation-soft-color\)/);
  });

  it('桌面按原型使用单层分组面板，组内任务只用分隔线', () => {
    expect(inboxSource).toMatch(/\.inbox-content\s*\{[\s\S]*?border:\s*0;[\s\S]*?background:\s*transparent;/);
    expect(inboxSource).toMatch(
      /\.todo-group\s*\{[\s\S]*?border:\s*1px solid var\(--surface-border-color\);[\s\S]*?background:\s*var\(--card-background\);/,
    );
    expect(inboxSource).toMatch(
      /\.todo-group__items :deep\(\.todo-item\)\s*\{[\s\S]*?border:\s*0;[\s\S]*?border-bottom:\s*1px solid/,
    );
    expect(inboxSource).toMatch(/\.inbox-toolbar\s*\{[\s\S]*?border:\s*0;[\s\S]*?box-shadow:\s*none;/);
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

  it('进入待办时默认按截止时间排序，不继承资源的最新收集顺序', () => {
    expect(inboxSource).toContain("todo.sort = 'due'");
    expect(inboxSource).toContain("inbox.sort = 'due' as any");
    expect(inboxSource).toContain('if (isTodoFocused.value) applyDefaultTodoSort()');
  });
});
