/**
 * 「插入图表」用的 mermaid 模板。
 *
 * 图表里的节点文字跟界面语言走(和 noteTemplates 一样按 locale 存两份);
 * mermaid 语法本身是代码,不进 i18n —— 翻译层碰不得,否则一改就是语法错误。
 */
export type MermaidTemplateKey = 'mindmap' | 'flowchart' | 'sequence' | 'timeline';

export interface MermaidTemplate {
  key: MermaidTemplateKey;
  /** i18n key,菜单项文案 */
  labelKey: string;
  code: { zh: string; en: string };
}

export const MERMAID_TEMPLATES: MermaidTemplate[] = [
  {
    key: 'mindmap',
    labelKey: 'note.diagramMindmap',
    code: {
      zh: `mindmap
  root(核心主题)
    分支一
      要点 A
      要点 B
    分支二
      要点 C`,
      en: `mindmap
  root(Core topic)
    Branch 1
      Point A
      Point B
    Branch 2
      Point C`,
    },
  },
  {
    key: 'flowchart',
    labelKey: 'note.diagramFlowchart',
    code: {
      zh: `flowchart TD
  A[开始] --> B{是否满足条件}
  B -->|是| C[执行方案]
  B -->|否| D[调整方案]
  C --> E[结束]
  D --> B`,
      en: `flowchart TD
  A[Start] --> B{Condition met?}
  B -->|Yes| C[Run plan]
  B -->|No| D[Adjust plan]
  C --> E[End]
  D --> B`,
    },
  },
  {
    key: 'sequence',
    labelKey: 'note.diagramSequence',
    code: {
      zh: `sequenceDiagram
  participant 用户
  participant 系统
  用户->>系统: 发起请求
  系统-->>用户: 返回结果`,
      en: `sequenceDiagram
  participant User
  participant System
  User->>System: Send request
  System-->>User: Return result`,
    },
  },
  {
    key: 'timeline',
    labelKey: 'note.diagramTimeline',
    code: {
      zh: `timeline
  title 项目里程碑
  section 第一阶段
    立项 : 确认目标
    调研 : 收集资料
  section 第二阶段
    开发 : 完成主要功能
    上线 : 对外发布`,
      en: `timeline
  title Milestones
  section Phase 1
    Kickoff : Confirm goals
    Research : Collect material
  section Phase 2
    Build : Ship main features
    Launch : Public release`,
    },
  },
];

/** 取模板对应的 Markdown 代码块(含围栏) */
export function mermaidTemplateMarkdown(template: MermaidTemplate, locale: string): string {
  const code = locale.startsWith('zh') ? template.code.zh : template.code.en;
  return '```mermaid\n' + code + '\n```';
}
