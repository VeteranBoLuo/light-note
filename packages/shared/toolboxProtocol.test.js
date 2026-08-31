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
  "research_workspace",
  "learning_workspace",
  "writing_workspace",
  "idea_to_draft",
  "material_to_note",
  "research_brief",
  "study_kit",
  "concept_map",
  "source_comparison",
  "knowledge_audit",
  "pdf_organizer",
  "image_optimizer",
  "text_diff",
  "table_converter",
  "data_workbench",
  "text_batch",
  "markdown_checker",
  "docx_to_markdown",
  "knowledge_structure_audit",
  "ocr_to_text",
];

describe("toolbox protocol", () => {
  it("keeps the toolbox processing requirement boundary in the shared protocol", () => {
    expect(TOOLBOX_PROCESSING_REQUIREMENT_MAX_CHARS).toBe(1000);
    expect(TOOLBOX_TOOL_INTENTS.research_brief).toEqual([
      "decision",
      "landscape",
      "verify",
    ]);
    expect(Object.isFrozen(TOOLBOX_TOOL_INTENTS.research_brief)).toBe(true);
  });

  it("keeps every tool id unique and every execution contract explicit", () => {
    expect(TOOLBOX_TOOL_CATALOG).toHaveLength(41);
    expect(new Set(TOOLBOX_TOOL_CATALOG.map((item) => item.id)).size).toBe(
      TOOLBOX_TOOL_CATALOG.length,
    );
    for (const item of TOOLBOX_TOOL_CATALOG) {
      if (item.input.kind === "prompt") {
        expect(item.input.minItems).toBe(0);
        expect(item.input.maxItems).toBe(0);
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

  it("exposes only the focused knowledge workflows while retaining disabled ids for compatibility", () => {
    expect(
      TOOLBOX_TOOL_CATALOG.filter((item) => item.availability.enabled).map(
        (item) => item.id,
      ),
    ).toEqual(ACTIVE_TOOL_IDS);
    expect(getToolboxTool("directory_index")?.availability.enabled).toBe(false);
    expect(getToolboxTool("browser_sql")?.availability.enabled).toBe(false);
    expect(getToolboxTool("action_plan")?.availability.enabled).toBe(false);
    expect(getToolboxTool("image_to_pdf")?.availability.enabled).toBe(false);
    expect(getToolboxTool("pdf_to_images")?.availability.enabled).toBe(false);
    expect(getToolboxTool("pdf_text_extractor")?.availability.enabled).toBe(
      false,
    );
    for (const legacyId of [
      "data_quality_report",
      "data_cleaner",
      "data_validator",
      "pivot_analysis",
      "table_diff",
      "table_merge_split",
      "data_anonymizer",
      "data_chart",
    ]) {
      expect(getToolboxTool(legacyId)?.availability.enabled).toBe(false);
    }
    expect(getToolboxTool("data_workbench")).toMatchObject({
      availability: { enabled: true },
      input: { minItems: 1, maxItems: 2, maxBytes: 30 * 1024 * 1024 },
    });
    expect(ACTIVE_TOOL_IDS).toHaveLength(20);
  });

  it("does not treat browser-local utilities as paid jobs", () => {
    expect(TOOLBOX_BILLING_MEDIA).toEqual(["free", "points", "ai_quota"]);
    const localTools = TOOLBOX_TOOL_CATALOG.filter(
      (item) => item.executionMode === "browser",
    );
    expect(localTools).toHaveLength(27);
    expect(localTools.every((item) => item.billingMedium === "free")).toBe(
      true,
    );
    expect(isToolboxPaidTool("pdf_organizer")).toBe(false);
    expect(isToolboxPaidTool("mermaid_editor")).toBe(false);
    expect(isToolboxPaidTool("data_workbench")).toBe(false);
    expect(isToolboxPaidTool("browser_sql")).toBe(false);
    expect(
      TOOLBOX_TOOL_CATALOG.filter((item) => item.executionMode === "service"),
    ).toHaveLength(5);
    expect(isToolboxPaidTool("research_workspace")).toBe(false);
    expect(isToolboxPaidTool("knowledge_structure_audit")).toBe(false);
    expect(isToolboxPaidTool("research_brief")).toBe(true);
    expect(isToolboxPaidTool("idea_to_draft")).toBe(true);
    expect(getToolboxTool("idea_to_draft")?.billingMedia).toEqual([
      "points",
      "ai_quota",
    ]);
    expect(getToolboxTool("ocr_to_text")?.billingMedia).toEqual(["points"]);
    expect(getToolboxTool("idea_to_draft")?.input).toMatchObject({
      kind: "prompt",
      minItems: 0,
      maxItems: 0,
    });
    expect(isToolboxPaidTool("study_kit")).toBe(true);
    expect(getToolboxTool("concept_map")?.output.canSaveToNote).toBe(true);
  });

  it("recognizes terminal task states", () => {
    expect(TOOLBOX_JOB_STATUSES).toContain("partial_succeeded");
    expect(isToolboxTerminalStatus("partial_succeeded")).toBe(true);
    expect(isToolboxTerminalStatus("processing")).toBe(false);
    expect(getToolboxTool("missing")).toBeNull();
  });
});
