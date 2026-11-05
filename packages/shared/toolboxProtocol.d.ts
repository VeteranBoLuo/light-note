export const TOOLBOX_TRANSLATION_MAX_CHARS: 30000;
export const TOOLBOX_TRANSLATION_LANGUAGES: readonly string[];
export declare const TOOLBOX_OCR_FILE_EXTENSIONS: readonly string[];
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
  | "extraction"
  | "translation"
  | "forms"
  | "research_workspace"
  | "learning_workspace"
  | "writing_workspace"
  | "idea_to_draft"
  | "material_to_note"
  | "research_brief"
  | "study_kit"
  | "concept_map"
  | "knowledge_audit"
  | "pdf_organizer"
  | "image_to_pdf"
  | "pdf_to_images"
  | "pdf_text_extractor"
  | "source_comparison"
  | "ocr_to_text";
export type ToolboxAiToolId =
  | "material_to_note"
  | "study_kit";

export interface ToolboxToolDefinition {
  id: ToolboxToolId;
  phase: "launch" | "next";
  executionMode: ToolboxExecutionMode;
  billingMedium: ToolboxBillingMedium;
  billingMedia: readonly ToolboxBillingMedium[];
  input: Readonly<{
    kind:
      | "translation"
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
      | "translation"
      | "note_draft"
      | "research_brief"
      | "study_kit"
      | "concept_map"
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
export const TOOLBOX_BILLING_MEDIA: readonly ToolboxBillingMedium[];
export const TOOLBOX_JOB_STATUSES: readonly ToolboxJobStatus[];
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
