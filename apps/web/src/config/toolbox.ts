import { TOOLBOX_TOOL_INTENTS, type ToolboxToolId } from '@lightnote/shared/toolbox-protocol';
import icon from '@/config/icon';

export type ToolboxCategory = 'workspace' | 'knowledge' | 'data' | 'document' | 'image' | 'text';

export type ToolboxWorkflowToolId =
  | 'idea_to_draft'
  | 'material_to_note'
  | 'research_brief'
  | 'study_kit'
  | 'concept_map'
  | 'action_plan'
  | 'source_comparison'
  | 'knowledge_audit';

export type ToolboxWorkflowPresentation = {
  defaultIntent: string;
  intents: readonly string[];
  outcomes: readonly string[];
};

export type ToolboxHomeGroup = {
  id: 'workspace' | 'create' | 'maintain' | 'prepare' | 'data';
  icon: string;
  accent: 'violet' | 'blue' | 'teal';
  toolIds: readonly ToolboxToolId[];
};

export const TOOLBOX_DEFAULT_QUICK_TOOL_IDS = [
  'knowledge_structure_audit',
  'image_optimizer',
  'pdf_organizer',
  'ocr_to_text',
  'text_diff',
  'table_converter',
  'data_workbench',
  'docx_to_markdown',
  'text_batch',
] as const satisfies readonly ToolboxToolId[];

/**
 * “知识库整理”是常用区的固定首项；账号或访客已有的固定工具从第二项开始排列。
 * 去重在这里完成，避免旧的本地固定记录再次把默认首项挤到后面。
 */
export function resolveToolboxQuickToolIds(pinnedToolIds: readonly string[]): string[] {
  const [leadToolId, ...remainingDefaultToolIds] = TOOLBOX_DEFAULT_QUICK_TOOL_IDS;
  return [...new Set([leadToolId, ...pinnedToolIds, ...remainingDefaultToolIds])];
}

export const TOOLBOX_STARTER_TOOL_IDS = [
  'writing_workspace',
  'learning_workspace',
  'research_workspace',
  'idea_to_draft',
] as const satisfies readonly ToolboxToolId[];

/**
 * 首页首屏只突出能快速形成明确交付物的能力。
 * 长期工作区留在目录和“继续工作”中；未上线的 Office 仿制编辑器不进入产品边界。
 */
export const TOOLBOX_PRIMARY_OUTCOME_TOOL_IDS = [
  'material_to_note',
  'research_brief',
  'source_comparison',
  'data_workbench',
] as const satisfies readonly ToolboxToolId[];

export const TOOLBOX_PRESENTATION: Record<
  ToolboxToolId,
  { icon: string; category: ToolboxCategory; accent: 'violet' | 'blue' | 'amber' | 'teal' | 'rose' }
> = {
  research_workspace: { icon: icon.toolbox.research, category: 'workspace', accent: 'blue' },
  learning_workspace: { icon: icon.toolbox.study, category: 'workspace', accent: 'teal' },
  writing_workspace: { icon: icon.toolbox.materialNote, category: 'workspace', accent: 'violet' },
  idea_to_draft: { icon: icon.toolbox.materialNote, category: 'knowledge', accent: 'violet' },
  material_to_note: { icon: icon.toolbox.materialNote, category: 'knowledge', accent: 'violet' },
  research_brief: { icon: icon.toolbox.research, category: 'knowledge', accent: 'blue' },
  study_kit: { icon: icon.toolbox.study, category: 'knowledge', accent: 'teal' },
  concept_map: { icon: icon.toolbox.conceptMap, category: 'knowledge', accent: 'violet' },
  action_plan: { icon: icon.toolbox.actionPlan, category: 'knowledge', accent: 'blue' },
  knowledge_audit: { icon: icon.toolbox.audit, category: 'knowledge', accent: 'rose' },
  pdf_organizer: { icon: icon.toolbox.pdf, category: 'document', accent: 'rose' },
  image_optimizer: { icon: icon.toolbox.image, category: 'image', accent: 'teal' },
  image_to_pdf: { icon: icon.toolbox.imageToPdf, category: 'document', accent: 'amber' },
  pdf_to_images: { icon: icon.toolbox.pdfToImages, category: 'document', accent: 'blue' },
  markdown_converter: { icon: icon.toolbox.markdown, category: 'text', accent: 'violet' },
  text_diff: { icon: icon.toolbox.textDiff, category: 'text', accent: 'rose' },
  table_converter: { icon: icon.toolbox.table, category: 'text', accent: 'teal' },
  mermaid_editor: { icon: icon.toolbox.mermaid, category: 'knowledge', accent: 'violet' },
  data_workbench: { icon: icon.toolbox.table, category: 'data', accent: 'violet' },
  data_quality_report: { icon: icon.toolbox.audit, category: 'data', accent: 'blue' },
  data_cleaner: { icon: icon.toolbox.table, category: 'data', accent: 'teal' },
  data_validator: { icon: icon.toolbox.audit, category: 'data', accent: 'rose' },
  pivot_analysis: { icon: icon.toolbox.table, category: 'data', accent: 'violet' },
  table_diff: { icon: icon.toolbox.comparison, category: 'data', accent: 'amber' },
  table_merge_split: { icon: icon.toolbox.swap, category: 'data', accent: 'blue' },
  data_anonymizer: { icon: icon.toolbox.local, category: 'data', accent: 'teal' },
  data_chart: { icon: icon.toolbox.mermaid, category: 'data', accent: 'rose' },
  text_batch: { icon: icon.toolbox.markdown, category: 'text', accent: 'blue' },
  regex_extractor: { icon: icon.toolbox.textDiff, category: 'text', accent: 'amber' },
  pdf_text_extractor: { icon: icon.toolbox.ocr, category: 'document', accent: 'blue' },
  markdown_checker: { icon: icon.toolbox.audit, category: 'text', accent: 'teal' },
  frontmatter_batch: { icon: icon.toolbox.markdown, category: 'text', accent: 'violet' },
  citation_converter: { icon: icon.toolbox.research, category: 'text', accent: 'amber' },
  browser_sql: { icon: icon.toolbox.table, category: 'data', accent: 'violet' },
  structured_data_lab: { icon: icon.toolbox.table, category: 'data', accent: 'blue' },
  docx_to_markdown: { icon: icon.toolbox.markdown, category: 'document', accent: 'teal' },
  code_snapshot: { icon: icon.toolbox.image, category: 'text', accent: 'rose' },
  knowledge_structure_audit: { icon: icon.toolbox.audit, category: 'knowledge', accent: 'teal' },
  directory_index: { icon: icon.toolbox.markdown, category: 'knowledge', accent: 'blue' },
  source_comparison: { icon: icon.toolbox.comparison, category: 'knowledge', accent: 'amber' },
  ocr_to_text: { icon: icon.toolbox.ocr, category: 'document', accent: 'blue' },
};

export const TOOLBOX_WORKSPACE_TOOL_BY_KIND = {
  research: 'research_workspace',
  learning: 'learning_workspace',
  writing: 'writing_workspace',
} as const satisfies Record<string, ToolboxToolId>;

/**
 * 已合并工具的历史入口。协议保留旧 ID 以兼容收藏和旧链接，目录与新链接只暴露规范工具。
 */
export const TOOLBOX_TOOL_ALIASES = Object.freeze({
  image_to_pdf: 'pdf_organizer',
  pdf_to_images: 'pdf_organizer',
  pdf_text_extractor: 'pdf_organizer',
  data_quality_report: 'data_workbench',
  data_cleaner: 'data_workbench',
  data_validator: 'data_workbench',
  pivot_analysis: 'data_workbench',
  table_diff: 'data_workbench',
  table_merge_split: 'data_workbench',
  data_anonymizer: 'data_workbench',
  data_chart: 'data_workbench',
} as const satisfies Partial<Record<ToolboxToolId, ToolboxToolId>>);

export function canonicalToolboxToolId(toolId: ToolboxToolId | string): ToolboxToolId {
  return (TOOLBOX_TOOL_ALIASES[toolId as keyof typeof TOOLBOX_TOOL_ALIASES] || toolId) as ToolboxToolId;
}

export type ToolboxWorkspaceTemplateKind = keyof typeof TOOLBOX_WORKSPACE_TOOL_BY_KIND;

export function toolboxWorkspaceToolId(kind: ToolboxWorkspaceTemplateKind): ToolboxToolId {
  return TOOLBOX_WORKSPACE_TOOL_BY_KIND[kind];
}

export function toolboxWorkspaceKind(toolId: ToolboxToolId | string): ToolboxWorkspaceTemplateKind {
  const match = Object.entries(TOOLBOX_WORKSPACE_TOOL_BY_KIND).find(([, id]) => id === toolId);
  return (match?.[0] as ToolboxWorkspaceTemplateKind | undefined) || 'research';
}

/**
 * 首页只展示能直接完成知识生产、维护或资料预处理的核心工具。
 * 工具是否可执行仍由共享协议的 availability 决定；这里仅维护稳定的首页分组与顺序。
 */
export const TOOLBOX_HOME_GROUPS = [
  {
    id: 'workspace',
    icon: icon.toolbox.actionPlan,
    accent: 'violet',
    toolIds: ['research_workspace', 'learning_workspace', 'writing_workspace'],
  },
  {
    id: 'create',
    icon: icon.toolbox.materialNote,
    accent: 'violet',
    toolIds: ['idea_to_draft', 'material_to_note', 'research_brief', 'source_comparison', 'study_kit', 'concept_map'],
  },
  {
    id: 'maintain',
    icon: icon.toolbox.audit,
    accent: 'teal',
    toolIds: ['knowledge_structure_audit', 'knowledge_audit', 'markdown_checker'],
  },
  {
    id: 'prepare',
    icon: icon.toolbox.pdf,
    accent: 'blue',
    toolIds: ['docx_to_markdown', 'ocr_to_text', 'pdf_organizer', 'image_optimizer'],
  },
  {
    id: 'data',
    icon: icon.toolbox.table,
    accent: 'blue',
    toolIds: ['data_workbench', 'table_converter', 'text_batch', 'text_diff'],
  },
] as const satisfies readonly ToolboxHomeGroup[];

/**
 * 知识工具只在这里声明工作流结构，面向用户的文案由 i18n 维护。
 * 后端只接收稳定的 question / intent / detailLevel；intent 再映射为服务端受控指令，
 * 避免新增工具时复制整张工作台，也避免客户端自由指令切换成果类型。
 */
export const TOOLBOX_WORKFLOW_PRESENTATION: Record<ToolboxWorkflowToolId, ToolboxWorkflowPresentation> = {
  idea_to_draft: {
    defaultIntent: 'article',
    intents: TOOLBOX_TOOL_INTENTS.idea_to_draft,
    outcomes: ['positioning', 'structure', 'draft', 'verification'],
  },
  material_to_note: {
    defaultIntent: 'synthesize',
    intents: TOOLBOX_TOOL_INTENTS.material_to_note,
    outcomes: ['structure', 'evidence', 'openQuestions'],
  },
  research_brief: {
    defaultIntent: 'decision',
    intents: TOOLBOX_TOOL_INTENTS.research_brief,
    outcomes: ['conclusions', 'evidence', 'gaps'],
  },
  study_kit: {
    defaultIntent: 'understand',
    intents: TOOLBOX_TOOL_INTENTS.study_kit,
    outcomes: ['framework', 'flashcards', 'quiz'],
  },
  concept_map: {
    defaultIntent: 'overview',
    intents: TOOLBOX_TOOL_INTENTS.concept_map,
    outcomes: ['diagram', 'relations', 'readingPath'],
  },
  action_plan: {
    defaultIntent: 'meeting',
    intents: TOOLBOX_TOOL_INTENTS.action_plan,
    outcomes: ['decisions', 'actions', 'risks'],
  },
  source_comparison: {
    defaultIntent: 'claims',
    intents: TOOLBOX_TOOL_INTENTS.source_comparison,
    outcomes: ['matrix', 'conflicts', 'gaps'],
  },
  knowledge_audit: {
    defaultIntent: 'cleanup',
    intents: TOOLBOX_TOOL_INTENTS.knowledge_audit,
    outcomes: ['duplicates', 'risks', 'actions'],
  },
};

export function isToolboxWorkflowTool(toolId: ToolboxToolId | string): toolId is ToolboxWorkflowToolId {
  return Object.prototype.hasOwnProperty.call(TOOLBOX_WORKFLOW_PRESENTATION, toolId);
}

export function toolboxToolPath(toolId: ToolboxToolId | string) {
  return `/toolbox/${encodeURIComponent(String(canonicalToolboxToolId(toolId)))}`;
}
