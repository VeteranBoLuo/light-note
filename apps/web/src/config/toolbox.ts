import { TOOLBOX_TOOL_INTENTS, type ToolboxToolId, type ToolboxJobStatus } from '@lightnote/shared/toolbox-protocol';
import type { ToolboxWorkspaceStatus } from '@/api/toolbox';
import icon from '@/config/icon';

export function toolboxJobStatusTone(status: ToolboxJobStatus): 'success' | 'pending' | 'danger' | 'neutral' {
  if (status === 'succeeded') return 'success';
  if (['queued', 'processing', 'partial_succeeded'].includes(status)) return 'pending';
  if (['failed', 'expired'].includes(status)) return 'danger';
  return 'neutral';
}

export function toolboxWorkspaceStatusTone(status: ToolboxWorkspaceStatus): 'success' | 'pending' | 'neutral' {
  if (status === 'active') return 'success';
  if (status === 'paused') return 'pending';
  return 'neutral';
}

export type ToolboxCategory = 'workspace' | 'knowledge' | 'document';

export type ToolboxWorkflowToolId = 'material_to_note' | 'study_kit';

export type ToolboxWorkflowPresentation = {
  defaultIntent: string;
  intents: readonly string[];
  outcomes: readonly string[];
};

export type ToolboxHomeGroup = {
  id: 'workspace' | 'create' | 'prepare';
  icon: string;
  accent: 'violet' | 'blue' | 'teal';
  toolIds: readonly ToolboxToolId[];
};

export const TOOLBOX_DEFAULT_QUICK_TOOL_IDS: ToolboxToolId[] = [
  'material_to_note',
  'study_kit',
  'pdf_organizer',
  'forms',
  'ocr_to_text',
];

/**
 * 已下架的工具：多数已从协议删除；有历史任务的 AI 工具保留协议身份与名称，仅用于展示历史成果。
 * 旧链接与旧置顶据此显示“已下架”而不是普通不可用。
 */
export const TOOLBOX_RETIRED_TOOL_IDS: readonly string[] = Object.freeze([
  'action_plan',
  'browser_sql',
  'citation_converter',
  'code_snapshot',
  'concept_map',
  'data_anonymizer',
  'data_chart',
  'data_cleaner',
  'data_quality_report',
  'data_validator',
  'data_workbench',
  'directory_index',
  'docx_to_markdown',
  'frontmatter_batch',
  'idea_to_draft',
  'image_optimizer',
  'knowledge_audit',
  'knowledge_structure_audit',
  'markdown_checker',
  'markdown_converter',
  'mermaid_editor',
  'pivot_analysis',
  'regex_extractor',
  'research_brief',
  'source_comparison',
  'structured_data_lab',
  'table_converter',
  'table_diff',
  'table_merge_split',
  'text_batch',
  'text_diff',
]);

export function isToolboxRetiredToolId(toolId: string) {
  return TOOLBOX_RETIRED_TOOL_IDS.includes(toolId);
}

/** User pins take priority; removed tools never return through older preferences. */
export function resolveToolboxQuickToolIds(pinnedToolIds: readonly string[]): string[] {
  return [
    ...new Set(
      [...pinnedToolIds, ...TOOLBOX_DEFAULT_QUICK_TOOL_IDS].map((id) =>
        ['learning_workspace', 'writing_workspace'].includes(id) ? 'research_workspace' : id,
      ),
    ),
  ].filter((id) => !isToolboxRetiredToolId(id));
}

export const TOOLBOX_PRESENTATION: Record<
  ToolboxToolId,
  { icon: string; category: ToolboxCategory; accent: 'violet' | 'blue' | 'amber' | 'teal' | 'rose' }
> = {
  extraction: { icon: icon.toolbox.table, category: 'knowledge', accent: 'violet' },
  translation: { icon: icon.language, category: 'knowledge', accent: 'violet' },
  forms: { icon: icon.toolbox.table, category: 'workspace', accent: 'teal' },
  research_workspace: { icon: icon.toolbox.research, category: 'workspace', accent: 'blue' },
  learning_workspace: { icon: icon.toolbox.study, category: 'workspace', accent: 'teal' },
  writing_workspace: { icon: icon.toolbox.materialNote, category: 'workspace', accent: 'violet' },
  idea_to_draft: { icon: icon.toolbox.materialNote, category: 'knowledge', accent: 'violet' },
  material_to_note: { icon: icon.toolbox.materialNote, category: 'knowledge', accent: 'violet' },
  research_brief: { icon: icon.toolbox.research, category: 'knowledge', accent: 'blue' },
  study_kit: { icon: icon.toolbox.study, category: 'knowledge', accent: 'teal' },
  concept_map: { icon: icon.toolbox.conceptMap, category: 'knowledge', accent: 'violet' },
  knowledge_audit: { icon: icon.toolbox.audit, category: 'knowledge', accent: 'rose' },
  pdf_organizer: { icon: icon.toolbox.pdf, category: 'document', accent: 'rose' },
  image_to_pdf: { icon: icon.toolbox.imageToPdf, category: 'document', accent: 'amber' },
  pdf_to_images: { icon: icon.toolbox.pdfToImages, category: 'document', accent: 'blue' },
  pdf_text_extractor: { icon: icon.toolbox.ocr, category: 'document', accent: 'blue' },
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
    toolIds: ['research_workspace', 'learning_workspace', 'writing_workspace', 'forms'],
  },
  {
    id: 'create',
    icon: icon.toolbox.materialNote,
    accent: 'violet',
    toolIds: ['extraction', 'translation', 'material_to_note', 'study_kit'],
  },
  {
    id: 'prepare',
    icon: icon.toolbox.pdf,
    accent: 'blue',
    toolIds: ['pdf_organizer', 'ocr_to_text'],
  },
] as const satisfies readonly ToolboxHomeGroup[];

/**
 * 知识工具只在这里声明工作流结构，面向用户的文案由 i18n 维护。
 * 后端只接收稳定的 question / intent / detailLevel；intent 再映射为服务端受控指令，
 * 避免新增工具时复制整张工作台，也避免客户端自由指令切换成果类型。
 */
export const TOOLBOX_WORKFLOW_PRESENTATION: Record<ToolboxWorkflowToolId, ToolboxWorkflowPresentation> = {
  material_to_note: {
    defaultIntent: 'synthesize',
    intents: TOOLBOX_TOOL_INTENTS.material_to_note,
    outcomes: ['structure', 'evidence', 'openQuestions'],
  },
  study_kit: {
    defaultIntent: 'understand',
    intents: TOOLBOX_TOOL_INTENTS.study_kit,
    outcomes: ['framework', 'flashcards', 'quiz'],
  },
};

export function isToolboxWorkflowTool(toolId: ToolboxToolId | string): toolId is ToolboxWorkflowToolId {
  return Object.prototype.hasOwnProperty.call(TOOLBOX_WORKFLOW_PRESENTATION, toolId);
}

export function toolboxToolPath(toolId: ToolboxToolId | string) {
  return `/toolbox/${encodeURIComponent(String(canonicalToolboxToolId(toolId)))}`;
}
