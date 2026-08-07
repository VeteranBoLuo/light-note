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
    type: 'html',
    titleTemplate: { 'zh-CN': '日报 {{date}}', 'en-US': 'Daily Report {{date}}' },
    preview: {
      'zh-CN': ['今日重点', '完成与进展', '卡点、收获与明日第一步'],
      'en-US': ["Today's focus", 'Progress & outcomes', 'Blockers, learnings & first move'],
    },
    content: {
      'zh-CN': `<div class="note-template-page note-template-page--daily">
<div class="note-template-hero">
<p class="note-template-eyebrow">DAILY NOTE · {{date}} {{weekday}}</p>
<h2>今天最重要的事</h2>
<p class="note-template-lead">先写下今天真正需要推进的方向，再开始处理琐事。</p>
</div>
<div class="note-template-grid">
<div class="note-template-card">
<h2>今日重点 <span class="note-template-hint">最多 3 件</span></h2>
<ol><li><br></li></ol>
</div>
<div class="note-template-card">
<h2>完成与进展</h2>
<p class="note-template-prompt">写结果、进度或产生的价值。</p>
<p><br></p>
</div>
</div>
<div class="note-template-grid">
<div class="note-template-card">
<h2>卡点与需要协作</h2>
<p class="note-template-prompt">哪里受阻？需要谁提供什么支持？</p>
<p><br></p>
</div>
<div class="note-template-card">
<h2>今日收获</h2>
<p class="note-template-prompt">值得记住的新发现、判断或方法。</p>
<p><br></p>
</div>
</div>
<div class="note-template-callout">
<h2>明日第一步</h2>
<p class="note-template-prompt">给明天留下一个足够具体、可以立即开始的动作。</p>
<p><br></p>
</div>
</div>`,
      'en-US': `<div class="note-template-page note-template-page--daily">
<div class="note-template-hero">
<p class="note-template-eyebrow">DAILY NOTE · {{date}} {{weekday}}</p>
<h2>The most important thing today</h2>
<p class="note-template-lead">Name the direction that truly matters before the small tasks take over.</p>
</div>
<div class="note-template-grid">
<div class="note-template-card">
<h2>Today's focus <span class="note-template-hint">up to 3</span></h2>
<ol><li><br></li></ol>
</div>
<div class="note-template-card">
<h2>Progress &amp; outcomes</h2>
<p class="note-template-prompt">Capture results, movement or value created.</p>
<p><br></p>
</div>
</div>
<div class="note-template-grid">
<div class="note-template-card">
<h2>Blockers &amp; support needed</h2>
<p class="note-template-prompt">What is blocked, and who could help with what?</p>
<p><br></p>
</div>
<div class="note-template-card">
<h2>What I learned</h2>
<p class="note-template-prompt">A discovery, judgment or method worth keeping.</p>
<p><br></p>
</div>
</div>
<div class="note-template-callout">
<h2>First move tomorrow</h2>
<p class="note-template-prompt">Leave yourself one concrete action that is easy to start.</p>
<p><br></p>
</div>
</div>`,
    },
  },
  {
    key: 'weekly',
    nameKey: 'note.tplWeeklyName',
    descKey: 'note.tplWeeklyDesc',
    type: 'html',
    titleTemplate: { 'zh-CN': '周报 {{date}}', 'en-US': 'Weekly Report {{date}}' },
    preview: {
      'zh-CN': ['目标与完成度', '关键成果、证据与影响', '复盘风险与下周优先级'],
      'en-US': ['Goals & completion', 'Outcomes, evidence & impact', 'Review, risks & next priorities'],
    },
    content: {
      'zh-CN': `<div class="note-template-page note-template-page--weekly">
<div class="note-template-hero">
<p class="note-template-eyebrow">WEEKLY REVIEW · 截至 {{date}}</p>
<h2>这一周，真正推动了什么？</h2>
<p class="note-template-lead">用结果和证据复盘一周，把注意力留给下一阶段最重要的事。</p>
</div>
<div class="note-template-card note-template-card--wide">
<h2>本周一句话总结</h2>
<p><br></p>
</div>
<div class="note-template-grid">
<div class="note-template-card">
<h2>本周目标</h2>
<p><br></p>
</div>
<div class="note-template-card">
<h2>完成度与状态</h2>
<p class="note-template-prompt">完成 / 进行中 / 调整，以及原因。</p>
<p><br></p>
</div>
</div>
<div class="note-template-card note-template-card--wide">
<h2>关键成果、证据与影响</h2>
<table class="note-template-table">
<thead><tr><th>关键成果</th><th>数据 / 证据</th><th>带来的影响</th></tr></thead>
<tbody><tr><td><br></td><td><br></td><td><br></td></tr></tbody>
</table>
</div>
<div class="note-template-grid">
<div class="note-template-card">
<h2>问题、风险与需要协作</h2>
<p><br></p>
</div>
<div class="note-template-card">
<h2>本周复盘</h2>
<p class="note-template-prompt">什么值得继续？什么需要停止或调整？</p>
<p><br></p>
</div>
</div>
<div class="note-template-callout">
<h2>下周优先级 <span class="note-template-hint">最多 3 项</span></h2>
<ol><li><br></li></ol>
</div>
</div>`,
      'en-US': `<div class="note-template-page note-template-page--weekly">
<div class="note-template-hero">
<p class="note-template-eyebrow">WEEKLY REVIEW · AS OF {{date}}</p>
<h2>What truly moved forward this week?</h2>
<p class="note-template-lead">Review the week with outcomes and evidence, then protect attention for what matters next.</p>
</div>
<div class="note-template-card note-template-card--wide">
<h2>This week in one sentence</h2>
<p><br></p>
</div>
<div class="note-template-grid">
<div class="note-template-card">
<h2>Goals for this week</h2>
<p><br></p>
</div>
<div class="note-template-card">
<h2>Completion &amp; status</h2>
<p class="note-template-prompt">Done / in progress / adjusted, and why.</p>
<p><br></p>
</div>
</div>
<div class="note-template-card note-template-card--wide">
<h2>Key outcomes, evidence &amp; impact</h2>
<table class="note-template-table">
<thead><tr><th>Outcome</th><th>Data / evidence</th><th>Impact</th></tr></thead>
<tbody><tr><td><br></td><td><br></td><td><br></td></tr></tbody>
</table>
</div>
<div class="note-template-grid">
<div class="note-template-card">
<h2>Issues, risks &amp; support needed</h2>
<p><br></p>
</div>
<div class="note-template-card">
<h2>Weekly review</h2>
<p class="note-template-prompt">What should continue, stop or change?</p>
<p><br></p>
</div>
</div>
<div class="note-template-callout">
<h2>Priorities for next week <span class="note-template-hint">up to 3</span></h2>
<ol><li><br></li></ol>
</div>
</div>`,
    },
  },
  {
    key: 'meeting',
    nameKey: 'note.tplMeetingName',
    descKey: 'note.tplMeetingDesc',
    type: 'html',
    titleTemplate: { 'zh-CN': '会议纪要 {{datetime}}', 'en-US': 'Meeting Notes {{datetime}}' },
    preview: {
      'zh-CN': ['会议目标与预期产出', '结论与决策', '行动项与后续跟进'],
      'en-US': ['Goal & expected output', 'Conclusions & decisions', 'Actions & follow-up'],
    },
    content: {
      'zh-CN': `<div class="note-template-page note-template-page--meeting">
<div class="note-template-hero">
<p class="note-template-eyebrow">MEETING NOTES · {{datetime}}</p>
<h2>会议主题</h2>
<p class="note-template-lead">地点 · 参会人 · 记录人</p>
</div>
<div class="note-template-grid">
<div class="note-template-card">
<h2>会议目标</h2>
<p><br></p>
</div>
<div class="note-template-card">
<h2>预期产出</h2>
<p><br></p>
</div>
</div>
<div class="note-template-card note-template-card--wide">
<h2>议题与讨论</h2>
<h3>议题 1</h3>
<p class="note-template-prompt">背景与关键讨论</p>
<p><br></p>
</div>
<div class="note-template-callout">
<h2>结论与已确认决策</h2>
<p><br></p>
</div>
<div class="note-template-card note-template-card--wide">
<h2>行动项</h2>
<table class="note-template-table">
<thead><tr><th>事项</th><th>负责人</th><th>截止时间</th><th>状态</th></tr></thead>
<tbody><tr><td><br></td><td><br></td><td><br></td><td><br></td></tr></tbody>
</table>
</div>
<div class="note-template-card note-template-card--wide">
<h2>待确认问题与后续跟进</h2>
<p class="note-template-prompt">下次检查时间 · 待补充材料 · 尚未拍板的问题</p>
<p><br></p>
</div>
</div>`,
      'en-US': `<div class="note-template-page note-template-page--meeting">
<div class="note-template-hero">
<p class="note-template-eyebrow">MEETING NOTES · {{datetime}}</p>
<h2>Meeting topic</h2>
<p class="note-template-lead">Location · attendees · note taker</p>
</div>
<div class="note-template-grid">
<div class="note-template-card">
<h2>Meeting goal</h2>
<p><br></p>
</div>
<div class="note-template-card">
<h2>Expected output</h2>
<p><br></p>
</div>
</div>
<div class="note-template-card note-template-card--wide">
<h2>Topics &amp; discussion</h2>
<h3>Topic 1</h3>
<p class="note-template-prompt">Context and key discussion</p>
<p><br></p>
</div>
<div class="note-template-callout">
<h2>Conclusions &amp; confirmed decisions</h2>
<p><br></p>
</div>
<div class="note-template-card note-template-card--wide">
<h2>Action items</h2>
<table class="note-template-table">
<thead><tr><th>Item</th><th>Owner</th><th>Due date</th><th>Status</th></tr></thead>
<tbody><tr><td><br></td><td><br></td><td><br></td><td><br></td></tr></tbody>
</table>
</div>
<div class="note-template-card note-template-card--wide">
<h2>Open questions &amp; follow-up</h2>
<p class="note-template-prompt">Next review · missing material · decisions still pending</p>
<p><br></p>
</div>
</div>`,
    },
  },
  {
    key: 'reading',
    nameKey: 'note.tplReadingName',
    descKey: 'note.tplReadingDesc',
    type: 'html',
    titleTemplate: { 'zh-CN': '读书笔记｜书名', 'en-US': 'Reading Notes | Book Title' },
    preview: {
      'zh-CN': ['书目信息与阅读目的', '观点、摘录与思考', '关联与实践'],
      'en-US': ['Book info & reading purpose', 'Ideas, highlights & reflection', 'Links & practice'],
    },
    content: {
      'zh-CN': `<div class="note-template-page note-template-page--reading">
<div class="note-template-hero">
<p class="note-template-eyebrow">READING NOTES · {{date}}</p>
<h2>书名</h2>
<p class="note-template-lead">作者 · 阅读进度 / 状态</p>
</div>
<div class="note-template-grid">
<div class="note-template-card">
<h2>为什么读这本书</h2>
<p><br></p>
</div>
<div class="note-template-card">
<h2>一句话收获</h2>
<p><br></p>
</div>
</div>
<div class="note-template-card note-template-card--wide">
<h2>核心观点与框架</h2>
<p><br></p>
</div>
<blockquote class="note-template-quote">
<p>把最值得记住的原文放在这里。</p>
<p class="note-template-prompt">—— 页码 / 章节</p>
</blockquote>
<div class="note-template-grid">
<div class="note-template-card">
<h2>我的理解与质疑</h2>
<p><br></p>
</div>
<div class="note-template-card">
<h2>关联知识</h2>
<p class="note-template-prompt">关联已有笔记、经历或相反观点。</p>
<p><br></p>
</div>
</div>
<div class="note-template-callout">
<h2>行动与实践</h2>
<p class="note-template-prompt">读完之后，准备改变或验证什么？</p>
<p><br></p>
</div>
</div>`,
      'en-US': `<div class="note-template-page note-template-page--reading">
<div class="note-template-hero">
<p class="note-template-eyebrow">READING NOTES · {{date}}</p>
<h2>Book title</h2>
<p class="note-template-lead">Author · progress / status</p>
</div>
<div class="note-template-grid">
<div class="note-template-card">
<h2>Why I am reading this</h2>
<p><br></p>
</div>
<div class="note-template-card">
<h2>One-line takeaway</h2>
<p><br></p>
</div>
</div>
<div class="note-template-card note-template-card--wide">
<h2>Key ideas &amp; framework</h2>
<p><br></p>
</div>
<blockquote class="note-template-quote">
<p>Place the passage most worth remembering here.</p>
<p class="note-template-prompt">— Page / chapter</p>
</blockquote>
<div class="note-template-grid">
<div class="note-template-card">
<h2>My interpretation &amp; questions</h2>
<p><br></p>
</div>
<div class="note-template-card">
<h2>Related knowledge</h2>
<p class="note-template-prompt">Connect notes, experience or opposing views.</p>
<p><br></p>
</div>
</div>
<div class="note-template-callout">
<h2>Action &amp; practice</h2>
<p class="note-template-prompt">What will you change or test after reading?</p>
<p><br></p>
</div>
</div>`,
    },
  },
  {
    key: 'project',
    nameKey: 'note.tplProjectName',
    descKey: 'note.tplProjectDesc',
    type: 'html',
    titleTemplate: { 'zh-CN': '项目计划｜项目名称', 'en-US': 'Project Plan | Project Name' },
    preview: {
      'zh-CN': ['目标与成功标准', '里程碑与交付物', '风险、当前状态与下一步'],
      'en-US': ['Goals & success criteria', 'Milestones & deliverables', 'Risks, status & next actions'],
    },
    content: {
      'zh-CN': `<div class="note-template-page note-template-page--project">
<div class="note-template-hero">
<p class="note-template-eyebrow">PROJECT PLAN · 创建于 {{date}}</p>
<h2>项目名称</h2>
<p class="note-template-lead">负责人 · 当前状态 · 目标日期</p>
</div>
<div class="note-template-card note-template-card--wide">
<h2>背景与要解决的问题</h2>
<p><br></p>
</div>
<div class="note-template-grid">
<div class="note-template-card">
<h2>项目目标</h2>
<p><br></p>
</div>
<div class="note-template-card">
<h2>成功标准</h2>
<p class="note-template-prompt">什么结果出现时，可以判断项目成功？</p>
<p><br></p>
</div>
</div>
<div class="note-template-grid">
<div class="note-template-card">
<h2>范围内</h2>
<p><br></p>
</div>
<div class="note-template-card note-template-card--muted">
<h2>暂不包含</h2>
<p><br></p>
</div>
</div>
<div class="note-template-card note-template-card--wide">
<h2>里程碑与交付物</h2>
<table class="note-template-table">
<thead><tr><th>里程碑</th><th>交付物 / 验收标准</th><th>负责人</th><th>截止时间</th></tr></thead>
<tbody><tr><td><br></td><td><br></td><td><br></td><td><br></td></tr></tbody>
</table>
</div>
<div class="note-template-grid">
<div class="note-template-card">
<h2>风险与依赖</h2>
<p><br></p>
</div>
<div class="note-template-card">
<h2>应对方案</h2>
<p><br></p>
</div>
</div>
<div class="note-template-callout">
<h2>下一步行动</h2>
<p class="note-template-prompt">事项 · 负责人 · 截止时间</p>
<p><br></p>
</div>
</div>`,
      'en-US': `<div class="note-template-page note-template-page--project">
<div class="note-template-hero">
<p class="note-template-eyebrow">PROJECT PLAN · CREATED {{date}}</p>
<h2>Project name</h2>
<p class="note-template-lead">Owner · current status · target date</p>
</div>
<div class="note-template-card note-template-card--wide">
<h2>Context &amp; problem to solve</h2>
<p><br></p>
</div>
<div class="note-template-grid">
<div class="note-template-card">
<h2>Project goal</h2>
<p><br></p>
</div>
<div class="note-template-card">
<h2>Success criteria</h2>
<p class="note-template-prompt">What result would prove this project succeeded?</p>
<p><br></p>
</div>
</div>
<div class="note-template-grid">
<div class="note-template-card">
<h2>In scope</h2>
<p><br></p>
</div>
<div class="note-template-card note-template-card--muted">
<h2>Out of scope for now</h2>
<p><br></p>
</div>
</div>
<div class="note-template-card note-template-card--wide">
<h2>Milestones &amp; deliverables</h2>
<table class="note-template-table">
<thead><tr><th>Milestone</th><th>Deliverable / acceptance criteria</th><th>Owner</th><th>Due date</th></tr></thead>
<tbody><tr><td><br></td><td><br></td><td><br></td><td><br></td></tr></tbody>
</table>
</div>
<div class="note-template-grid">
<div class="note-template-card">
<h2>Risks &amp; dependencies</h2>
<p><br></p>
</div>
<div class="note-template-card">
<h2>Response plan</h2>
<p><br></p>
</div>
</div>
<div class="note-template-callout">
<h2>Next action</h2>
<p class="note-template-prompt">Item · owner · due date</p>
<p><br></p>
</div>
</div>`,
    },
  },
  {
    key: 'review',
    nameKey: 'note.tplReviewName',
    descKey: 'note.tplReviewDesc',
    type: 'html',
    titleTemplate: { 'zh-CN': '复盘｜事项｜{{date}}', 'en-US': 'Retrospective | Topic | {{date}}' },
    preview: {
      'zh-CN': ['背景与预期', '事实、结果与原因', '经验与行动项'],
      'en-US': ['Context & expectation', 'Facts, results & causes', 'Learnings & actions'],
    },
    content: {
      'zh-CN': `<div class="note-template-page note-template-page--review">
<div class="note-template-hero">
<p class="note-template-eyebrow">RETROSPECTIVE · {{date}}</p>
<h2>复盘事项</h2>
<p class="note-template-lead">先还原事实，再提炼可以复用的经验。</p>
</div>
<div class="note-template-grid">
<div class="note-template-card">
<h2>背景与预期</h2>
<p><br></p>
</div>
<div class="note-template-card">
<h2>事实与结果</h2>
<p><br></p>
</div>
</div>
<div class="note-template-card note-template-card--wide">
<h2>差距与原因分析</h2>
<p class="note-template-prompt">实际与预期差在哪里？哪些是表象，哪些是根因？</p>
<p><br></p>
</div>
<div class="note-template-retro-grid">
<div class="note-template-card note-template-card--continue">
<p class="note-template-eyebrow">CONTINUE</p>
<h2>继续保持</h2>
<p><br></p>
</div>
<div class="note-template-card note-template-card--stop">
<p class="note-template-eyebrow">STOP</p>
<h2>停止或减少</h2>
<p><br></p>
</div>
<div class="note-template-card note-template-card--start">
<p class="note-template-eyebrow">START</p>
<h2>开始尝试</h2>
<p><br></p>
</div>
</div>
<div class="note-template-callout">
<h2>下一步行动</h2>
<p class="note-template-prompt">事项 · 负责人 · 截止时间 · 验证方式</p>
<p><br></p>
</div>
</div>`,
      'en-US': `<div class="note-template-page note-template-page--review">
<div class="note-template-hero">
<p class="note-template-eyebrow">RETROSPECTIVE · {{date}}</p>
<h2>Topic to review</h2>
<p class="note-template-lead">Reconstruct the facts first, then extract reusable learning.</p>
</div>
<div class="note-template-grid">
<div class="note-template-card">
<h2>Context &amp; expectation</h2>
<p><br></p>
</div>
<div class="note-template-card">
<h2>Facts &amp; results</h2>
<p><br></p>
</div>
</div>
<div class="note-template-card note-template-card--wide">
<h2>Gap &amp; cause analysis</h2>
<p class="note-template-prompt">Where did reality differ from expectation? What is symptom versus root cause?</p>
<p><br></p>
</div>
<div class="note-template-retro-grid">
<div class="note-template-card note-template-card--continue">
<p class="note-template-eyebrow">CONTINUE</p>
<h2>Keep doing</h2>
<p><br></p>
</div>
<div class="note-template-card note-template-card--stop">
<p class="note-template-eyebrow">STOP</p>
<h2>Stop or reduce</h2>
<p><br></p>
</div>
<div class="note-template-card note-template-card--start">
<p class="note-template-eyebrow">START</p>
<h2>Start trying</h2>
<p><br></p>
</div>
</div>
<div class="note-template-callout">
<h2>Next actions</h2>
<p class="note-template-prompt">Item · owner · due date · validation method</p>
<p><br></p>
</div>
</div>`,
    },
  },
  {
    key: 'knowledge',
    nameKey: 'note.tplKnowledgeName',
    descKey: 'note.tplKnowledgeDesc',
    type: 'markdown',
    titleTemplate: { 'zh-CN': '知识卡片｜主题', 'en-US': 'Knowledge Card | Topic' },
    preview: {
      'zh-CN': ['一句话定义与关键要点', '场景、例子与边界', '关联知识与待验证问题'],
      'en-US': ['Definition & key points', 'Use cases, examples & boundaries', 'Links & open questions'],
    },
    content: {
      'zh-CN': `> 记录于 {{date}}

## 一句话定义

-

## 适用场景

-

## 关键要点

-

## 例子

-

## 反例与适用边界

-

## 关联知识

-

## 待验证问题

-
`,
      'en-US': `> Captured on {{date}}

## One-line definition

-

## When to use it

-

## Key points

-

## Example

-

## Counterexample & boundaries

-

## Related knowledge

-

## Open questions

-
`,
    },
  },
  {
    key: 'mindmap',
    nameKey: 'note.tplMindmapName',
    descKey: 'note.tplMindmapDesc',
    type: 'markdown',
    titleTemplate: { 'zh-CN': '思维导图｜主题', 'en-US': 'Mind Map | Topic' },
    preview: {
      'zh-CN': ['中心主题与三条分支', '图下逐条补充细节', '结论与下一步'],
      'en-US': ['Central topic & three branches', 'Add details below the map', 'Takeaway & next step'],
    },
    content: {
      'zh-CN': `> 整理于 {{date}}；请替换中心主题和分支名称，并在图下补充细节。

## 主题脑图

\`\`\`mermaid
mindmap
  root(中心主题)
    分支一
      要点 A
      要点 B
    分支二
      要点 C
    分支三
\`\`\`

## 分支展开

### 分支一

-

### 分支二

-

### 分支三

-

## 结论与下一步

-
`,
      'en-US': `> Organized on {{date}}. Replace the central topic and branch names, then add details below.

## Topic map

\`\`\`mermaid
mindmap
  root(Central topic)
    Branch 1
      Point A
      Point B
    Branch 2
      Point C
    Branch 3
\`\`\`

## Branch details

### Branch 1

-

### Branch 2

-

### Branch 3

-

## Takeaway & next step

-
`,
    },
  },
];

export function findBuiltinNoteTemplate(key: string | undefined | null): BuiltinNoteTemplate | undefined {
  if (!key) return undefined;
  return BUILTIN_NOTE_TEMPLATES.find((t) => t.key === key);
}

const BUILTIN_TEMPLATE_FIXED_ORDER = new Map([
  ['daily', 0],
  ['weekly', 1],
]);

/** 日报、周报固定在前两位，其余模板仍按最近使用时间排序。 */
export function sortBuiltinNoteTemplates(
  templates: readonly BuiltinNoteTemplate[],
  recentUsage: Readonly<Record<string, number>>,
): BuiltinNoteTemplate[] {
  return [...templates].sort((a, b) => {
    const fixedOrderA = BUILTIN_TEMPLATE_FIXED_ORDER.get(a.key) ?? Number.POSITIVE_INFINITY;
    const fixedOrderB = BUILTIN_TEMPLATE_FIXED_ORDER.get(b.key) ?? Number.POSITIVE_INFINITY;
    if (fixedOrderA !== fixedOrderB) return fixedOrderA - fixedOrderB;
    return Number(recentUsage[`builtin:${b.key}`] || 0) - Number(recentUsage[`builtin:${a.key}`] || 0);
  });
}
