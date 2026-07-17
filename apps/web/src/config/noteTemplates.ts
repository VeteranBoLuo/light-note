/**
 * 内置笔记模板（前端常量，不进数据库）。
 *
 * - 名称/描述是短文案，走 i18n key（picker 里 t() 渲染）
 * - 标题模板与正文含 {{date}} 等占位变量，vue-i18n 会把花括号当插值语法解析报错，
 *   因此按 locale 字典放在这里，不进语言文件；非中文一律回落 en-US
 * - 实例化时经 utils/noteTemplate.ts 的 renderNoteTemplate 替换变量
 */

export type NoteTemplateLocale = 'zh-CN' | 'en-US';

export interface BuiltinNoteTemplate {
  key: string;
  nameKey: string;
  descKey: string;
  type: 'html' | 'markdown';
  /** 新笔记标题模板，可含占位变量 */
  titleTemplate: Record<NoteTemplateLocale, string>;
  content: Record<NoteTemplateLocale, string>;
}

export function pickTemplateLocale(locale: string): NoteTemplateLocale {
  return locale === 'zh-CN' ? 'zh-CN' : 'en-US';
}

export const BUILTIN_NOTE_TEMPLATES: BuiltinNoteTemplate[] = [
  {
    key: 'daily',
    nameKey: 'note.tplDailyName',
    descKey: 'note.tplDailyDesc',
    type: 'markdown',
    titleTemplate: { 'zh-CN': '日报 {{date}}', 'en-US': 'Daily Report {{date}}' },
    content: {
      'zh-CN': `> {{date}} {{weekday}}

## 今日完成

-

## 进行中

-

## 明日计划

-

## 问题与思考

-
`,
      'en-US': `> {{date}} {{weekday}}

## Done today

-

## In progress

-

## Plan for tomorrow

-

## Issues & thoughts

-
`,
    },
  },
  {
    key: 'weekly',
    nameKey: 'note.tplWeeklyName',
    descKey: 'note.tplWeeklyDesc',
    type: 'markdown',
    titleTemplate: { 'zh-CN': '周报 {{date}}', 'en-US': 'Weekly Report {{date}}' },
    content: {
      'zh-CN': `> 截至 {{date}}

## 本周概览

-

## 关键进展

1.

## 数据与结果

-

## 下周计划

-

## 风险与求助

-
`,
      'en-US': `> As of {{date}}

## Overview

-

## Key progress

1.

## Data & results

-

## Next week

-

## Risks & asks

-
`,
    },
  },
  {
    key: 'meeting',
    nameKey: 'note.tplMeetingName',
    descKey: 'note.tplMeetingDesc',
    type: 'html',
    titleTemplate: { 'zh-CN': '会议纪要 {{date}}', 'en-US': 'Meeting Notes {{date}}' },
    content: {
      'zh-CN': `<h2>会议信息</h2>
<p>时间：{{datetime}}</p>
<p>地点：</p>
<p>参会人：</p>
<p>记录人：</p>
<h2>议题与结论</h2>
<ol>
<li>议题：<br>讨论：<br>结论：</li>
</ol>
<h2>待办事项</h2>
<ul>
<li>事项 · 负责人 · 截止时间</li>
</ul>`,
      'en-US': `<h2>Meeting info</h2>
<p>Time: {{datetime}}</p>
<p>Location: </p>
<p>Attendees: </p>
<p>Note taker: </p>
<h2>Topics &amp; conclusions</h2>
<ol>
<li>Topic: <br>Discussion: <br>Conclusion: </li>
</ol>
<h2>Action items</h2>
<ul>
<li>Item · Owner · Due date</li>
</ul>`,
    },
  },
  {
    key: 'reading',
    nameKey: 'note.tplReadingName',
    descKey: 'note.tplReadingDesc',
    type: 'markdown',
    titleTemplate: { 'zh-CN': '读书笔记', 'en-US': 'Reading Notes' },
    content: {
      'zh-CN': `## 书目信息

- 书名：
- 作者：
- 开始阅读：{{date}}

## 核心观点

-

## 精彩摘录

>

## 我的思考

-

## 行动清单

-
`,
      'en-US': `## Book info

- Title:
- Author:
- Started: {{date}}

## Key ideas

-

## Highlights

>

## My thoughts

-

## Actions

-
`,
    },
  },
];

export function findBuiltinNoteTemplate(key: string | undefined | null): BuiltinNoteTemplate | undefined {
  if (!key) return undefined;
  return BUILTIN_NOTE_TEMPLATES.find((t) => t.key === key);
}
