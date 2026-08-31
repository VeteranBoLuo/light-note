import {
  normalizeProductionProjectContent,
  type ProductionDocumentContentV1,
  type ProductionPresentationContentV1,
  type ProductionPresentationSlideV1,
  type ProductionProjectContent,
  type ProductionProjectType,
  type ProductionWorkbookContentV1,
  type ProductionWorkbookSheetV1,
} from '@lightnote/shared/production-project-protocol';

export type ProductionStarterLocale = 'zh-CN' | 'en-US';

export type ProductionProjectStarter = Readonly<{
  id: string;
  projectType: ProductionProjectType;
  title: Readonly<Record<ProductionStarterLocale, string>>;
  description: Readonly<Record<ProductionStarterLocale, string>>;
  createContent: (locale?: string) => ProductionProjectContent;
}>;

type LocalizedText = Readonly<Record<ProductionStarterLocale, string>>;

function localized(zhCN: string, enUS: string): LocalizedText {
  return Object.freeze({ 'zh-CN': zhCN, 'en-US': enUS });
}

export function productionStarterLocale(locale?: string): ProductionStarterLocale {
  return String(locale || '')
    .toLocaleLowerCase()
    .startsWith('zh')
    ? 'zh-CN'
    : 'en-US';
}

function documentContent(markdown: LocalizedText, locale?: string): ProductionDocumentContentV1 {
  return normalizeProductionProjectContent(
    {
      type: 'document',
      schemaVersion: 1,
      body: { format: 'markdown', value: markdown[productionStarterLocale(locale)] },
      page: { size: 'a4', orientation: 'portrait' },
      extensions: {},
    },
    'document',
  ) as ProductionDocumentContentV1;
}

function slide(
  id: string,
  title: LocalizedText,
  body: LocalizedText,
  locale: string | undefined,
  layout: ProductionPresentationSlideV1['layout'] = 'content',
): ProductionPresentationSlideV1 {
  const selectedLocale = productionStarterLocale(locale);
  return {
    id,
    title: title[selectedLocale],
    body: { format: 'markdown', value: body[selectedLocale] },
    notes: '',
    layout,
    extensions: {},
  };
}

function presentationContent(
  slides: (locale?: string) => ProductionPresentationSlideV1[],
  locale?: string,
): ProductionPresentationContentV1 {
  return normalizeProductionProjectContent(
    {
      type: 'presentation',
      schemaVersion: 1,
      canvas: { aspectRatio: '16:9' },
      theme: { name: 'lightnote', accent: '#3175cc', background: '#ffffff' },
      slides: slides(locale),
      extensions: {},
    },
    'presentation',
  ) as ProductionPresentationContentV1;
}

function workbookSheet(
  id: string,
  name: LocalizedText,
  cells: ProductionWorkbookSheetV1['cells'],
  locale?: string,
): ProductionWorkbookSheetV1 {
  return {
    id,
    name: name[productionStarterLocale(locale)],
    cells,
    extensions: {},
  };
}

function workbookContent(
  sheets: (locale?: string) => ProductionWorkbookSheetV1[],
  locale?: string,
): ProductionWorkbookContentV1 {
  const createdSheets = sheets(locale);
  return normalizeProductionProjectContent(
    {
      type: 'workbook',
      schemaVersion: 1,
      sheets: createdSheets,
      activeSheetId: createdSheets[0]?.id || null,
      extensions: {},
    },
    'workbook',
  ) as ProductionWorkbookContentV1;
}

const DOCUMENT_STARTERS: readonly ProductionProjectStarter[] = Object.freeze([
  Object.freeze({
    id: 'document-report',
    projectType: 'document',
    title: localized('分析报告', 'Analysis report'),
    description: localized(
      '从摘要、证据到结论与行动建议的完整报告结构。',
      'A complete report from evidence to conclusions and actions.',
    ),
    createContent: (locale?: string) =>
      documentContent(
        localized(
          '# 分析报告\n\n## 执行摘要\n\n用三到五句话说明核心结论。\n\n## 背景与目标\n\n- 背景：\n- 要回答的问题：\n- 范围：\n\n## 关键发现\n\n### 发现一\n\n结论、证据与解释。\n\n## 风险与限制\n\n- 已知限制：\n- 仍需核验：\n\n## 建议与下一步\n\n1. 下一步行动\n2. 负责人和时间\n\n## 来源\n',
          '# Analysis report\n\n## Executive summary\n\nState the core conclusion in three to five sentences.\n\n## Context and objective\n\n- Context:\n- Question to answer:\n- Scope:\n\n## Key findings\n\n### Finding one\n\nConclusion, evidence, and interpretation.\n\n## Risks and limitations\n\n- Known limitations:\n- Items to verify:\n\n## Recommendations and next steps\n\n1. Next action\n2. Owner and due date\n\n## Sources\n',
        ),
        locale,
      ),
  }),
  Object.freeze({
    id: 'document-proposal',
    projectType: 'document',
    title: localized('项目提案', 'Project proposal'),
    description: localized(
      '适合方案、服务或内部立项，包含范围、里程碑和验收标准。',
      'A proposal with scope, milestones, and acceptance criteria.',
    ),
    createContent: (locale?: string) =>
      documentContent(
        localized(
          '# 项目提案\n\n## 目标\n\n## 现状与机会\n\n## 建议方案\n\n### 工作范围\n\n### 不在范围内\n\n## 里程碑\n\n| 阶段 | 交付物 | 时间 |\n| --- | --- | --- |\n| 1 |  |  |\n\n## 资源与预算\n\n## 风险与应对\n\n## 验收标准\n\n## 需要确认的决策\n',
          '# Project proposal\n\n## Objective\n\n## Current state and opportunity\n\n## Proposed approach\n\n### In scope\n\n### Out of scope\n\n## Milestones\n\n| Phase | Deliverable | Timing |\n| --- | --- | --- |\n| 1 |  |  |\n\n## Resources and budget\n\n## Risks and mitigations\n\n## Acceptance criteria\n\n## Decisions needed\n',
        ),
        locale,
      ),
  }),
  Object.freeze({
    id: 'document-meeting',
    projectType: 'document',
    title: localized('会议纪要', 'Meeting notes'),
    description: localized(
      '把议题、结论、分歧和行动项放进可追踪的纪要。',
      'Capture decisions, open questions, and accountable action items.',
    ),
    createContent: (locale?: string) =>
      documentContent(
        localized(
          '# 会议纪要\n\n- 时间：\n- 参与人：\n- 会议目标：\n\n## 议程\n\n1. \n\n## 讨论记录\n\n## 已确认决策\n\n- \n\n## 待确认问题\n\n- \n\n## 行动项\n\n| 行动 | 负责人 | 截止时间 | 状态 |\n| --- | --- | --- | --- |\n|  |  |  | 待开始 |\n',
          '# Meeting notes\n\n- Date:\n- Attendees:\n- Objective:\n\n## Agenda\n\n1. \n\n## Discussion\n\n## Decisions\n\n- \n\n## Open questions\n\n- \n\n## Action items\n\n| Action | Owner | Due | Status |\n| --- | --- | --- | --- |\n|  |  |  | Not started |\n',
        ),
        locale,
      ),
  }),
  Object.freeze({
    id: 'document-lesson',
    projectType: 'document',
    title: localized('课程讲义', 'Lesson handout'),
    description: localized(
      '围绕学习目标组织概念、示例、练习与课后复盘。',
      'Organize concepts, examples, practice, and review around learning goals.',
    ),
    createContent: (locale?: string) =>
      documentContent(
        localized(
          '# 课程讲义\n\n## 学习目标\n\n完成本节后，你将能够：\n\n- \n\n## 核心概念\n\n### 概念一\n\n## 示例与演示\n\n## 练习\n\n1. \n\n## 常见误区\n\n## 本节总结\n\n## 延伸阅读\n',
          '# Lesson handout\n\n## Learning objectives\n\nAfter this lesson, you will be able to:\n\n- \n\n## Key concepts\n\n### Concept one\n\n## Examples and demonstration\n\n## Practice\n\n1. \n\n## Common misconceptions\n\n## Recap\n\n## Further reading\n',
        ),
        locale,
      ),
  }),
]);

const PRESENTATION_STARTERS: readonly ProductionProjectStarter[] = Object.freeze([
  Object.freeze({
    id: 'presentation-pitch',
    projectType: 'presentation',
    title: localized('方案路演', 'Solution pitch'),
    description: localized(
      '从问题、洞察、方案到计划和明确诉求。',
      'Move from problem and insight to solution, plan, and a clear ask.',
    ),
    createContent: (locale?: string) =>
      presentationContent(
        (selectedLocale) => [
          slide(
            'pitch-title',
            localized('方案名称', 'Solution name'),
            localized('一句话价值主张', 'One-line value proposition'),
            selectedLocale,
            'title',
          ),
          slide(
            'pitch-problem',
            localized('问题与机会', 'Problem and opportunity'),
            localized('- 谁遇到了什么问题\n- 为什么现在值得解决', '- Who has this problem\n- Why it matters now'),
            selectedLocale,
          ),
          slide(
            'pitch-insight',
            localized('关键洞察', 'Key insight'),
            localized(
              '- 证据一\n- 证据二\n- 由此得到的判断',
              '- Evidence one\n- Evidence two\n- The resulting insight',
            ),
            selectedLocale,
          ),
          slide(
            'pitch-solution',
            localized('建议方案', 'Proposed solution'),
            localized(
              '- 核心能力\n- 使用方式\n- 与替代方案的差异',
              '- Core capability\n- How it works\n- Why it is different',
            ),
            selectedLocale,
          ),
          slide(
            'pitch-proof',
            localized('验证与成果', 'Proof and outcomes'),
            localized('- 指标\n- 案例\n- 用户反馈', '- Metrics\n- Case study\n- User feedback'),
            selectedLocale,
          ),
          slide(
            'pitch-plan',
            localized('落地计划', 'Delivery plan'),
            localized('1. 第一阶段\n2. 第二阶段\n3. 第三阶段', '1. Phase one\n2. Phase two\n3. Phase three'),
            selectedLocale,
          ),
          slide(
            'pitch-ask',
            localized('需要确认', 'The ask'),
            localized('- 需要的决策\n- 资源\n- 下一步', '- Decision needed\n- Resources\n- Next step'),
            selectedLocale,
            'section',
          ),
        ],
        locale,
      ),
  }),
  Object.freeze({
    id: 'presentation-lesson',
    projectType: 'presentation',
    title: localized('课程演示', 'Lesson deck'),
    description: localized(
      '适合授课、培训和知识分享的教学故事线。',
      'A teaching flow for lessons, training, and knowledge sharing.',
    ),
    createContent: (locale?: string) =>
      presentationContent(
        (selectedLocale) => [
          slide(
            'lesson-title',
            localized('课程主题', 'Lesson topic'),
            localized('讲师 · 日期', 'Presenter · Date'),
            selectedLocale,
            'title',
          ),
          slide(
            'lesson-goals',
            localized('学习目标', 'Learning objectives'),
            localized('- 目标一\n- 目标二\n- 目标三', '- Objective one\n- Objective two\n- Objective three'),
            selectedLocale,
          ),
          slide(
            'lesson-map',
            localized('知识地图', 'Concept map'),
            localized('今天会如何从已知走向新知识', 'How today moves from prior knowledge to the new idea'),
            selectedLocale,
          ),
          slide(
            'lesson-concept',
            localized('核心概念', 'Core concept'),
            localized('- 定义\n- 原理\n- 适用边界', '- Definition\n- How it works\n- Boundaries'),
            selectedLocale,
          ),
          slide(
            'lesson-example',
            localized('示例', 'Worked example'),
            localized('用一个具体案例演示完整过程', 'Demonstrate the complete process with one concrete example'),
            selectedLocale,
          ),
          slide(
            'lesson-practice',
            localized('练习与讨论', 'Practice and discussion'),
            localized('1. 练习题\n2. 讨论问题', '1. Practice prompt\n2. Discussion question'),
            selectedLocale,
          ),
          slide(
            'lesson-recap',
            localized('回顾与下一步', 'Recap and next step'),
            localized('- 记住这三点\n- 课后行动', '- Remember these three ideas\n- After-class action'),
            selectedLocale,
            'section',
          ),
        ],
        locale,
      ),
  }),
  Object.freeze({
    id: 'presentation-review',
    projectType: 'presentation',
    title: localized('项目复盘', 'Project review'),
    description: localized(
      '用目标、进展、数据、风险和下一步完成阶段复盘。',
      'Review goals, progress, evidence, risks, and the next phase.',
    ),
    createContent: (locale?: string) =>
      presentationContent(
        (selectedLocale) => [
          slide(
            'review-title',
            localized('项目复盘', 'Project review'),
            localized('阶段 · 日期', 'Phase · Date'),
            selectedLocale,
            'title',
          ),
          slide(
            'review-goals',
            localized('目标与范围', 'Goals and scope'),
            localized('- 原定目标\n- 本期范围\n- 成功标准', '- Original goal\n- Phase scope\n- Success criteria'),
            selectedLocale,
          ),
          slide(
            'review-progress',
            localized('进展概览', 'Progress overview'),
            localized('- 已完成\n- 进行中\n- 未开始', '- Completed\n- In progress\n- Not started'),
            selectedLocale,
          ),
          slide(
            'review-data',
            localized('关键数据', 'Key evidence'),
            localized('- 指标变化\n- 用户反馈\n- 质量信号', '- Metric changes\n- User feedback\n- Quality signals'),
            selectedLocale,
          ),
          slide(
            'review-lessons',
            localized('经验与偏差', 'Lessons and gaps'),
            localized(
              '- 做对了什么\n- 哪些假设不成立\n- 应停止什么',
              '- What worked\n- Which assumptions failed\n- What to stop',
            ),
            selectedLocale,
          ),
          slide(
            'review-risks',
            localized('风险与依赖', 'Risks and dependencies'),
            localized('- 风险\n- 影响\n- 缓解措施', '- Risk\n- Impact\n- Mitigation'),
            selectedLocale,
          ),
          slide(
            'review-next',
            localized('下一阶段', 'Next phase'),
            localized('- 优先事项\n- 负责人\n- 需要的决策', '- Priorities\n- Owners\n- Decisions needed'),
            selectedLocale,
            'section',
          ),
        ],
        locale,
      ),
  }),
]);

const WORKBOOK_STARTERS: readonly ProductionProjectStarter[] = Object.freeze([
  Object.freeze({
    id: 'workbook-budget',
    projectType: 'workbook',
    title: localized('预算规划', 'Budget planner'),
    description: localized(
      '按类别记录预算与实际支出，并自动计算差额。',
      'Track planned and actual spend with calculated variance.',
    ),
    createContent: (locale?: string) =>
      workbookContent(
        (selectedLocale) => [
          workbookSheet(
            'budget',
            localized('预算', 'Budget'),
            {
              A1: { value: productionStarterLocale(selectedLocale) === 'zh-CN' ? '类别' : 'Category' },
              B1: { value: productionStarterLocale(selectedLocale) === 'zh-CN' ? '预算' : 'Planned' },
              C1: { value: productionStarterLocale(selectedLocale) === 'zh-CN' ? '实际' : 'Actual' },
              D1: { value: productionStarterLocale(selectedLocale) === 'zh-CN' ? '差额' : 'Variance' },
              A2: {
                value: productionStarterLocale(selectedLocale) === 'zh-CN' ? '软件与服务' : 'Software and services',
              },
              B2: { value: 0 },
              C2: { value: 0 },
              D2: { value: null, formula: 'B2-C2' },
              A3: {
                value: productionStarterLocale(selectedLocale) === 'zh-CN' ? '内容与推广' : 'Content and marketing',
              },
              B3: { value: 0 },
              C3: { value: 0 },
              D3: { value: null, formula: 'B3-C3' },
              A5: { value: productionStarterLocale(selectedLocale) === 'zh-CN' ? '合计' : 'Total' },
              B5: { value: null, formula: 'SUM(B2:B4)' },
              C5: { value: null, formula: 'SUM(C2:C4)' },
              D5: { value: null, formula: 'B5-C5' },
            },
            selectedLocale,
          ),
        ],
        locale,
      ),
  }),
  Object.freeze({
    id: 'workbook-project-tracker',
    projectType: 'workbook',
    title: localized('项目进度表', 'Project tracker'),
    description: localized(
      '跟踪事项、负责人、优先级、状态与截止时间。',
      'Track owners, priority, status, and due dates.',
    ),
    createContent: (locale?: string) =>
      workbookContent((selectedLocale) => {
        const zh = productionStarterLocale(selectedLocale) === 'zh-CN';
        return [
          workbookSheet(
            'tasks',
            localized('任务', 'Tasks'),
            {
              A1: { value: zh ? '任务' : 'Task' },
              B1: { value: zh ? '负责人' : 'Owner' },
              C1: { value: zh ? '优先级' : 'Priority' },
              D1: { value: zh ? '状态' : 'Status' },
              E1: { value: zh ? '截止时间' : 'Due date' },
              F1: { value: zh ? '备注' : 'Notes' },
              A2: { value: zh ? '示例任务' : 'Example task' },
              C2: { value: zh ? '高' : 'High' },
              D2: { value: zh ? '待开始' : 'Not started' },
            },
            selectedLocale,
          ),
        ];
      }, locale),
  }),
  Object.freeze({
    id: 'workbook-content-calendar',
    projectType: 'workbook',
    title: localized('内容日历', 'Content calendar'),
    description: localized(
      '规划选题、渠道、发布时间、素材和发布状态。',
      'Plan topics, channels, publish dates, assets, and status.',
    ),
    createContent: (locale?: string) =>
      workbookContent((selectedLocale) => {
        const zh = productionStarterLocale(selectedLocale) === 'zh-CN';
        return [
          workbookSheet(
            'calendar',
            localized('内容计划', 'Content plan'),
            {
              A1: { value: zh ? '发布日期' : 'Publish date' },
              B1: { value: zh ? '选题' : 'Topic' },
              C1: { value: zh ? '渠道' : 'Channel' },
              D1: { value: zh ? '内容类型' : 'Format' },
              E1: { value: zh ? '负责人' : 'Owner' },
              F1: { value: zh ? '状态' : 'Status' },
              G1: { value: zh ? '素材链接' : 'Asset link' },
            },
            selectedLocale,
          ),
        ];
      }, locale),
  }),
  Object.freeze({
    id: 'workbook-comparison',
    projectType: 'workbook',
    title: localized('方案对比表', 'Option comparison'),
    description: localized(
      '用统一指标对比多个方案，并保留判断依据。',
      'Compare options against consistent criteria and capture rationale.',
    ),
    createContent: (locale?: string) =>
      workbookContent((selectedLocale) => {
        const zh = productionStarterLocale(selectedLocale) === 'zh-CN';
        return [
          workbookSheet(
            'comparison',
            localized('方案对比', 'Comparison'),
            {
              A1: { value: zh ? '指标' : 'Criterion' },
              B1: { value: zh ? '权重' : 'Weight' },
              C1: { value: zh ? '方案 A' : 'Option A' },
              D1: { value: zh ? '方案 B' : 'Option B' },
              E1: { value: zh ? '方案 C' : 'Option C' },
              F1: { value: zh ? '判断依据' : 'Rationale' },
              A2: { value: zh ? '成本' : 'Cost' },
              B2: { value: 0.3 },
              A3: { value: zh ? '实施难度' : 'Implementation effort' },
              B3: { value: 0.3 },
              A4: { value: zh ? '长期价值' : 'Long-term value' },
              B4: { value: 0.4 },
            },
            selectedLocale,
          ),
        ];
      }, locale),
  }),
]);

export const PRODUCTION_PROJECT_STARTERS = Object.freeze([
  ...DOCUMENT_STARTERS,
  ...PRESENTATION_STARTERS,
  ...WORKBOOK_STARTERS,
]);

const starterById = new Map(PRODUCTION_PROJECT_STARTERS.map((starter) => [starter.id, starter]));

export function productionProjectStartersFor(projectType: ProductionProjectType) {
  return PRODUCTION_PROJECT_STARTERS.filter((starter) => starter.projectType === projectType);
}

export function productionProjectStarterById(starterId: string) {
  return starterById.get(String(starterId || '')) || null;
}

export function productionProjectStarterCopy(starter: ProductionProjectStarter, locale?: string) {
  const selectedLocale = productionStarterLocale(locale);
  return {
    title: starter.title[selectedLocale],
    description: starter.description[selectedLocale],
  };
}
