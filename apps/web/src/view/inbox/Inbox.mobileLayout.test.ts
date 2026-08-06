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
    expect(inboxSource).toContain('--todo-navigation-color: #615ced');
    expect(inboxSource).toMatch(
      /\.inbox-toolbar--todo-primary :deep\(\.tab-container\)[\s\S]*?min-height:\s*44px/,
    );
    expect(inboxSource).toMatch(
      /\.inbox-page--mobile-todo \.todo-workspace-toolbar__views :deep\(\.tab\.is-active\)[\s\S]*?color:\s*var\(--todo-navigation-color\)/,
    );
    expect(inboxSource).toMatch(/:deep\(\.todo-workspace-toolbar__views\.tab-container\)[\s\S]*?min-height:\s*44px/);
  });

  it('桌面列表只保留待办卡片自身轮廓，不再叠加内容框与分组框', () => {
    expect(inboxSource).toMatch(/\.inbox-content\s*\{[\s\S]*?border:\s*0;[\s\S]*?background:\s*transparent;/);
    expect(inboxSource).toMatch(/\.todo-group\s*\{[\s\S]*?border:\s*0;[\s\S]*?background:\s*transparent;/);
    expect(inboxSource).toMatch(/\.inbox-toolbar\s*\{[\s\S]*?border:\s*0;[\s\S]*?box-shadow:\s*none;/);
  });
});
