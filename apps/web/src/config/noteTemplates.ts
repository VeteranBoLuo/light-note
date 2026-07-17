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
  /** 选择器内用于快速判断结构的三行摘要，不参与笔记正文。 */
  preview: Record<NoteTemplateLocale, string[]>;
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
    preview: {
      'zh-CN': ['今日重点', '完成与进展', '明日第一步'],
      'en-US': ["Today's focus", 'Progress & outcomes', 'First move tomorrow'],
    },
    content: {
      'zh-CN': `> {{date}} {{weekday}}

## 今日重点（最多 3 件）

-

## 完成与进展

-

## 卡点与需要协作

-

## 今日收获

-

## 明日第一步

-
`,
      'en-US': `> {{date}} {{weekday}}

## Today's focus (up to 3)

-

## Progress & outcomes

-

## Blockers & support needed

-

## What I learned

-

## First move tomorrow

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
    preview: {
      'zh-CN': ['目标与完成度', '关键结果与证据', '下周前三优先级'],
      'en-US': ['Goals & completion', 'Results & evidence', 'Top 3 next priorities'],
    },
    content: {
      'zh-CN': `> 截至 {{date}}

## 本周目标与完成度

- 目标：
- 完成度：

## 关键结果

-

## 数据与结果

-

## 复盘与风险

-

## 下周前三优先级

1.
2.
3.
`,
      'en-US': `> As of {{date}}

## Goals & completion

- Goal:
- Completion:

## Key results

-

## Data & results

-

## Review & risks

-

## Top 3 priorities for next week

1.
2.
3.
`,
    },
  },
  {
    key: 'meeting',
    nameKey: 'note.tplMeetingName',
    descKey: 'note.tplMeetingDesc',
    type: 'html',
    titleTemplate: { 'zh-CN': '会议纪要 {{date}}', 'en-US': 'Meeting Notes {{date}}' },
    preview: {
      'zh-CN': ['会议目标', '讨论与决策', '负责人 / 截止日'],
      'en-US': ['Meeting goal', 'Discussion & decisions', 'Owner / due date'],
    },
    content: {
      'zh-CN': `<h2>会议信息</h2>
<p>时间：{{datetime}}</p>
<p>地点：</p>
<p>参会人：</p>
<p>记录人：</p>
<h2>会议目标与需拍板事项</h2>
<ul>
<li>会议目标：</li>
<li>需确认的决策：</li>
</ul>
<h2>议题、讨论与决策</h2>
<ol>
<li><strong>议题：</strong><br><strong>讨论：</strong><br><strong>决策：</strong></li>
<li><strong>议题：</strong><br><strong>讨论：</strong><br><strong>决策：</strong></li>
</ol>
<h2>行动项</h2>
<table>
<thead><tr><th>事项</th><th>负责人</th><th>截止时间</th><th>状态</th></tr></thead>
<tbody><tr><td></td><td></td><td></td><td></td></tr></tbody>
</table>
<h2>下次跟进</h2>
<p>时间：<br>需要准备：</p>`,
      'en-US': `<h2>Meeting info</h2>
<p>Time: {{datetime}}</p>
<p>Location: </p>
<p>Attendees: </p>
<p>Note taker: </p>
<h2>Meeting goal &amp; decisions needed</h2>
<ul>
<li>Goal: </li>
<li>Decisions to make: </li>
</ul>
<h2>Topics, discussion &amp; decisions</h2>
<ol>
<li><strong>Topic:</strong><br><strong>Discussion:</strong><br><strong>Decision:</strong></li>
<li><strong>Topic:</strong><br><strong>Discussion:</strong><br><strong>Decision:</strong></li>
</ol>
<h2>Action items</h2>
<table>
<thead><tr><th>Item</th><th>Owner</th><th>Due date</th><th>Status</th></tr></thead>
<tbody><tr><td></td><td></td><td></td><td></td></tr></tbody>
</table>
<h2>Next follow-up</h2>
<p>When: <br>Preparation needed: </p>`,
    },
  },
  {
    key: 'reading',
    nameKey: 'note.tplReadingName',
    descKey: 'note.tplReadingDesc',
    type: 'markdown',
    titleTemplate: { 'zh-CN': '读书笔记', 'en-US': 'Reading Notes' },
    preview: {
      'zh-CN': ['一句话收获', '观点与摘录', '关联与实践'],
      'en-US': ['One-line takeaway', 'Ideas & highlights', 'Links & practice'],
    },
    content: {
      'zh-CN': `## 阅读目的

-

## 书目信息

- 书名：
- 作者：
- 开始阅读：{{date}}

## 一句话收获

-

## 核心观点 / 框架

-

## 精彩摘录

> 摘录内容（页码）

## 质疑与关联

-

## 行动 / 实践

-
`,
      'en-US': `## Why I am reading this

-

## Book info

- Title:
- Author:
- Started: {{date}}

## One-line takeaway

-

## Key ideas / framework

-

## Highlights

> Quote (page)

## Questions & connections

-

## Actions / practice

-
`,
    },
  },
  {
    key: 'project',
    nameKey: 'note.tplProjectName',
    descKey: 'note.tplProjectDesc',
    type: 'markdown',
    titleTemplate: { 'zh-CN': '项目计划 {{date}}', 'en-US': 'Project Plan {{date}}' },
    preview: {
      'zh-CN': ['目标与衡量标准', '里程碑', '风险与下一步'],
      'en-US': ['Goals & metrics', 'Milestones', 'Risks & next step'],
    },
    content: {
      'zh-CN': `> 创建于 {{date}}

## 背景与要解决的问题

-

## 项目目标与衡量标准

-

## 范围与边界

- 要做：
- 不做：

## 里程碑

1. [日期]

## 风险与依赖

-

## 本周推进 / 下一步

-
`,
      'en-US': `> Created {{date}}

## Context & problem to solve

-

## Goals & success metrics

-

## Scope & boundaries

- In scope:
- Out of scope:

## Milestones

1. [Date]

## Risks & dependencies

-

## This week's progress / next step

-
`,
    },
  },
  {
    key: 'review',
    nameKey: 'note.tplReviewName',
    descKey: 'note.tplReviewDesc',
    type: 'markdown',
    titleTemplate: { 'zh-CN': '复盘 {{date}}', 'en-US': 'Retrospective {{date}}' },
    preview: {
      'zh-CN': ['背景与预期', '结果与原因', '下一次怎么做'],
      'en-US': ['Context & expectation', 'Results & causes', 'What to do next time'],
    },
    content: {
      'zh-CN': `> 复盘日期 {{date}}

## 背景与预期

-

## 结果与事实

-

## 发生了什么

-

## 原因分析

-

## 有效做法 / 待改进

-

## 下一次怎么做

-
`,
      'en-US': `> Reviewed on {{date}}

## Context & expectation

-

## Results & facts

-

## What happened

-

## Why it happened

-

## What worked / what to improve

-

## What to do next time

-
`,
    },
  },
  {
    key: 'knowledge',
    nameKey: 'note.tplKnowledgeName',
    descKey: 'note.tplKnowledgeDesc',
    type: 'markdown',
    titleTemplate: { 'zh-CN': '知识卡片 {{date}}', 'en-US': 'Knowledge Card {{date}}' },
    preview: {
      'zh-CN': ['一句话定义', '场景与例子', '关联知识与待验证问题'],
      'en-US': ['One-line definition', 'Use cases & examples', 'Links & open questions'],
    },
    content: {
      'zh-CN': `> 记录于 {{date}}

## 一句话定义

-

## 适用场景

-

## 例子与反例

-

## 关键要点

-

## 关联知识

- 相关笔记：

## 待验证问题

-
`,
      'en-US': `> Captured on {{date}}

## One-line definition

-

## When to use it

-

## Examples & counterexamples

-

## Key points

-

## Related knowledge

- Related notes:

## Open questions

-
`,
    },
  },
];

export function findBuiltinNoteTemplate(key: string | undefined | null): BuiltinNoteTemplate | undefined {
  if (!key) return undefined;
  return BUILTIN_NOTE_TEMPLATES.find((t) => t.key === key);
}
