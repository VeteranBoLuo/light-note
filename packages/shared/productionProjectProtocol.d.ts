export type ProductionProjectType = "document" | "presentation" | "workbook";
export type ProductionProjectStatus = "active" | "archived" | "trashed";
export type ProductionProjectChangeKind =
  "create" | "autosave" | "named" | "ai_apply" | "import" | "restore";
export type ProductionProjectContentSchema =
  "document/v1" | "presentation/v1" | "workbook/v1";
export type ProductionMarkupFormat = "markdown" | "html";
export type ProductionJsonValue =
  | null
  | string
  | number
  | boolean
  | ProductionJsonValue[]
  | { [key: string]: ProductionJsonValue };
export type ProductionExtensions = Record<string, ProductionJsonValue>;

export interface ProductionMarkupBody {
  format: ProductionMarkupFormat;
  value: string;
}

export interface ProductionDocumentContentV1 {
  type: "document";
  schemaVersion: 1;
  body: ProductionMarkupBody;
  page: {
    size: "auto" | "a4" | "letter";
    orientation: "portrait" | "landscape";
  };
  extensions: ProductionExtensions;
}

export interface ProductionPresentationSlideV1 {
  id: string;
  title: string;
  body: ProductionMarkupBody;
  notes: string;
  layout: "title" | "section" | "content" | "two_column" | "blank";
  /** 自由画布元素按数组顺序从后向前叠放；标题与正文仍是兼容旧项目的版式占位符。 */
  elements?: ProductionPresentationElementV1[];
  extensions: ProductionExtensions;
}

export interface ProductionPresentationElementBaseV1 {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
}

export interface ProductionPresentationTextElementV1 extends ProductionPresentationElementBaseV1 {
  type: "text";
  text: string;
  fontSize: number;
  fontWeight: 400 | 600 | 700;
  color: string;
  align: "left" | "center" | "right";
  verticalAlign: "top" | "middle" | "bottom";
  fill: string | null;
}

export interface ProductionPresentationShapeElementV1 extends ProductionPresentationElementBaseV1 {
  type: "shape";
  shape:
    | "rectangle"
    | "rounded_rectangle"
    | "ellipse"
    | "triangle"
    | "diamond"
    | "line"
    | "arrow";
  fill: string | null;
  stroke: string;
  strokeWidth: number;
  text: string;
  color: string;
  fontSize: number;
}

export interface ProductionPresentationImageElementV1 extends ProductionPresentationElementBaseV1 {
  type: "image";
  src: string;
  alt: string;
  fit: "contain" | "cover";
}

export type ProductionPresentationElementV1 =
  | ProductionPresentationTextElementV1
  | ProductionPresentationShapeElementV1
  | ProductionPresentationImageElementV1;

export interface ProductionPresentationContentV1 {
  type: "presentation";
  schemaVersion: 1;
  canvas: { aspectRatio: "16:9" | "4:3" };
  theme: { name: string; accent: string; background: string };
  slides: ProductionPresentationSlideV1[];
  extensions: ProductionExtensions;
}

export interface ProductionWorkbookCellV1 {
  value: string | number | boolean | null;
  formula?: string;
  style?: ProductionWorkbookCellStyleV1;
}
export interface ProductionWorkbookCellStyleV1 {
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  textColor?: string;
  fillColor?: string;
  align?: "left" | "center" | "right";
  numberFormat?: "general" | "number" | "currency" | "percent" | "date";
  wrapText?: boolean;
}
export interface ProductionWorkbookSheetV1 {
  id: string;
  name: string;
  /** A1 地址到单元格的稀疏映射。 */
  cells: Record<string, ProductionWorkbookCellV1>;
  view?: { freezeRows: number; freezeColumns: number };
  extensions: ProductionExtensions;
}
export interface ProductionWorkbookContentV1 {
  type: "workbook";
  schemaVersion: 1;
  sheets: ProductionWorkbookSheetV1[];
  activeSheetId: string | null;
  extensions: ProductionExtensions;
}
export type ProductionProjectContent =
  | ProductionDocumentContentV1
  | ProductionPresentationContentV1
  | ProductionWorkbookContentV1;

export interface ProductionProjectMetadata {
  description: string;
  tags: string[];
  locale: string | null;
  templateId: string | null;
  coverResourceId: string | null;
  extensions: ProductionExtensions;
}

/** 可变项目头，不包含任何正文。 */
export interface ProductionProjectDto {
  id: string;
  projectType: ProductionProjectType;
  title: string;
  metadata: ProductionProjectMetadata;
  status: ProductionProjectStatus;
  version: number;
  currentRevision: number;
  currentRevisionId: string;
  lastOpenedAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  trashedAt: string | null;
}

/** 不可变正文修订；title/metadata 只存在于 Project DTO。 */
export interface ProductionProjectRevisionDto {
  id: string;
  projectId: string;
  projectType: ProductionProjectType;
  revision: number;
  changeKind: ProductionProjectChangeKind;
  label: string | null;
  content: ProductionProjectContent;
  sourceRevisionId: string | null;
  createdAt: string | null;
}

export interface ProductionProjectCreateRequest {
  clientRequestId: string;
  projectType: ProductionProjectType;
  title: string;
  metadata?: Partial<ProductionProjectMetadata>;
  content: ProductionProjectContent;
  changeKind?: "create" | "import";
}
export interface ProductionProjectUpdateRequest {
  expectedVersion: number;
  title?: string;
  metadata?: Partial<ProductionProjectMetadata>;
  status?: ProductionProjectStatus;
}
export interface ProductionProjectRevisionRequest {
  clientRequestId: string;
  expectedVersion: number;
  expectedRevision: number;
  changeKind: "autosave" | "named" | "ai_apply" | "import";
  label?: string | null;
  content: ProductionProjectContent;
}
export interface ProductionProjectRestoreRequest {
  clientRequestId: string;
  expectedVersion: number;
  expectedRevision: number;
  sourceRevisionId: string;
}

export declare const PRODUCTION_PROJECT_PROTOCOL_VERSION: 1;
export declare const PRODUCTION_PROJECT_SEQUENCE_START: 1;
export declare const PRODUCTION_PROJECT_TITLE_MAX_CHARS: 200;
export declare const PRODUCTION_PROJECT_DESCRIPTION_MAX_CHARS: 2000;
export declare const PRODUCTION_PROJECT_CONTENT_MAX_BYTES: number;
export declare const PRODUCTION_PROJECT_BODY_MAX_CHARS: 2000000;
export declare const PRODUCTION_PROJECT_EXTENSION_MAX_BYTES: number;
export declare const PRODUCTION_PROJECT_CLIENT_REQUEST_ID_MIN_CHARS: 8;
export declare const PRODUCTION_PROJECT_CLIENT_REQUEST_ID_MAX_CHARS: 128;
export declare const PRODUCTION_WORKBOOK_MAX_ROWS: 1048576;
export declare const PRODUCTION_WORKBOOK_MAX_COLUMNS: 16384;
export declare const PRODUCTION_PROJECT_TYPES: readonly ProductionProjectType[];
export declare const PRODUCTION_PROJECT_STATUSES: readonly ProductionProjectStatus[];
export declare const PRODUCTION_PROJECT_CHANGE_KINDS: readonly ProductionProjectChangeKind[];
export declare const PRODUCTION_PROJECT_CONTENT_SCHEMAS: Readonly<
  Record<ProductionProjectType, ProductionProjectContentSchema>
>;
export declare const PRODUCTION_PROJECT_CONFLICT_CODES: Readonly<{
  VERSION: "PRODUCTION_PROJECT_VERSION_CONFLICT";
  REVISION: "PRODUCTION_PROJECT_REVISION_CONFLICT";
}>;
export declare const PRODUCTION_PROJECT_LOCK_SEMANTICS: Readonly<{
  projectVersionField: "version";
  revisionHeadField: "currentRevision";
  expectedProjectVersionField: "expectedVersion";
  expectedRevisionField: "expectedRevision";
  revisionContentImmutable: true;
  revisionInsertIncrementsProjectVersion: true;
}>;
export declare const PRODUCTION_DOCUMENT_FORMATS: readonly ProductionMarkupFormat[];
export declare const PRODUCTION_DOCUMENT_PAGE_SIZES: readonly (
  "auto" | "a4" | "letter"
)[];
export declare const PRODUCTION_DOCUMENT_ORIENTATIONS: readonly (
  "portrait" | "landscape"
)[];
export declare const PRODUCTION_PRESENTATION_ASPECT_RATIOS: readonly (
  "16:9" | "4:3"
)[];
export declare const PRODUCTION_PRESENTATION_LAYOUTS: readonly (
  "title" | "section" | "content" | "two_column" | "blank"
)[];
export declare const PRODUCTION_PRESENTATION_ELEMENT_TYPES: readonly (
  "text" | "shape" | "image"
)[];
export declare const PRODUCTION_PRESENTATION_SHAPES: readonly (
  | "rectangle"
  | "rounded_rectangle"
  | "ellipse"
  | "triangle"
  | "diamond"
  | "line"
  | "arrow"
)[];
export declare const PRODUCTION_WORKBOOK_NUMBER_FORMATS: readonly (
  "general" | "number" | "currency" | "percent" | "date"
)[];
export declare const PRODUCTION_PROJECT_LIMITS: Readonly<{
  maxTags: 20;
  maxTagChars: 50;
  maxSlides: 500;
  maxSlideTitleChars: 300;
  maxSlideNotesChars: 20000;
  maxElementsPerSlide: 200;
  maxPresentationImageChars: 2000000;
  maxSheets: 100;
  maxSheetNameChars: 100;
  maxCellsPerSheet: 2000000;
  maxWorkbookRows: 1048576;
  maxWorkbookColumns: 16384;
}>;

export declare class ProductionProjectProtocolError extends Error {
  code: string;
  status: 400;
  constructor(code: string, message: string);
}

export declare function normalizeProductionProjectType(
  value: unknown,
): ProductionProjectType;
export declare function normalizeProductionProjectContent(
  input: unknown,
  expectedProjectType?: ProductionProjectType,
): Readonly<ProductionProjectContent>;
export declare function validateProductionProjectContent(
  input: unknown,
  expectedProjectType?: ProductionProjectType,
): boolean;
export declare function createEmptyProductionProjectContent(
  projectType: ProductionProjectType,
): Readonly<ProductionProjectContent>;
export declare function normalizeProductionProjectMetadata(
  input?: unknown,
): Readonly<ProductionProjectMetadata>;
export declare function toProductionProjectDto(
  record: unknown,
): Readonly<ProductionProjectDto>;
export declare function toProductionProjectRevisionDto(
  record: unknown,
  expectedProjectType?: ProductionProjectType,
): Readonly<ProductionProjectRevisionDto>;
export declare function normalizeProductionProjectCreateRequest(
  input: unknown,
): Readonly<
  ProductionProjectCreateRequest & {
    metadata: ProductionProjectMetadata;
    changeKind: "create" | "import";
  }
>;
export declare function normalizeProductionProjectUpdateRequest(
  input: unknown,
): Readonly<ProductionProjectUpdateRequest>;
export declare function normalizeProductionProjectRevisionRequest(
  input: unknown,
  projectType: ProductionProjectType,
): Readonly<ProductionProjectRevisionRequest>;
export declare function normalizeProductionProjectRestoreRequest(
  input: unknown,
): Readonly<ProductionProjectRestoreRequest & { changeKind: "restore" }>;
