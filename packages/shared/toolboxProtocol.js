/**
 * 轻笺知识工具箱前后端共享协议。
 *
 * 工具目录只声明稳定能力边界，不包含易漂移的中文文案和动态价格。价格由服务端报价器
 * 按 pricingVersion 计算；免费 browser/service 工具不会创建 quote/job，其中浏览器工具不上传原文件，
 * 知识库服务只读写当前账号的必要结构、引用与推进状态，不复制资料正文。
 */
export const TOOLBOX_PROTOCOL_VERSION = 1;
export const TOOLBOX_PRICING_VERSION = "toolbox-points-v1";
export const TOOLBOX_PROCESSING_REQUIREMENT_MAX_CHARS = 1_000;

export const TOOLBOX_EXECUTION_MODES = Object.freeze([
  "browser",
  "service",
  "worker",
  "ai_skill",
]);
export const TOOLBOX_BILLING_MEDIA = Object.freeze(["free", "points"]);
export const TOOLBOX_JOB_STATUSES = Object.freeze([
  "queued",
  "processing",
  "succeeded",
  "partial_succeeded",
  "failed",
  "cancelled",
  "expired",
]);
export const TOOLBOX_BILLING_STATUSES = Object.freeze([
  "quoted",
  "reserved",
  "settled",
  "partially_settled",
  "released",
  "refunded",
]);
export const TOOLBOX_SAVE_STATUSES = Object.freeze([
  "unsaved",
  "saving",
  "saved",
  "save_failed",
]);
export const TOOLBOX_ARTIFACT_TYPES = Object.freeze([
  "note_draft",
  "research_brief",
  "study_kit",
  "concept_map",
  "action_plan",
  "knowledge_audit",
  "comparison",
  "ocr_text",
]);
export const TOOLBOX_RESOURCE_TYPES = Object.freeze([
  "note",
  "bookmark",
  "file",
]);
export const TOOLBOX_TOOL_INTENTS = Object.freeze({
  idea_to_draft: Object.freeze(["article", "proposal", "script"]),
  material_to_note: Object.freeze(["synthesize", "outline", "merge"]),
  research_brief: Object.freeze(["decision", "landscape", "verify"]),
  study_kit: Object.freeze(["understand", "memorize", "practice"]),
  concept_map: Object.freeze(["overview", "causal", "compare"]),
  action_plan: Object.freeze(["meeting", "project", "decision"]),
  source_comparison: Object.freeze(["claims", "viewpoints", "options"]),
  knowledge_audit: Object.freeze(["cleanup", "freshness", "gaps"]),
});

function tool(definition) {
  const input = {
    ...definition.input,
    ...(definition.input.resourceTypes
      ? { resourceTypes: Object.freeze([...definition.input.resourceTypes]) }
      : {}),
    ...(definition.input.accept
      ? { accept: Object.freeze([...definition.input.accept]) }
      : {}),
  };
  return Object.freeze({
    ...definition,
    input: Object.freeze(input),
    output: Object.freeze({ ...definition.output }),
    availability: Object.freeze({ ...definition.availability }),
  });
}

/**
 * phase=launch 表示一期首发即可用；phase=next 表示协议、入口和任务能力已预留，产品可按
 * 运行时 feature flag 灰度开放。availability.enabled 是代码默认值，服务端仍可关闭工具。
 */
export const TOOLBOX_TOOL_CATALOG = Object.freeze([
  tool({
    id: "research_workspace",
    phase: "launch",
    executionMode: "service",
    billingMedium: "free",
    input: { kind: "account", minItems: 1, maxItems: 1 },
    output: {
      artifactType: null,
      contentType: "application/json",
      canSaveToNote: false,
    },
    availability: { enabled: true },
  }),
  tool({
    id: "learning_workspace",
    phase: "launch",
    executionMode: "service",
    billingMedium: "free",
    input: { kind: "account", minItems: 1, maxItems: 1 },
    output: {
      artifactType: null,
      contentType: "application/json",
      canSaveToNote: false,
    },
    availability: { enabled: true },
  }),
  tool({
    id: "writing_workspace",
    phase: "launch",
    executionMode: "service",
    billingMedium: "free",
    input: { kind: "account", minItems: 1, maxItems: 1 },
    output: {
      artifactType: null,
      contentType: "application/json",
      canSaveToNote: false,
    },
    availability: { enabled: true },
  }),
  tool({
    id: "idea_to_draft",
    phase: "launch",
    executionMode: "ai_skill",
    billingMedium: "points",
    input: { kind: "prompt", minItems: 0, maxItems: 0 },
    output: {
      artifactType: "note_draft",
      contentType: "markdown",
      canSaveToNote: true,
    },
    availability: { enabled: true },
  }),
  tool({
    id: "material_to_note",
    phase: "launch",
    executionMode: "ai_skill",
    billingMedium: "points",
    input: {
      kind: "resources",
      minItems: 2,
      maxItems: 20,
      resourceTypes: TOOLBOX_RESOURCE_TYPES,
    },
    output: {
      artifactType: "note_draft",
      contentType: "markdown",
      canSaveToNote: true,
    },
    availability: { enabled: true },
  }),
  tool({
    id: "research_brief",
    phase: "launch",
    executionMode: "ai_skill",
    billingMedium: "points",
    input: {
      kind: "resources",
      minItems: 1,
      maxItems: 10,
      resourceTypes: TOOLBOX_RESOURCE_TYPES,
    },
    output: {
      artifactType: "research_brief",
      contentType: "markdown",
      canSaveToNote: true,
    },
    availability: { enabled: true },
  }),
  tool({
    id: "study_kit",
    phase: "launch",
    executionMode: "ai_skill",
    billingMedium: "points",
    input: {
      kind: "resources",
      minItems: 1,
      maxItems: 12,
      resourceTypes: TOOLBOX_RESOURCE_TYPES,
    },
    output: {
      artifactType: "study_kit",
      contentType: "markdown",
      canSaveToNote: true,
    },
    availability: { enabled: true },
  }),
  tool({
    id: "concept_map",
    phase: "launch",
    executionMode: "ai_skill",
    billingMedium: "points",
    input: {
      kind: "resources",
      minItems: 1,
      maxItems: 12,
      resourceTypes: TOOLBOX_RESOURCE_TYPES,
    },
    output: {
      artifactType: "concept_map",
      contentType: "markdown",
      canSaveToNote: true,
    },
    availability: { enabled: true },
  }),
  tool({
    id: "action_plan",
    phase: "launch",
    executionMode: "ai_skill",
    billingMedium: "points",
    input: {
      kind: "resources",
      minItems: 1,
      maxItems: 10,
      resourceTypes: TOOLBOX_RESOURCE_TYPES,
    },
    output: {
      artifactType: "action_plan",
      contentType: "markdown",
      canSaveToNote: true,
    },
    availability: { enabled: false },
  }),
  tool({
    id: "source_comparison",
    phase: "next",
    executionMode: "ai_skill",
    billingMedium: "points",
    input: {
      kind: "resources",
      minItems: 2,
      maxItems: 10,
      resourceTypes: TOOLBOX_RESOURCE_TYPES,
    },
    output: {
      artifactType: "comparison",
      contentType: "markdown",
      canSaveToNote: true,
    },
    availability: { enabled: true },
  }),
  tool({
    id: "knowledge_audit",
    phase: "launch",
    executionMode: "ai_skill",
    billingMedium: "points",
    input: {
      kind: "resources",
      minItems: 2,
      maxItems: 20,
      resourceTypes: TOOLBOX_RESOURCE_TYPES,
    },
    output: {
      artifactType: "knowledge_audit",
      contentType: "markdown",
      canSaveToNote: true,
    },
    availability: { enabled: true },
  }),
  tool({
    id: "pdf_organizer",
    phase: "launch",
    executionMode: "browser",
    billingMedium: "free",
    input: {
      kind: "local_files",
      minItems: 1,
      maxItems: 30,
      accept: ["application/pdf", "image/jpeg", "image/png", "image/webp"],
      maxBytes: 100 * 1024 * 1024,
    },
    output: {
      artifactType: null,
      contentType: "application/octet-stream",
      canSaveToNote: false,
    },
    availability: { enabled: true },
  }),
  tool({
    id: "image_optimizer",
    phase: "launch",
    executionMode: "browser",
    billingMedium: "free",
    input: {
      kind: "local_files",
      minItems: 1,
      maxItems: 20,
      accept: ["image/jpeg", "image/png", "image/webp"],
      maxBytes: 80 * 1024 * 1024,
    },
    output: {
      artifactType: null,
      contentType: "image/*",
      canSaveToNote: false,
    },
    availability: { enabled: true },
  }),
  tool({
    id: "image_to_pdf",
    phase: "launch",
    executionMode: "browser",
    billingMedium: "free",
    input: {
      kind: "local_files",
      minItems: 1,
      maxItems: 30,
      accept: ["image/jpeg", "image/png", "image/webp"],
      maxBytes: 100 * 1024 * 1024,
    },
    output: {
      artifactType: null,
      contentType: "application/pdf",
      canSaveToNote: false,
    },
    // 历史深链兼容 ID；公开入口已合并到 pdf_organizer 的 PDF 工作台。
    availability: { enabled: false },
  }),
  tool({
    id: "pdf_to_images",
    phase: "launch",
    executionMode: "browser",
    billingMedium: "free",
    input: {
      kind: "local_files",
      minItems: 1,
      maxItems: 4,
      accept: ["application/pdf"],
      maxBytes: 80 * 1024 * 1024,
    },
    output: {
      artifactType: null,
      contentType: "image/*",
      canSaveToNote: false,
    },
    availability: { enabled: false },
  }),
  tool({
    id: "markdown_converter",
    phase: "launch",
    executionMode: "browser",
    billingMedium: "free",
    input: {
      kind: "local_text",
      minItems: 1,
      maxItems: 1,
      maxChars: 500_000,
    },
    output: {
      artifactType: null,
      contentType: "text/*",
      canSaveToNote: false,
    },
    availability: { enabled: false },
  }),
  tool({
    id: "text_diff",
    phase: "launch",
    executionMode: "browser",
    billingMedium: "free",
    input: {
      kind: "local_text",
      minItems: 2,
      maxItems: 2,
      maxChars: 300_000,
    },
    output: {
      artifactType: null,
      contentType: "text/plain",
      canSaveToNote: false,
    },
    availability: { enabled: true },
  }),
  tool({
    id: "table_converter",
    phase: "launch",
    executionMode: "browser",
    billingMedium: "free",
    input: {
      kind: "local_text",
      minItems: 1,
      maxItems: 1,
      maxChars: 1_000_000,
    },
    output: {
      artifactType: null,
      contentType: "text/*",
      canSaveToNote: false,
    },
    availability: { enabled: true },
  }),
  tool({
    id: "mermaid_editor",
    phase: "launch",
    executionMode: "browser",
    billingMedium: "free",
    input: {
      kind: "local_text",
      minItems: 1,
      maxItems: 1,
      maxChars: 100_000,
    },
    output: {
      artifactType: null,
      contentType: "image/svg+xml",
      canSaveToNote: false,
    },
    availability: { enabled: false },
  }),
  tool({
    id: "data_workbench",
    phase: "launch",
    executionMode: "browser",
    billingMedium: "free",
    input: {
      kind: "local_files",
      minItems: 1,
      maxItems: 2,
      accept: [
        "text/csv",
        "text/tab-separated-values",
        "application/json",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      ],
      maxBytes: 30 * 1024 * 1024,
    },
    output: {
      artifactType: null,
      contentType: "application/octet-stream",
      canSaveToNote: false,
    },
    availability: { enabled: true },
  }),
  tool({
    id: "data_quality_report",
    phase: "launch",
    executionMode: "browser",
    billingMedium: "free",
    input: {
      kind: "local_files",
      minItems: 1,
      maxItems: 1,
      accept: [
        "text/csv",
        "text/tab-separated-values",
        "application/json",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      ],
      maxBytes: 20 * 1024 * 1024,
    },
    output: {
      artifactType: null,
      contentType: "application/json",
      canSaveToNote: false,
    },
    // 历史深链兼容 ID；公开入口已合并到 data_workbench。
    availability: { enabled: false },
  }),
  tool({
    id: "data_cleaner",
    phase: "launch",
    executionMode: "browser",
    billingMedium: "free",
    input: {
      kind: "local_files",
      minItems: 1,
      maxItems: 1,
      accept: [
        "text/csv",
        "text/tab-separated-values",
        "application/json",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      ],
      maxBytes: 20 * 1024 * 1024,
    },
    output: {
      artifactType: null,
      contentType: "text/csv",
      canSaveToNote: false,
    },
    // 历史深链兼容 ID；公开入口已合并到 data_workbench。
    availability: { enabled: false },
  }),
  tool({
    id: "data_validator",
    phase: "launch",
    executionMode: "browser",
    billingMedium: "free",
    input: {
      kind: "local_files",
      minItems: 1,
      maxItems: 1,
      accept: [
        "text/csv",
        "text/tab-separated-values",
        "application/json",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      ],
      maxBytes: 20 * 1024 * 1024,
    },
    output: {
      artifactType: null,
      contentType: "application/json",
      canSaveToNote: false,
    },
    availability: { enabled: false },
  }),
  tool({
    id: "pivot_analysis",
    phase: "launch",
    executionMode: "browser",
    billingMedium: "free",
    input: {
      kind: "local_files",
      minItems: 1,
      maxItems: 1,
      accept: [
        "text/csv",
        "text/tab-separated-values",
        "application/json",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      ],
      maxBytes: 20 * 1024 * 1024,
    },
    output: {
      artifactType: null,
      contentType: "text/csv",
      canSaveToNote: false,
    },
    availability: { enabled: false },
  }),
  tool({
    id: "table_diff",
    phase: "launch",
    executionMode: "browser",
    billingMedium: "free",
    input: {
      kind: "local_files",
      minItems: 2,
      maxItems: 2,
      accept: [
        "text/csv",
        "text/tab-separated-values",
        "application/json",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      ],
      maxBytes: 30 * 1024 * 1024,
    },
    output: {
      artifactType: null,
      contentType: "application/json",
      canSaveToNote: false,
    },
    // 历史深链兼容 ID；公开入口已合并到 data_workbench。
    availability: { enabled: false },
  }),
  tool({
    id: "table_merge_split",
    phase: "launch",
    executionMode: "browser",
    billingMedium: "free",
    input: {
      kind: "local_files",
      minItems: 1,
      maxItems: 2,
      accept: [
        "text/csv",
        "text/tab-separated-values",
        "application/json",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      ],
      maxBytes: 30 * 1024 * 1024,
    },
    output: {
      artifactType: null,
      contentType: "text/csv",
      canSaveToNote: false,
    },
    availability: { enabled: false },
  }),
  tool({
    id: "data_anonymizer",
    phase: "launch",
    executionMode: "browser",
    billingMedium: "free",
    input: {
      kind: "local_files",
      minItems: 1,
      maxItems: 1,
      accept: [
        "text/csv",
        "text/tab-separated-values",
        "application/json",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      ],
      maxBytes: 20 * 1024 * 1024,
    },
    output: {
      artifactType: null,
      contentType: "text/csv",
      canSaveToNote: false,
    },
    // 历史深链兼容 ID；公开入口已合并到 data_workbench。
    availability: { enabled: false },
  }),
  tool({
    id: "data_chart",
    phase: "launch",
    executionMode: "browser",
    billingMedium: "free",
    input: {
      kind: "local_files",
      minItems: 1,
      maxItems: 1,
      accept: [
        "text/csv",
        "text/tab-separated-values",
        "application/json",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      ],
      maxBytes: 20 * 1024 * 1024,
    },
    output: {
      artifactType: null,
      contentType: "image/png",
      canSaveToNote: false,
    },
    availability: { enabled: false },
  }),
  tool({
    id: "text_batch",
    phase: "launch",
    executionMode: "browser",
    billingMedium: "free",
    input: {
      kind: "local_text",
      minItems: 1,
      maxItems: 1,
      maxChars: 1_000_000,
    },
    output: {
      artifactType: null,
      contentType: "text/plain",
      canSaveToNote: false,
    },
    availability: { enabled: true },
  }),
  tool({
    id: "regex_extractor",
    phase: "launch",
    executionMode: "browser",
    billingMedium: "free",
    input: {
      kind: "local_text",
      minItems: 1,
      maxItems: 1,
      maxChars: 1_000_000,
    },
    output: {
      artifactType: null,
      contentType: "text/plain",
      canSaveToNote: false,
    },
    availability: { enabled: false },
  }),
  tool({
    id: "pdf_text_extractor",
    phase: "launch",
    executionMode: "browser",
    billingMedium: "free",
    input: {
      kind: "local_files",
      minItems: 1,
      maxItems: 4,
      accept: ["application/pdf"],
      maxBytes: 80 * 1024 * 1024,
    },
    output: {
      artifactType: null,
      contentType: "text/plain",
      canSaveToNote: false,
    },
    // 历史深链兼容 ID；公开入口已合并到 pdf_organizer 的 PDF 工作台。
    availability: { enabled: false },
  }),
  tool({
    id: "markdown_checker",
    phase: "launch",
    executionMode: "browser",
    billingMedium: "free",
    input: {
      kind: "local_files",
      minItems: 1,
      maxItems: 50,
      accept: ["text/markdown", "text/plain"],
      maxBytes: 20 * 1024 * 1024,
    },
    output: {
      artifactType: null,
      contentType: "application/json",
      canSaveToNote: false,
    },
    availability: { enabled: true },
  }),
  tool({
    id: "frontmatter_batch",
    phase: "launch",
    executionMode: "browser",
    billingMedium: "free",
    input: {
      kind: "local_files",
      minItems: 1,
      maxItems: 100,
      accept: ["text/markdown", "text/plain"],
      maxBytes: 40 * 1024 * 1024,
    },
    output: {
      artifactType: null,
      contentType: "application/zip",
      canSaveToNote: false,
    },
    availability: { enabled: false },
  }),
  tool({
    id: "citation_converter",
    phase: "launch",
    executionMode: "browser",
    billingMedium: "free",
    input: { kind: "local_text", minItems: 1, maxItems: 1, maxChars: 500_000 },
    output: {
      artifactType: null,
      contentType: "text/plain",
      canSaveToNote: false,
    },
    availability: { enabled: false },
  }),
  tool({
    id: "browser_sql",
    phase: "launch",
    executionMode: "browser",
    billingMedium: "free",
    input: {
      kind: "local_files",
      minItems: 1,
      maxItems: 4,
      accept: [
        "text/csv",
        "application/json",
        "application/vnd.apache.parquet",
      ],
      maxBytes: 80 * 1024 * 1024,
    },
    output: {
      artifactType: null,
      contentType: "text/csv",
      canSaveToNote: false,
    },
    availability: { enabled: false },
  }),
  tool({
    id: "structured_data_lab",
    phase: "launch",
    executionMode: "browser",
    billingMedium: "free",
    input: {
      kind: "local_text",
      minItems: 1,
      maxItems: 1,
      maxChars: 1_000_000,
    },
    output: {
      artifactType: null,
      contentType: "application/json",
      canSaveToNote: false,
    },
    availability: { enabled: false },
  }),
  tool({
    id: "docx_to_markdown",
    phase: "launch",
    executionMode: "browser",
    billingMedium: "free",
    input: {
      kind: "local_files",
      minItems: 1,
      maxItems: 5,
      accept: [
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      ],
      maxBytes: 50 * 1024 * 1024,
    },
    output: {
      artifactType: null,
      contentType: "text/markdown",
      canSaveToNote: false,
    },
    availability: { enabled: true },
  }),
  tool({
    id: "code_snapshot",
    phase: "launch",
    executionMode: "browser",
    billingMedium: "free",
    input: { kind: "local_text", minItems: 1, maxItems: 1, maxChars: 200_000 },
    output: {
      artifactType: null,
      contentType: "image/png",
      canSaveToNote: false,
    },
    availability: { enabled: false },
  }),
  tool({
    id: "knowledge_structure_audit",
    phase: "launch",
    executionMode: "service",
    billingMedium: "free",
    input: { kind: "account", minItems: 1, maxItems: 1 },
    output: {
      artifactType: null,
      contentType: "application/json",
      canSaveToNote: false,
    },
    availability: { enabled: true },
  }),
  tool({
    id: "directory_index",
    phase: "launch",
    executionMode: "service",
    billingMedium: "free",
    input: { kind: "account", minItems: 1, maxItems: 1 },
    output: {
      artifactType: null,
      contentType: "text/markdown",
      canSaveToNote: false,
    },
    availability: { enabled: false },
  }),
  tool({
    id: "ocr_to_text",
    phase: "next",
    executionMode: "worker",
    billingMedium: "points",
    input: {
      kind: "documents",
      minItems: 1,
      maxItems: 5,
      resourceTypes: ["file"],
      accept: ["application/pdf", "image/jpeg", "image/png", "image/webp"],
      maxBytes: 20 * 1024 * 1024,
    },
    output: {
      artifactType: "ocr_text",
      contentType: "markdown",
      canSaveToNote: true,
    },
    availability: { enabled: true },
  }),
]);

const toolById = new Map(TOOLBOX_TOOL_CATALOG.map((item) => [item.id, item]));

export function getToolboxTool(toolId) {
  return toolById.get(String(toolId || "")) || null;
}

export function isToolboxTerminalStatus(status) {
  return [
    "succeeded",
    "partial_succeeded",
    "failed",
    "cancelled",
    "expired",
  ].includes(String(status || ""));
}

export function isToolboxPaidTool(toolId) {
  return getToolboxTool(toolId)?.billingMedium === "points";
}
