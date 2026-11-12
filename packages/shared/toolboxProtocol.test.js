import { describe, expect, it } from "vitest";
import {
  getToolboxTool,
  isToolboxPaidTool,
  isToolboxTerminalStatus,
  TOOLBOX_JOB_STATUSES,
  TOOLBOX_BILLING_MEDIA,
  TOOLBOX_PROCESSING_REQUIREMENT_MAX_CHARS,
  TOOLBOX_TOOL_INTENTS,
  TOOLBOX_TOOL_CATALOG,
} from "./toolboxProtocol.js";

const ACTIVE_TOOL_IDS = [
  "translation",
  "forms",
  "research_workspace",
  "learning_workspace",
  "writing_workspace",
  "material_to_note",
  "study_kit",
  "pdf_organizer",
  "ocr_to_text",
];
// 已下架但有历史成果的 AI 工具：保留协议身份与名称，只用于展示历史任务。
const RETIRED_AI_TOOL_IDS = [
  "idea_to_draft",
  "research_brief",
  "concept_map",
  "source_comparison",
  "knowledge_audit",
];

describe("toolbox protocol", () => {
  it("keeps the toolbox processing requirement boundary in the shared protocol", () => {
    expect(TOOLBOX_PROCESSING_REQUIREMENT_MAX_CHARS).toBe(1000);
    expect(Object.keys(TOOLBOX_TOOL_INTENTS)).toEqual(["material_to_note", "study_kit"]);
    expect(TOOLBOX_TOOL_INTENTS.study_kit).toEqual([
      "understand",
      "memorize",
      "practice",
    ]);
    expect(Object.isFrozen(TOOLBOX_TOOL_INTENTS.study_kit)).toBe(true);
  });

  it("keeps every tool id unique and every execution contract explicit", () => {
    expect(TOOLBOX_TOOL_CATALOG).toHaveLength(17);
    expect(new Set(TOOLBOX_TOOL_CATALOG.map((item) => item.id)).size).toBe(
      TOOLBOX_TOOL_CATALOG.length,
    );
    for (const item of TOOLBOX_TOOL_CATALOG) {
      if (item.input.kind === "prompt") {
        expect(item.input.minItems).toBe(0);
        expect(item.input.maxItems).toBe(0);
      } else if (item.input.kind === "translation") {
        expect(item.input.maxChars).toBe(30000);
        expect(item.billingMedia).toEqual(["ai_quota"]);
      } else {
        expect(item.input.minItems).toBeGreaterThan(0);
      }
      expect(item.input.maxItems).toBeGreaterThanOrEqual(item.input.minItems);
      expect(item.output.contentType).toBeTruthy();
      expect(Object.isFrozen(item)).toBe(true);
      expect(Object.isFrozen(item.input)).toBe(true);
      expect(Object.isFrozen(item.availability)).toBe(true);
      expect(Object.isFrozen(item.billingMedia)).toBe(true);
      if (item.input.accept)
        expect(Object.isFrozen(item.input.accept)).toBe(true);
      if (item.input.resourceTypes)
        expect(Object.isFrozen(item.input.resourceTypes)).toBe(true);
    }
  });

  it("exposes only the focused knowledge workflows and drops retired standalone tools", () => {
    expect(
      TOOLBOX_TOOL_CATALOG.filter((item) => item.availability.enabled).map(
        (item) => item.id,
      ),
    ).toEqual(ACTIVE_TOOL_IDS);
    for (const retiredId of [
      "directory_index",
      "browser_sql",
      "action_plan",
      "mermaid_editor",
      "text_diff",
      "data_workbench",
      "data_chart",
      "table_converter",
      "image_optimizer",
      "docx_to_markdown",
      "knowledge_structure_audit",
    ]) {
      expect(getToolboxTool(retiredId)).toBeNull();
    }
    for (const retiredId of RETIRED_AI_TOOL_IDS) {
      expect(getToolboxTool(retiredId)?.availability.enabled).toBe(false);
    }
    expect(getToolboxTool("image_to_pdf")?.availability.enabled).toBe(false);
    expect(getToolboxTool("pdf_to_images")?.availability.enabled).toBe(false);
    expect(getToolboxTool("pdf_text_extractor")?.availability.enabled).toBe(
      false,
    );
    expect(ACTIVE_TOOL_IDS).toHaveLength(9);
  });

  it("does not treat browser-local utilities as paid jobs", () => {
    expect(TOOLBOX_BILLING_MEDIA).toEqual(["free", "points", "ai_quota"]);
    const localTools = TOOLBOX_TOOL_CATALOG.filter(
      (item) => item.executionMode === "browser",
    );
    expect(localTools).toHaveLength(4);
    expect(localTools.every((item) => item.billingMedium === "free")).toBe(
      true,
    );
    expect(isToolboxPaidTool("pdf_organizer")).toBe(false);
    expect(
      TOOLBOX_TOOL_CATALOG.filter((item) => item.executionMode === "service"),
    ).toHaveLength(4);
    expect(isToolboxPaidTool("research_workspace")).toBe(false);
    expect(isToolboxPaidTool("translation")).toBe(true);
    expect(isToolboxPaidTool("material_to_note")).toBe(true);
    expect(isToolboxPaidTool("study_kit")).toBe(true);
    expect(getToolboxTool("study_kit")?.billingMedia).toEqual([
      "points",
      "ai_quota",
    ]);
    expect(getToolboxTool("ocr_to_text")?.billingMedia).toEqual(["ai_quota", "points", "free"]);
    // 历史概念图谱成果仍可保存为笔记，依赖协议中保留的成果定义。
    expect(getToolboxTool("concept_map")?.output.canSaveToNote).toBe(true);
  });

  it("recognizes terminal task states", () => {
    expect(TOOLBOX_JOB_STATUSES).toContain("partial_succeeded");
    expect(isToolboxTerminalStatus("partial_succeeded")).toBe(true);
    expect(isToolboxTerminalStatus("processing")).toBe(false);
    expect(getToolboxTool("missing")).toBeNull();
  });
});
