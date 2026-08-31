export type ToolboxExecutionMode =
  "browser" | "service" | "worker" | "ai_skill";
export type ToolboxBillingMedium = "free" | "points" | "ai_quota";
export type ToolboxJobStatus =
  | "queued"
  | "processing"
  | "succeeded"
  | "partial_succeeded"
  | "failed"
  | "cancelled"
  | "expired";
export type ToolboxBillingStatus =
  | "quoted"
  | "reserved"
  | "settled"
  | "partially_settled"
  | "released"
  | "refunded";
export type ToolboxSaveStatus = "unsaved" | "saving" | "saved" | "save_failed";
export type ToolboxResourceType = "note" | "bookmark" | "file";
export type ToolboxToolId =
  | "research_workspace"
  | "learning_workspace"
  | "writing_workspace"
  | "idea_to_draft"
  | "material_to_note"
  | "research_brief"
  | "study_kit"
  | "concept_map"
  | "action_plan"
  | "knowledge_audit"
  | "pdf_organizer"
  | "image_optimizer"
  | "image_to_pdf"
  | "pdf_to_images"
  | "markdown_converter"
  | "text_diff"
  | "table_converter"
  | "mermaid_editor"
  | "data_workbench"
  | "data_quality_report"
  | "data_cleaner"
  | "data_validator"
  | "pivot_analysis"
  | "table_diff"
  | "table_merge_split"
  | "data_anonymizer"
  | "data_chart"
  | "text_batch"
  | "regex_extractor"
  | "pdf_text_extractor"
  | "markdown_checker"
  | "frontmatter_batch"
  | "citation_converter"
  | "browser_sql"
  | "structured_data_lab"
  | "docx_to_markdown"
  | "code_snapshot"
  | "knowledge_structure_audit"
  | "directory_index"
  | "source_comparison"
  | "ocr_to_text";
export type ToolboxAiToolId =
  | "idea_to_draft"
  | "material_to_note"
  | "research_brief"
  | "study_kit"
  | "concept_map"
  | "action_plan"
  | "source_comparison"
  | "knowledge_audit";

export interface ToolboxToolDefinition {
  id: ToolboxToolId;
  phase: "launch" | "next";
  executionMode: ToolboxExecutionMode;
  billingMedium: ToolboxBillingMedium;
  billingMedia: readonly ToolboxBillingMedium[];
  input: Readonly<{
    kind:
      | "resources"
      | "local_files"
      | "local_text"
      | "documents"
      | "account"
      | "prompt";
    minItems: number;
    maxItems: number;
    resourceTypes?: readonly ToolboxResourceType[];
    accept?: readonly string[];
    maxBytes?: number;
    maxChars?: number;
  }>;
  output: Readonly<{
    artifactType:
      | "note_draft"
      | "research_brief"
      | "study_kit"
      | "concept_map"
      | "action_plan"
      | "knowledge_audit"
      | "comparison"
      | "ocr_text"
      | null;
    contentType: string;
    canSaveToNote: boolean;
  }>;
  availability: Readonly<{ enabled: boolean }>;
}

export const TOOLBOX_PROTOCOL_VERSION: 1;
export const TOOLBOX_PRICING_VERSION: "toolbox-billing-v2";
export const TOOLBOX_PROCESSING_REQUIREMENT_MAX_CHARS: 1000;
export const TOOLBOX_EXECUTION_MODES: readonly ToolboxExecutionMode[];
export const TOOLBOX_BILLING_MEDIA: readonly ToolboxBillingMedium[];
export const TOOLBOX_JOB_STATUSES: readonly ToolboxJobStatus[];
export const TOOLBOX_BILLING_STATUSES: readonly ToolboxBillingStatus[];
export const TOOLBOX_SAVE_STATUSES: readonly ToolboxSaveStatus[];
export const TOOLBOX_ARTIFACT_TYPES: readonly (
  | "note_draft"
  | "research_brief"
  | "study_kit"
  | "concept_map"
  | "action_plan"
  | "knowledge_audit"
  | "comparison"
  | "ocr_text"
)[];
export const TOOLBOX_RESOURCE_TYPES: readonly ToolboxResourceType[];
export const TOOLBOX_TOOL_INTENTS: Readonly<
  Record<ToolboxAiToolId, readonly string[]>
>;
export const TOOLBOX_TOOL_CATALOG: readonly Readonly<ToolboxToolDefinition>[];
export function getToolboxTool(
  toolId: string,
): Readonly<ToolboxToolDefinition> | null;
export function isToolboxTerminalStatus(status: string): boolean;
export function isToolboxPaidTool(toolId: string): boolean;
