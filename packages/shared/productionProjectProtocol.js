/**
 * 轻笺生产项目共享协议。
 *
 * Project 只保存可变标题、元数据和当前修订指针；正文只存在于不可变 Revision 中。
 * `version` 是项目整体 CAS 序号，`currentRevision` 是正文头序号。创建新修订必须同时
 * 提交 expectedVersion 与 expectedRevision，成功后两者各递增 1。
 */
export const PRODUCTION_PROJECT_PROTOCOL_VERSION = 1;
export const PRODUCTION_PROJECT_SEQUENCE_START = 1;
export const PRODUCTION_PROJECT_TITLE_MAX_CHARS = 200;
export const PRODUCTION_PROJECT_DESCRIPTION_MAX_CHARS = 2_000;
export const PRODUCTION_PROJECT_CONTENT_MAX_BYTES = 5 * 1024 * 1024;
export const PRODUCTION_PROJECT_BODY_MAX_CHARS = 2_000_000;
export const PRODUCTION_PROJECT_EXTENSION_MAX_BYTES = 64 * 1024;
export const PRODUCTION_PROJECT_CLIENT_REQUEST_ID_MIN_CHARS = 8;
export const PRODUCTION_PROJECT_CLIENT_REQUEST_ID_MAX_CHARS = 128;
export const PRODUCTION_WORKBOOK_MAX_ROWS = 1_048_576;
export const PRODUCTION_WORKBOOK_MAX_COLUMNS = 16_384;

export const PRODUCTION_PROJECT_TYPES = Object.freeze([
  "document",
  "presentation",
  "workbook",
]);
export const PRODUCTION_PROJECT_STATUSES = Object.freeze([
  "active",
  "archived",
  "trashed",
]);
export const PRODUCTION_PROJECT_CHANGE_KINDS = Object.freeze([
  "create",
  "autosave",
  "named",
  "ai_apply",
  "import",
  "restore",
]);
export const PRODUCTION_PROJECT_CONTENT_SCHEMAS = Object.freeze({
  document: "document/v1",
  presentation: "presentation/v1",
  workbook: "workbook/v1",
});
export const PRODUCTION_PROJECT_CONFLICT_CODES = Object.freeze({
  VERSION: "PRODUCTION_PROJECT_VERSION_CONFLICT",
  REVISION: "PRODUCTION_PROJECT_REVISION_CONFLICT",
});
export const PRODUCTION_PROJECT_LOCK_SEMANTICS = Object.freeze({
  projectVersionField: "version",
  revisionHeadField: "currentRevision",
  expectedProjectVersionField: "expectedVersion",
  expectedRevisionField: "expectedRevision",
  revisionContentImmutable: true,
  revisionInsertIncrementsProjectVersion: true,
});

export const PRODUCTION_DOCUMENT_FORMATS = Object.freeze(["markdown", "html"]);
export const PRODUCTION_DOCUMENT_PAGE_SIZES = Object.freeze([
  "auto",
  "a4",
  "letter",
]);
export const PRODUCTION_DOCUMENT_ORIENTATIONS = Object.freeze([
  "portrait",
  "landscape",
]);
export const PRODUCTION_PRESENTATION_ASPECT_RATIOS = Object.freeze([
  "16:9",
  "4:3",
]);
export const PRODUCTION_PRESENTATION_LAYOUTS = Object.freeze([
  "title",
  "section",
  "content",
  "two_column",
  "blank",
]);
export const PRODUCTION_PRESENTATION_ELEMENT_TYPES = Object.freeze([
  "text",
  "shape",
  "image",
]);
export const PRODUCTION_PRESENTATION_SHAPES = Object.freeze([
  "rectangle",
  "rounded_rectangle",
  "ellipse",
  "triangle",
  "diamond",
  "line",
  "arrow",
]);
export const PRODUCTION_WORKBOOK_NUMBER_FORMATS = Object.freeze([
  "general",
  "number",
  "currency",
  "percent",
  "date",
]);

export const PRODUCTION_PROJECT_LIMITS = Object.freeze({
  maxTags: 20,
  maxTagChars: 50,
  maxSlides: 500,
  maxSlideTitleChars: 300,
  maxSlideNotesChars: 20_000,
  maxElementsPerSlide: 200,
  maxPresentationImageChars: 2_000_000,
  maxSheets: 100,
  maxSheetNameChars: 100,
  maxCellsPerSheet: 2_000_000,
  maxWorkbookRows: PRODUCTION_WORKBOOK_MAX_ROWS,
  maxWorkbookColumns: PRODUCTION_WORKBOOK_MAX_COLUMNS,
});

const TYPE_SET = new Set(PRODUCTION_PROJECT_TYPES);
const STATUS_SET = new Set(PRODUCTION_PROJECT_STATUSES);
const CHANGE_KIND_SET = new Set(PRODUCTION_PROJECT_CHANGE_KINDS);
const DOCUMENT_FORMAT_SET = new Set(PRODUCTION_DOCUMENT_FORMATS);
const PAGE_SIZE_SET = new Set(PRODUCTION_DOCUMENT_PAGE_SIZES);
const ORIENTATION_SET = new Set(PRODUCTION_DOCUMENT_ORIENTATIONS);
const ASPECT_RATIO_SET = new Set(PRODUCTION_PRESENTATION_ASPECT_RATIOS);
const PRESENTATION_LAYOUT_SET = new Set(PRODUCTION_PRESENTATION_LAYOUTS);
const PRESENTATION_ELEMENT_TYPE_SET = new Set(
  PRODUCTION_PRESENTATION_ELEMENT_TYPES,
);
const PRESENTATION_SHAPE_SET = new Set(PRODUCTION_PRESENTATION_SHAPES);
const WORKBOOK_NUMBER_FORMAT_SET = new Set(PRODUCTION_WORKBOOK_NUMBER_FORMATS);
const IDENTIFIER_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;
const CLIENT_REQUEST_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/u;
const LOCALE_PATTERN = /^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8}){0,2}$/u;
const COLOR_PATTERN = /^#[0-9a-f]{6}$/iu;
const WORKBOOK_CELL_KEY_PATTERN = /^([A-Z]{1,3})([1-9][0-9]{0,6})$/u;

export class ProductionProjectProtocolError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "ProductionProjectProtocolError";
    this.code = code;
    this.status = 400;
  }
}

function invalid(code, message) {
  throw new ProductionProjectProtocolError(code, message);
}

function isPlainObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function expectObject(value, field) {
  if (!isPlainObject(value))
    invalid("PRODUCTION_PROJECT_INVALID_OBJECT", `${field} must be an object`);
  return value;
}

function assertAllowedKeys(value, allowedKeys, field) {
  const allowed = new Set(allowedKeys);
  const unknown = Object.keys(value).find((key) => !allowed.has(key));
  if (unknown) {
    invalid(
      "PRODUCTION_PROJECT_UNKNOWN_FIELD",
      `${field} contains unsupported field ${unknown}`,
    );
  }
}

function byteLength(value) {
  if (typeof TextEncoder !== "undefined")
    return new TextEncoder().encode(value).byteLength;
  return unescape(encodeURIComponent(value)).length;
}

function boundedString(value, field, maxChars, { allowEmpty = true } = {}) {
  if (typeof value !== "string")
    invalid("PRODUCTION_PROJECT_INVALID_STRING", `${field} must be a string`);
  const normalized = value.trim();
  if ((!allowEmpty && !normalized) || normalized.length > maxChars) {
    invalid(
      "PRODUCTION_PROJECT_STRING_OUT_OF_RANGE",
      `${field} is empty or too long`,
    );
  }
  return normalized;
}

function bodyString(value, field) {
  if (
    typeof value !== "string" ||
    value.length > PRODUCTION_PROJECT_BODY_MAX_CHARS
  ) {
    invalid(
      "PRODUCTION_PROJECT_BODY_INVALID",
      `${field} is not a supported body`,
    );
  }
  return value;
}

function boundedNumber(value, field, minimum, maximum, fallback) {
  const normalized = value === undefined ? fallback : Number(value);
  if (
    !Number.isFinite(normalized) ||
    normalized < minimum ||
    normalized > maximum
  ) {
    invalid(
      "PRODUCTION_PROJECT_NUMBER_OUT_OF_RANGE",
      `${field} is outside the supported range`,
    );
  }
  return normalized;
}

function boundedInteger(value, field, minimum, maximum, fallback) {
  const normalized = boundedNumber(value, field, minimum, maximum, fallback);
  if (!Number.isSafeInteger(normalized)) {
    invalid(
      "PRODUCTION_PROJECT_NUMBER_OUT_OF_RANGE",
      `${field} must be an integer`,
    );
  }
  return normalized;
}

function normalizeOptionalColor(value, field, fallback = null) {
  if (value === undefined || value === null || value === "") return fallback;
  const normalized = String(value).toLowerCase();
  if (!COLOR_PATTERN.test(normalized)) {
    invalid("PRODUCTION_PROJECT_COLOR_INVALID", `${field} is invalid`);
  }
  return normalized;
}

function identifier(value, field) {
  const normalized = String(value || "").trim();
  if (!IDENTIFIER_PATTERN.test(normalized)) {
    invalid("PRODUCTION_PROJECT_IDENTIFIER_INVALID", `${field} is invalid`);
  }
  return normalized;
}

function positiveSequence(value, field) {
  const normalized = Number(value);
  if (
    !Number.isSafeInteger(normalized) ||
    normalized < PRODUCTION_PROJECT_SEQUENCE_START
  ) {
    invalid(
      "PRODUCTION_PROJECT_SEQUENCE_INVALID",
      `${field} must be a positive integer`,
    );
  }
  return normalized;
}

function nullableTimestamp(value, field) {
  if (value === null || value === undefined || value === "") return null;
  const normalized = String(value);
  if (!Number.isFinite(Date.parse(normalized))) {
    invalid("PRODUCTION_PROJECT_TIMESTAMP_INVALID", `${field} is invalid`);
  }
  return normalized;
}

function clientRequestId(value) {
  const normalized = String(value || "").trim();
  if (!CLIENT_REQUEST_ID_PATTERN.test(normalized)) {
    invalid(
      "PRODUCTION_PROJECT_CLIENT_REQUEST_ID_INVALID",
      "clientRequestId is invalid",
    );
  }
  return normalized;
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value))
    return value;
  Object.values(value).forEach(deepFreeze);
  return Object.freeze(value);
}

function normalizeJsonValue(value, field, depth = 0) {
  if (depth > 8)
    invalid(
      "PRODUCTION_PROJECT_EXTENSION_INVALID",
      `${field} is too deeply nested`,
    );
  if (value === null || typeof value === "string" || typeof value === "boolean")
    return value;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (Array.isArray(value)) {
    if (value.length > 2_000)
      invalid(
        "PRODUCTION_PROJECT_EXTENSION_INVALID",
        `${field} has too many items`,
      );
    return value.map((item, index) =>
      normalizeJsonValue(item, `${field}[${index}]`, depth + 1),
    );
  }
  if (isPlainObject(value)) {
    const output = {};
    for (const [key, item] of Object.entries(value)) {
      if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u.test(key)) {
        invalid(
          "PRODUCTION_PROJECT_EXTENSION_INVALID",
          `${field} contains an invalid key`,
        );
      }
      output[key] = normalizeJsonValue(item, `${field}.${key}`, depth + 1);
    }
    return output;
  }
  invalid(
    "PRODUCTION_PROJECT_EXTENSION_INVALID",
    `${field} must be JSON-compatible`,
  );
}

function normalizeExtensions(value, field = "extensions") {
  if (value === undefined) return {};
  const normalized = normalizeJsonValue(expectObject(value, field), field);
  if (
    byteLength(JSON.stringify(normalized)) >
    PRODUCTION_PROJECT_EXTENSION_MAX_BYTES
  ) {
    invalid("PRODUCTION_PROJECT_EXTENSION_TOO_LARGE", `${field} is too large`);
  }
  return normalized;
}

export function normalizeProductionProjectType(value) {
  const normalized = String(value || "").trim();
  if (!TYPE_SET.has(normalized))
    invalid("PRODUCTION_PROJECT_TYPE_INVALID", "projectType is invalid");
  return normalized;
}

function normalizeStatus(value) {
  const normalized = String(value || "").trim();
  if (!STATUS_SET.has(normalized))
    invalid("PRODUCTION_PROJECT_STATUS_INVALID", "status is invalid");
  return normalized;
}

function normalizeChangeKind(value) {
  const normalized = String(value || "").trim();
  if (!CHANGE_KIND_SET.has(normalized)) {
    invalid("PRODUCTION_PROJECT_CHANGE_KIND_INVALID", "changeKind is invalid");
  }
  return normalized;
}

function normalizeMarkupBody(value, field) {
  const input = expectObject(value, field);
  assertAllowedKeys(input, ["format", "value"], field);
  const format = String(input.format || "");
  if (!DOCUMENT_FORMAT_SET.has(format)) {
    invalid("PRODUCTION_PROJECT_FORMAT_INVALID", `${field}.format is invalid`);
  }
  return { format, value: bodyString(input.value, `${field}.value`) };
}

function normalizeDocumentContent(input) {
  assertAllowedKeys(
    input,
    ["type", "schemaVersion", "body", "page", "extensions"],
    "content",
  );
  const page = expectObject(input.page ?? {}, "content.page");
  assertAllowedKeys(page, ["size", "orientation"], "content.page");
  const size = String(page.size || "auto");
  const orientation = String(page.orientation || "portrait");
  if (!PAGE_SIZE_SET.has(size) || !ORIENTATION_SET.has(orientation)) {
    invalid(
      "PRODUCTION_PROJECT_PAGE_INVALID",
      "document page settings are invalid",
    );
  }
  return {
    type: "document",
    schemaVersion: 1,
    body: normalizeMarkupBody(input.body, "content.body"),
    page: { size, orientation },
    extensions: normalizeExtensions(input.extensions),
  };
}

function normalizePresentationElement(rawElement, field) {
  const element = expectObject(rawElement, field);
  assertAllowedKeys(
    element,
    [
      "id",
      "type",
      "x",
      "y",
      "width",
      "height",
      "rotation",
      "text",
      "fontSize",
      "fontWeight",
      "color",
      "align",
      "verticalAlign",
      "fill",
      "shape",
      "stroke",
      "strokeWidth",
      "src",
      "alt",
      "fit",
    ],
    field,
  );
  const type = String(element.type || "");
  if (!PRESENTATION_ELEMENT_TYPE_SET.has(type)) {
    invalid("PRODUCTION_PROJECT_ELEMENT_INVALID", `${field}.type is invalid`);
  }
  const x = boundedNumber(element.x, `${field}.x`, 0, 99.5, 10);
  const y = boundedNumber(element.y, `${field}.y`, 0, 99.5, 10);
  const width = Math.min(
    boundedNumber(element.width, `${field}.width`, 0.5, 100, 30),
    100 - x,
  );
  const height = Math.min(
    boundedNumber(element.height, `${field}.height`, 0.5, 100, 20),
    100 - y,
  );
  const base = {
    id: identifier(element.id, `${field}.id`),
    type,
    x,
    y,
    width: Math.max(0.5, width),
    height: Math.max(0.5, height),
    rotation: boundedNumber(
      element.rotation,
      `${field}.rotation`,
      -180,
      180,
      0,
    ),
  };
  if (type === "text") {
    const fontWeight = boundedInteger(
      element.fontWeight,
      `${field}.fontWeight`,
      400,
      700,
      400,
    );
    if (![400, 600, 700].includes(fontWeight)) {
      invalid(
        "PRODUCTION_PROJECT_ELEMENT_INVALID",
        `${field}.fontWeight is invalid`,
      );
    }
    const align = String(element.align || "left");
    const verticalAlign = String(element.verticalAlign || "top");
    if (
      !new Set(["left", "center", "right"]).has(align) ||
      !new Set(["top", "middle", "bottom"]).has(verticalAlign)
    ) {
      invalid(
        "PRODUCTION_PROJECT_ELEMENT_INVALID",
        `${field} text alignment is invalid`,
      );
    }
    return {
      ...base,
      type: "text",
      text: bodyString(element.text ?? "", `${field}.text`),
      fontSize: boundedNumber(
        element.fontSize,
        `${field}.fontSize`,
        8,
        200,
        28,
      ),
      fontWeight,
      color: normalizeOptionalColor(element.color, `${field}.color`, "#20232d"),
      align,
      verticalAlign,
      fill: normalizeOptionalColor(element.fill, `${field}.fill`),
    };
  }
  if (type === "shape") {
    const shape = String(element.shape || "rectangle");
    if (!PRESENTATION_SHAPE_SET.has(shape)) {
      invalid(
        "PRODUCTION_PROJECT_ELEMENT_INVALID",
        `${field}.shape is invalid`,
      );
    }
    return {
      ...base,
      type: "shape",
      shape,
      fill: normalizeOptionalColor(
        element.fill,
        `${field}.fill`,
        shape === "line" || shape === "arrow" ? null : "#e9e7ff",
      ),
      stroke: normalizeOptionalColor(
        element.stroke,
        `${field}.stroke`,
        "#615ced",
      ),
      strokeWidth: boundedNumber(
        element.strokeWidth,
        `${field}.strokeWidth`,
        0,
        20,
        2,
      ),
      text: boundedString(element.text ?? "", `${field}.text`, 2_000),
      color: normalizeOptionalColor(element.color, `${field}.color`, "#20232d"),
      fontSize: boundedNumber(
        element.fontSize,
        `${field}.fontSize`,
        8,
        120,
        22,
      ),
    };
  }
  const src = bodyString(element.src, `${field}.src`);
  if (
    src.length > PRODUCTION_PROJECT_LIMITS.maxPresentationImageChars ||
    !/^data:image\/(?:png|jpeg|webp);base64,[a-z0-9+/]+=*$/iu.test(src)
  ) {
    invalid(
      "PRODUCTION_PROJECT_ELEMENT_INVALID",
      `${field}.src must be a supported embedded image`,
    );
  }
  const fit = String(element.fit || "contain");
  if (fit !== "contain" && fit !== "cover") {
    invalid("PRODUCTION_PROJECT_ELEMENT_INVALID", `${field}.fit is invalid`);
  }
  return {
    ...base,
    type: "image",
    src,
    alt: boundedString(element.alt ?? "", `${field}.alt`, 300),
    fit,
  };
}

function normalizePresentationContent(input) {
  assertAllowedKeys(
    input,
    ["type", "schemaVersion", "canvas", "theme", "slides", "extensions"],
    "content",
  );
  const canvas = expectObject(input.canvas ?? {}, "content.canvas");
  assertAllowedKeys(canvas, ["aspectRatio"], "content.canvas");
  const aspectRatio = String(canvas.aspectRatio || "16:9");
  if (!ASPECT_RATIO_SET.has(aspectRatio)) {
    invalid(
      "PRODUCTION_PROJECT_CANVAS_INVALID",
      "presentation aspect ratio is invalid",
    );
  }
  const theme = expectObject(input.theme ?? {}, "content.theme");
  assertAllowedKeys(theme, ["name", "accent", "background"], "content.theme");
  const accent = String(theme.accent || "#615ced").toLowerCase();
  const background = String(theme.background || "#ffffff").toLowerCase();
  if (!COLOR_PATTERN.test(accent) || !COLOR_PATTERN.test(background)) {
    invalid(
      "PRODUCTION_PROJECT_THEME_INVALID",
      "presentation theme colors are invalid",
    );
  }
  if (
    !Array.isArray(input.slides) ||
    input.slides.length > PRODUCTION_PROJECT_LIMITS.maxSlides
  ) {
    invalid(
      "PRODUCTION_PROJECT_SLIDES_INVALID",
      "slides must be a bounded array",
    );
  }
  const slideIds = new Set();
  const slides = input.slides.map((rawSlide, index) => {
    const slide = expectObject(rawSlide, `content.slides[${index}]`);
    assertAllowedKeys(
      slide,
      ["id", "title", "body", "notes", "layout", "elements", "extensions"],
      `content.slides[${index}]`,
    );
    const id = identifier(slide.id, `content.slides[${index}].id`);
    if (slideIds.has(id))
      invalid("PRODUCTION_PROJECT_DUPLICATE_ID", "slide ids must be unique");
    slideIds.add(id);
    const layout = String(slide.layout || "content");
    if (!PRESENTATION_LAYOUT_SET.has(layout)) {
      invalid(
        "PRODUCTION_PROJECT_SLIDE_LAYOUT_INVALID",
        `content.slides[${index}].layout is invalid`,
      );
    }
    const rawElements = slide.elements ?? [];
    if (
      !Array.isArray(rawElements) ||
      rawElements.length > PRODUCTION_PROJECT_LIMITS.maxElementsPerSlide
    ) {
      invalid(
        "PRODUCTION_PROJECT_ELEMENTS_INVALID",
        `content.slides[${index}].elements must be a bounded array`,
      );
    }
    const elementIds = new Set();
    const elements = rawElements.map((rawElement, elementIndex) => {
      const element = normalizePresentationElement(
        rawElement,
        `content.slides[${index}].elements[${elementIndex}]`,
      );
      if (elementIds.has(element.id)) {
        invalid(
          "PRODUCTION_PROJECT_DUPLICATE_ID",
          "element ids must be unique within a slide",
        );
      }
      elementIds.add(element.id);
      return element;
    });
    return {
      id,
      title: boundedString(
        slide.title ?? "",
        `content.slides[${index}].title`,
        PRODUCTION_PROJECT_LIMITS.maxSlideTitleChars,
      ),
      body: normalizeMarkupBody(slide.body, `content.slides[${index}].body`),
      notes: boundedString(
        slide.notes ?? "",
        `content.slides[${index}].notes`,
        PRODUCTION_PROJECT_LIMITS.maxSlideNotesChars,
      ),
      layout,
      elements,
      extensions: normalizeExtensions(
        slide.extensions,
        `content.slides[${index}].extensions`,
      ),
    };
  });
  return {
    type: "presentation",
    schemaVersion: 1,
    canvas: { aspectRatio },
    theme: {
      name: boundedString(theme.name ?? "Default", "content.theme.name", 100, {
        allowEmpty: false,
      }),
      accent,
      background,
    },
    slides,
    extensions: normalizeExtensions(input.extensions),
  };
}

function normalizeWorkbookCell(rawCell, field) {
  const cell = expectObject(rawCell, field);
  assertAllowedKeys(cell, ["value", "formula", "style"], field);
  const value = cell.value;
  const valid =
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean" ||
    (typeof value === "number" && Number.isFinite(value));
  if (
    !valid ||
    (typeof value === "string" &&
      value.length > PRODUCTION_PROJECT_BODY_MAX_CHARS)
  ) {
    invalid("PRODUCTION_PROJECT_CELL_INVALID", `${field}.value is invalid`);
  }
  const output = { value };
  if (cell.formula !== undefined) {
    output.formula = boundedString(cell.formula, `${field}.formula`, 8_000, {
      allowEmpty: false,
    });
  }
  if (cell.style !== undefined) {
    const style = expectObject(cell.style, `${field}.style`);
    assertAllowedKeys(
      style,
      [
        "bold",
        "italic",
        "underline",
        "textColor",
        "fillColor",
        "align",
        "numberFormat",
        "wrapText",
      ],
      `${field}.style`,
    );
    const normalizedStyle = {};
    for (const key of ["bold", "italic", "underline", "wrapText"]) {
      if (style[key] !== undefined) {
        if (typeof style[key] !== "boolean") {
          invalid(
            "PRODUCTION_PROJECT_CELL_INVALID",
            `${field}.style.${key} is invalid`,
          );
        }
        normalizedStyle[key] = style[key];
      }
    }
    for (const key of ["textColor", "fillColor"]) {
      if (style[key] !== undefined) {
        normalizedStyle[key] = normalizeOptionalColor(
          style[key],
          `${field}.style.${key}`,
        );
      }
    }
    if (style.align !== undefined) {
      const align = String(style.align);
      if (!["left", "center", "right"].includes(align)) {
        invalid(
          "PRODUCTION_PROJECT_CELL_INVALID",
          `${field}.style.align is invalid`,
        );
      }
      normalizedStyle.align = align;
    }
    if (style.numberFormat !== undefined) {
      const numberFormat = String(style.numberFormat);
      if (!WORKBOOK_NUMBER_FORMAT_SET.has(numberFormat)) {
        invalid(
          "PRODUCTION_PROJECT_CELL_INVALID",
          `${field}.style.numberFormat is invalid`,
        );
      }
      normalizedStyle.numberFormat = numberFormat;
    }
    if (Object.keys(normalizedStyle).length) output.style = normalizedStyle;
  }
  return output;
}

function workbookColumnNumber(label) {
  let value = 0;
  for (const character of label)
    value = value * 26 + character.charCodeAt(0) - 64;
  return value;
}

function workbookCellAddressInBounds(address) {
  const match = WORKBOOK_CELL_KEY_PATTERN.exec(address);
  return Boolean(
    match &&
    workbookColumnNumber(match[1]) <= PRODUCTION_WORKBOOK_MAX_COLUMNS &&
    Number(match[2]) <= PRODUCTION_WORKBOOK_MAX_ROWS,
  );
}

function normalizeWorkbookContent(input) {
  assertAllowedKeys(
    input,
    ["type", "schemaVersion", "sheets", "activeSheetId", "extensions"],
    "content",
  );
  if (
    !Array.isArray(input.sheets) ||
    input.sheets.length > PRODUCTION_PROJECT_LIMITS.maxSheets
  ) {
    invalid(
      "PRODUCTION_PROJECT_SHEETS_INVALID",
      "sheets must be a bounded array",
    );
  }
  const sheetIds = new Set();
  const sheetNames = new Set();
  const sheets = input.sheets.map((rawSheet, sheetIndex) => {
    const field = `content.sheets[${sheetIndex}]`;
    const sheet = expectObject(rawSheet, field);
    assertAllowedKeys(
      sheet,
      ["id", "name", "cells", "view", "extensions"],
      field,
    );
    const id = identifier(sheet.id, `${field}.id`);
    const name = boundedString(
      sheet.name,
      `${field}.name`,
      PRODUCTION_PROJECT_LIMITS.maxSheetNameChars,
      { allowEmpty: false },
    );
    const foldedName = name.toLocaleLowerCase();
    if (sheetIds.has(id) || sheetNames.has(foldedName)) {
      invalid(
        "PRODUCTION_PROJECT_DUPLICATE_ID",
        "sheet ids and names must be unique",
      );
    }
    sheetIds.add(id);
    sheetNames.add(foldedName);
    const rawCells = expectObject(sheet.cells ?? {}, `${field}.cells`);
    if (
      Object.keys(rawCells).length > PRODUCTION_PROJECT_LIMITS.maxCellsPerSheet
    ) {
      invalid(
        "PRODUCTION_PROJECT_CELLS_INVALID",
        `${field} contains too many cells`,
      );
    }
    const cells = {};
    for (const [address, rawCell] of Object.entries(rawCells)) {
      if (!workbookCellAddressInBounds(address)) {
        invalid(
          "PRODUCTION_PROJECT_CELL_INVALID",
          `${field}.cells contains an invalid A1 address`,
        );
      }
      cells[address] = normalizeWorkbookCell(
        rawCell,
        `${field}.cells.${address}`,
      );
    }
    let view;
    if (sheet.view !== undefined) {
      const rawView = expectObject(sheet.view, `${field}.view`);
      assertAllowedKeys(
        rawView,
        ["freezeRows", "freezeColumns"],
        `${field}.view`,
      );
      view = {
        freezeRows: boundedInteger(
          rawView.freezeRows,
          `${field}.view.freezeRows`,
          0,
          PRODUCTION_WORKBOOK_MAX_ROWS - 1,
          0,
        ),
        freezeColumns: boundedInteger(
          rawView.freezeColumns,
          `${field}.view.freezeColumns`,
          0,
          PRODUCTION_WORKBOOK_MAX_COLUMNS - 1,
          0,
        ),
      };
    }
    return {
      id,
      name,
      cells,
      ...(view ? { view } : {}),
      extensions: normalizeExtensions(sheet.extensions, `${field}.extensions`),
    };
  });
  const activeSheetId =
    input.activeSheetId === null || input.activeSheetId === undefined
      ? null
      : identifier(input.activeSheetId, "content.activeSheetId");
  if (activeSheetId !== null && !sheetIds.has(activeSheetId)) {
    invalid(
      "PRODUCTION_PROJECT_ACTIVE_SHEET_INVALID",
      "activeSheetId must reference a sheet",
    );
  }
  return {
    type: "workbook",
    schemaVersion: 1,
    sheets,
    activeSheetId,
    extensions: normalizeExtensions(input.extensions),
  };
}

export function normalizeProductionProjectContent(input, expectedProjectType) {
  const content = expectObject(input, "content");
  const declaredType = String(content.type || "");
  const schemaVersion = content.schemaVersion;
  const projectType =
    expectedProjectType === undefined
      ? declaredType
      : normalizeProductionProjectType(expectedProjectType);
  if (
    !TYPE_SET.has(projectType) ||
    declaredType !== projectType ||
    schemaVersion !== 1
  ) {
    invalid(
      "PRODUCTION_PROJECT_SCHEMA_MISMATCH",
      "content schema does not match projectType",
    );
  }
  const normalized =
    projectType === "document"
      ? normalizeDocumentContent(content)
      : projectType === "presentation"
        ? normalizePresentationContent(content)
        : normalizeWorkbookContent(content);
  if (
    byteLength(JSON.stringify(normalized)) >
    PRODUCTION_PROJECT_CONTENT_MAX_BYTES
  ) {
    invalid("PRODUCTION_PROJECT_CONTENT_TOO_LARGE", "content is too large");
  }
  return deepFreeze(normalized);
}

export function validateProductionProjectContent(input, expectedProjectType) {
  try {
    normalizeProductionProjectContent(input, expectedProjectType);
    return true;
  } catch (error) {
    if (error instanceof ProductionProjectProtocolError) return false;
    throw error;
  }
}

export function createEmptyProductionProjectContent(projectType) {
  const normalizedType = normalizeProductionProjectType(projectType);
  if (normalizedType === "document") {
    return normalizeProductionProjectContent(
      {
        type: "document",
        schemaVersion: 1,
        body: { format: "markdown", value: "" },
        page: { size: "auto", orientation: "portrait" },
      },
      normalizedType,
    );
  }
  if (normalizedType === "presentation") {
    return normalizeProductionProjectContent(
      {
        type: "presentation",
        schemaVersion: 1,
        canvas: { aspectRatio: "16:9" },
        theme: { name: "Default", accent: "#615ced", background: "#ffffff" },
        slides: [],
      },
      normalizedType,
    );
  }
  return normalizeProductionProjectContent(
    {
      type: "workbook",
      schemaVersion: 1,
      sheets: [],
      activeSheetId: null,
    },
    normalizedType,
  );
}

export function normalizeProductionProjectMetadata(input = {}) {
  const metadata = expectObject(input, "metadata");
  assertAllowedKeys(
    metadata,
    [
      "description",
      "tags",
      "locale",
      "templateId",
      "coverResourceId",
      "extensions",
    ],
    "metadata",
  );
  const tags = metadata.tags ?? [];
  if (!Array.isArray(tags) || tags.length > PRODUCTION_PROJECT_LIMITS.maxTags) {
    invalid("PRODUCTION_PROJECT_METADATA_INVALID", "metadata.tags is invalid");
  }
  const normalizedTags = tags.map((tag, index) =>
    boundedString(
      tag,
      `metadata.tags[${index}]`,
      PRODUCTION_PROJECT_LIMITS.maxTagChars,
      { allowEmpty: false },
    ),
  );
  if (new Set(normalizedTags).size !== normalizedTags.length) {
    invalid(
      "PRODUCTION_PROJECT_METADATA_INVALID",
      "metadata.tags must be unique",
    );
  }
  const locale =
    metadata.locale === null ||
    metadata.locale === undefined ||
    metadata.locale === ""
      ? null
      : String(metadata.locale).trim();
  if (locale !== null && !LOCALE_PATTERN.test(locale)) {
    invalid(
      "PRODUCTION_PROJECT_METADATA_INVALID",
      "metadata.locale is invalid",
    );
  }
  return deepFreeze({
    description: boundedString(
      metadata.description ?? "",
      "metadata.description",
      PRODUCTION_PROJECT_DESCRIPTION_MAX_CHARS,
    ),
    tags: normalizedTags,
    locale,
    templateId:
      metadata.templateId === null || metadata.templateId === undefined
        ? null
        : identifier(metadata.templateId, "metadata.templateId"),
    coverResourceId:
      metadata.coverResourceId === null ||
      metadata.coverResourceId === undefined
        ? null
        : identifier(metadata.coverResourceId, "metadata.coverResourceId"),
    extensions: normalizeExtensions(metadata.extensions, "metadata.extensions"),
  });
}

function normalizeTitle(value) {
  return boundedString(value, "title", PRODUCTION_PROJECT_TITLE_MAX_CHARS, {
    allowEmpty: false,
  });
}

function rawValue(record, camelKey, snakeKey = camelKey) {
  return record[camelKey] ?? record[snakeKey];
}

function parseJsonObject(value, field) {
  if (typeof value !== "string") return expectObject(value, field);
  try {
    return expectObject(JSON.parse(value), field);
  } catch (error) {
    if (error instanceof ProductionProjectProtocolError) throw error;
    invalid(
      "PRODUCTION_PROJECT_JSON_INVALID",
      `${field} contains invalid JSON`,
    );
  }
}

export function toProductionProjectDto(record) {
  const source = expectObject(record, "project");
  const rawMetadata = rawValue(source, "metadata", "metadata_json");
  return deepFreeze({
    id: identifier(rawValue(source, "id"), "project.id"),
    projectType: normalizeProductionProjectType(
      rawValue(source, "projectType", "project_type"),
    ),
    title: normalizeTitle(rawValue(source, "title")),
    metadata: normalizeProductionProjectMetadata(
      rawMetadata === null || rawMetadata === undefined
        ? {}
        : parseJsonObject(rawMetadata, "project.metadata"),
    ),
    status: normalizeStatus(rawValue(source, "status")),
    version: positiveSequence(rawValue(source, "version"), "project.version"),
    currentRevision: positiveSequence(
      rawValue(source, "currentRevision", "current_revision"),
      "project.currentRevision",
    ),
    currentRevisionId: identifier(
      rawValue(source, "currentRevisionId", "current_revision_id"),
      "project.currentRevisionId",
    ),
    lastOpenedAt: nullableTimestamp(
      rawValue(source, "lastOpenedAt", "last_opened_at"),
      "project.lastOpenedAt",
    ),
    createdAt: nullableTimestamp(
      rawValue(source, "createdAt", "create_time"),
      "project.createdAt",
    ),
    updatedAt: nullableTimestamp(
      rawValue(source, "updatedAt", "updated_at"),
      "project.updatedAt",
    ),
    trashedAt: nullableTimestamp(
      rawValue(source, "trashedAt", "trashed_at"),
      "project.trashedAt",
    ),
  });
}

export function toProductionProjectRevisionDto(record, expectedProjectType) {
  const source = expectObject(record, "revision");
  const projectType = normalizeProductionProjectType(
    expectedProjectType ?? rawValue(source, "projectType", "project_type"),
  );
  return deepFreeze({
    id: identifier(rawValue(source, "id"), "revision.id"),
    projectId: identifier(
      rawValue(source, "projectId", "project_id"),
      "revision.projectId",
    ),
    projectType,
    revision: positiveSequence(
      rawValue(source, "revision", "revision_no"),
      "revision.revision",
    ),
    changeKind: normalizeChangeKind(
      rawValue(source, "changeKind", "change_kind"),
    ),
    label:
      rawValue(source, "label") === null ||
      rawValue(source, "label") === undefined
        ? null
        : boundedString(rawValue(source, "label"), "revision.label", 200, {
            allowEmpty: false,
          }),
    content: normalizeProductionProjectContent(
      parseJsonObject(
        rawValue(source, "content", "content_json"),
        "revision.content",
      ),
      projectType,
    ),
    sourceRevisionId:
      rawValue(source, "sourceRevisionId", "source_revision_id") === null ||
      rawValue(source, "sourceRevisionId", "source_revision_id") === undefined
        ? null
        : identifier(
            rawValue(source, "sourceRevisionId", "source_revision_id"),
            "revision.sourceRevisionId",
          ),
    createdAt: nullableTimestamp(
      rawValue(source, "createdAt", "create_time"),
      "revision.createdAt",
    ),
  });
}

export function normalizeProductionProjectCreateRequest(input) {
  const source = expectObject(input, "request");
  assertAllowedKeys(
    source,
    [
      "clientRequestId",
      "projectType",
      "title",
      "metadata",
      "content",
      "changeKind",
    ],
    "request",
  );
  const projectType = normalizeProductionProjectType(source.projectType);
  const changeKind = normalizeChangeKind(source.changeKind ?? "create");
  if (changeKind !== "create" && changeKind !== "import") {
    invalid(
      "PRODUCTION_PROJECT_CHANGE_KIND_INVALID",
      "create request changeKind must be create or import",
    );
  }
  return deepFreeze({
    clientRequestId: clientRequestId(source.clientRequestId),
    projectType,
    title: normalizeTitle(source.title),
    metadata: normalizeProductionProjectMetadata(source.metadata ?? {}),
    content: normalizeProductionProjectContent(source.content, projectType),
    changeKind,
  });
}

export function normalizeProductionProjectUpdateRequest(input) {
  const source = expectObject(input, "request");
  assertAllowedKeys(
    source,
    ["expectedVersion", "title", "metadata", "status"],
    "request",
  );
  const output = {
    expectedVersion: positiveSequence(
      source.expectedVersion,
      "expectedVersion",
    ),
  };
  if (source.title !== undefined) output.title = normalizeTitle(source.title);
  if (source.metadata !== undefined)
    output.metadata = normalizeProductionProjectMetadata(source.metadata);
  if (source.status !== undefined)
    output.status = normalizeStatus(source.status);
  if (Object.keys(output).length === 1) {
    invalid("PRODUCTION_PROJECT_UPDATE_EMPTY", "update request has no changes");
  }
  return deepFreeze(output);
}

export function normalizeProductionProjectRevisionRequest(input, projectType) {
  const source = expectObject(input, "request");
  assertAllowedKeys(
    source,
    [
      "clientRequestId",
      "expectedVersion",
      "expectedRevision",
      "changeKind",
      "label",
      "content",
    ],
    "request",
  );
  const changeKind = normalizeChangeKind(source.changeKind);
  if (changeKind === "create" || changeKind === "restore") {
    invalid(
      "PRODUCTION_PROJECT_CHANGE_KIND_INVALID",
      "revision request changeKind is invalid",
    );
  }
  return deepFreeze({
    clientRequestId: clientRequestId(source.clientRequestId),
    expectedVersion: positiveSequence(
      source.expectedVersion,
      "expectedVersion",
    ),
    expectedRevision: positiveSequence(
      source.expectedRevision,
      "expectedRevision",
    ),
    changeKind,
    label:
      source.label === null || source.label === undefined
        ? null
        : boundedString(source.label, "label", 200, { allowEmpty: false }),
    content: normalizeProductionProjectContent(source.content, projectType),
  });
}

export function normalizeProductionProjectRestoreRequest(input) {
  const source = expectObject(input, "request");
  assertAllowedKeys(
    source,
    [
      "clientRequestId",
      "expectedVersion",
      "expectedRevision",
      "sourceRevisionId",
    ],
    "request",
  );
  return deepFreeze({
    clientRequestId: clientRequestId(source.clientRequestId),
    expectedVersion: positiveSequence(
      source.expectedVersion,
      "expectedVersion",
    ),
    expectedRevision: positiveSequence(
      source.expectedRevision,
      "expectedRevision",
    ),
    sourceRevisionId: identifier(source.sourceRevisionId, "sourceRevisionId"),
    changeKind: "restore",
  });
}
