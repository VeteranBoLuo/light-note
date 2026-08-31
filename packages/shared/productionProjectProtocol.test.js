import { describe, expect, it } from "vitest";
import {
  PRODUCTION_PROJECT_CONFLICT_CODES,
  PRODUCTION_PROJECT_CONTENT_SCHEMAS,
  PRODUCTION_PROJECT_LOCK_SEMANTICS,
  PRODUCTION_WORKBOOK_MAX_COLUMNS,
  PRODUCTION_WORKBOOK_MAX_ROWS,
  ProductionProjectProtocolError,
  createEmptyProductionProjectContent,
  normalizeProductionProjectContent,
  normalizeProductionProjectCreateRequest,
  normalizeProductionProjectRevisionRequest,
  normalizeProductionProjectRestoreRequest,
  normalizeProductionProjectUpdateRequest,
  toProductionProjectDto,
  toProductionProjectRevisionDto,
  validateProductionProjectContent,
} from "./productionProjectProtocol.js";

describe("production project protocol", () => {
  it("freezes the independent project/revision optimistic lock contract", () => {
    expect(PRODUCTION_PROJECT_CONTENT_SCHEMAS).toEqual({
      document: "document/v1",
      presentation: "presentation/v1",
      workbook: "workbook/v1",
    });
    expect(PRODUCTION_PROJECT_LOCK_SEMANTICS).toEqual({
      projectVersionField: "version",
      revisionHeadField: "currentRevision",
      expectedProjectVersionField: "expectedVersion",
      expectedRevisionField: "expectedRevision",
      revisionContentImmutable: true,
      revisionInsertIncrementsProjectVersion: true,
    });
    expect(PRODUCTION_PROJECT_CONFLICT_CODES.REVISION).toBe(
      "PRODUCTION_PROJECT_REVISION_CONFLICT",
    );
    expect(Object.isFrozen(PRODUCTION_PROJECT_LOCK_SEMANTICS)).toBe(true);
  });

  it("normalizes a strict document/v1 and keeps an explicit extension slot", () => {
    const content = normalizeProductionProjectContent(
      {
        type: "document",
        schemaVersion: 1,
        body: { format: "markdown", value: "# Proposal" },
        page: { size: "a4", orientation: "portrait" },
        extensions: { "lightnote.sources": ["resource-1"] },
      },
      "document",
    );
    expect(content).toEqual({
      type: "document",
      schemaVersion: 1,
      body: { format: "markdown", value: "# Proposal" },
      page: { size: "a4", orientation: "portrait" },
      extensions: { "lightnote.sources": ["resource-1"] },
    });
    expect(Object.isFrozen(content.body)).toBe(true);
    expect(() =>
      normalizeProductionProjectContent(
        { ...content, unknown: true },
        "document",
      ),
    ).toThrowError(/unsupported field/u);
    expect(
      validateProductionProjectContent(
        { ...content, type: "presentation" },
        "document",
      ),
    ).toBe(false);
  });

  it("normalizes presentation/v1 and rejects duplicate slide ids", () => {
    const content = normalizeProductionProjectContent(
      {
        type: "presentation",
        schemaVersion: 1,
        canvas: { aspectRatio: "16:9" },
        theme: { name: "Light", accent: "#615ced", background: "#ffffff" },
        slides: [
          {
            id: "slide-1",
            title: "Opening",
            body: { format: "markdown", value: "# Hello" },
            notes: "Speaker note",
            layout: "title",
            elements: [
              {
                id: "element-1",
                type: "shape",
                x: 10,
                y: 20,
                width: 30,
                height: 20,
                rotation: 0,
                shape: "rounded_rectangle",
                fill: "#e9e7ff",
                stroke: "#615ced",
                strokeWidth: 2,
                text: "Milestone",
                color: "#20232d",
                fontSize: 22,
              },
            ],
          },
        ],
      },
      "presentation",
    );
    expect(content.slides[0].extensions).toEqual({});
    expect(content.slides[0].elements[0]).toMatchObject({
      type: "shape",
      shape: "rounded_rectangle",
      text: "Milestone",
    });
    expect(() =>
      normalizeProductionProjectContent(
        {
          ...content,
          slides: [content.slides[0], content.slides[0]],
        },
        "presentation",
      ),
    ).toThrowError(/slide ids must be unique/u);
  });

  it("normalizes workbook/v1 sparse A1 cells and rejects invalid addresses", () => {
    const content = normalizeProductionProjectContent(
      {
        type: "workbook",
        schemaVersion: 1,
        sheets: [
          {
            id: "sheet-1",
            name: "Budget",
            cells: {
              A1: { value: "Hosting" },
              B1: {
                value: 18,
                formula: "=SUM(B2:B3)",
                style: { bold: true, numberFormat: "currency", align: "right" },
              },
            },
          },
        ],
        activeSheetId: "sheet-1",
      },
      "workbook",
    );
    expect(content.sheets[0].cells.B1).toEqual({
      value: 18,
      formula: "=SUM(B2:B3)",
      style: { bold: true, numberFormat: "currency", align: "right" },
    });
    expect(() =>
      normalizeProductionProjectContent(
        {
          ...content,
          sheets: [
            {
              ...content.sheets[0],
              cells: { bad: { value: "x" } },
            },
          ],
        },
        "workbook",
      ),
    ).toThrowError(/invalid A1 address/u);
  });

  it("uses the real Excel XFD1048576 workbook boundary", () => {
    expect(PRODUCTION_WORKBOOK_MAX_COLUMNS).toBe(16_384);
    expect(PRODUCTION_WORKBOOK_MAX_ROWS).toBe(1_048_576);
    expect(
      validateProductionProjectContent(
        {
          type: "workbook",
          schemaVersion: 1,
          sheets: [
            {
              id: "sheet-1",
              name: "Boundary",
              cells: { XFD1048576: { value: "last" } },
            },
          ],
          activeSheetId: "sheet-1",
        },
        "workbook",
      ),
    ).toBe(true);
    for (const address of ["XFE1", "A1048577", "ZZZ999999"]) {
      expect(() =>
        normalizeProductionProjectContent(
          {
            type: "workbook",
            schemaVersion: 1,
            sheets: [
              {
                id: "sheet-1",
                name: "Boundary",
                cells: { [address]: { value: "outside" } },
              },
            ],
            activeSheetId: "sheet-1",
          },
          "workbook",
        ),
      ).toThrowError(/invalid A1 address/u);
    }
  });

  it("creates canonical empty content for all project types", () => {
    expect(createEmptyProductionProjectContent("document")).toMatchObject({
      type: "document",
      schemaVersion: 1,
    });
    expect(createEmptyProductionProjectContent("presentation").slides).toEqual(
      [],
    );
    expect(createEmptyProductionProjectContent("workbook").sheets).toEqual([]);
  });

  it("keeps mutable project metadata separate from immutable revision content", () => {
    const project = toProductionProjectDto({
      id: "project-1",
      project_type: "document",
      title: "Proposal",
      metadata_json: JSON.stringify({ tags: ["work"] }),
      status: "active",
      version: 4,
      current_revision: 3,
      current_revision_id: "revision-3",
      last_opened_at: "2026-08-30T01:30:00.000Z",
      create_time: "2026-08-30T01:00:00.000Z",
      updated_at: "2026-08-30T02:00:00.000Z",
      content_json: { ignored: true },
    });
    const revision = toProductionProjectRevisionDto({
      id: "revision-3",
      project_id: "project-1",
      project_type: "document",
      revision_no: 3,
      change_kind: "named",
      label: "Ready for review",
      content_json: JSON.stringify(
        createEmptyProductionProjectContent("document"),
      ),
      source_revision_id: null,
      create_time: "2026-08-30T02:00:00.000Z",
      title: "must not leak",
    });
    expect(project).not.toHaveProperty("content");
    expect(project.metadata.tags).toEqual(["work"]);
    expect(project.lastOpenedAt).toBe("2026-08-30T01:30:00.000Z");
    expect(revision).not.toHaveProperty("title");
    expect(Object.isFrozen(revision.content)).toBe(true);
  });

  it("fails closed when mysql2 JSON columns contain malformed strings", () => {
    expect(() =>
      toProductionProjectDto({
        id: "project-1",
        project_type: "document",
        title: "Proposal",
        metadata_json: "{broken",
        status: "active",
        version: 1,
        current_revision: 1,
        current_revision_id: "revision-1",
      }),
    ).toThrowError(/invalid JSON/u);
    expect(() =>
      toProductionProjectRevisionDto({
        id: "revision-1",
        project_id: "project-1",
        project_type: "document",
        revision_no: 1,
        change_kind: "create",
        content_json: "[]",
      }),
    ).toThrow(ProductionProjectProtocolError);
  });

  it("normalizes create, metadata update, revision and restore API DTOs", () => {
    const empty = createEmptyProductionProjectContent("document");
    expect(
      normalizeProductionProjectCreateRequest({
        clientRequestId: "create:12345678",
        projectType: "document",
        title: " New document ",
        content: empty,
      }),
    ).toMatchObject({ title: "New document", changeKind: "create" });
    expect(
      normalizeProductionProjectUpdateRequest({
        expectedVersion: 1,
        status: "archived",
      }),
    ).toEqual({ expectedVersion: 1, status: "archived" });
    expect(
      normalizeProductionProjectRevisionRequest(
        {
          clientRequestId: "revision:12345678",
          expectedVersion: 2,
          expectedRevision: 1,
          changeKind: "autosave",
          content: empty,
        },
        "document",
      ),
    ).toMatchObject({ expectedVersion: 2, expectedRevision: 1 });
    expect(
      normalizeProductionProjectRestoreRequest({
        clientRequestId: "restore:12345678",
        expectedVersion: 3,
        expectedRevision: 2,
        sourceRevisionId: "revision-1",
      }),
    ).toMatchObject({ changeKind: "restore", sourceRevisionId: "revision-1" });
  });

  it("rejects missing CAS fields, invalid request kinds and unknown fields", () => {
    const empty = createEmptyProductionProjectContent("document");
    expect(() =>
      normalizeProductionProjectRevisionRequest(
        {
          clientRequestId: "revision:12345678",
          expectedVersion: 1,
          changeKind: "named",
          content: empty,
        },
        "document",
      ),
    ).toThrow(ProductionProjectProtocolError);
    expect(() =>
      normalizeProductionProjectRevisionRequest(
        {
          clientRequestId: "revision:12345678",
          expectedVersion: 1,
          expectedRevision: 1,
          changeKind: "restore",
          content: empty,
        },
        "document",
      ),
    ).toThrowError(/changeKind is invalid/u);
    expect(() =>
      normalizeProductionProjectUpdateRequest({
        expectedVersion: 1,
        content: empty,
      }),
    ).toThrowError(/unsupported field/u);
  });
});
