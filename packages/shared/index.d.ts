export type ApiStatus = 200 | 400 | 401 | 403 | 404 | 423 | 500 | 'preview' | 'visitor';

/** 轻笺统一响应信封:resultData(data, status, msg) 的形状。 */
export interface ApiResponse<T = unknown> {
  data: T | null;
  status: ApiStatus;
  msg: string;
}

export declare const STATUS: {
  readonly OK: 200;
  readonly BAD_REQUEST: 400;
  readonly UNAUTHORIZED: 401;
  readonly FORBIDDEN: 403;
  readonly NOT_FOUND: 404;
  readonly BANNED: 423;
  readonly SERVER_ERROR: 500;
  /** 游客只读预览软引导,不可用 401/403/'visitor' 代替 */
  readonly PREVIEW: 'preview';
  readonly VISITOR: 'visitor';
};

/** 网站合规展示信息；产品品牌与网站备案全称不得混用。 */
export declare const SITE_COMPLIANCE: {
  readonly productName: '轻笺';
  readonly websiteFilingName: '轻笺知识库';
  readonly websiteIcpNumber: '蜀ICP备2026017699号-1';
  readonly miitQueryUrl: 'https://beian.miit.gov.cn/';
  readonly publicSecurityFilingNumber: '川公网安备51200002001211号';
  readonly publicSecurityQueryUrl: 'https://beian.mps.gov.cn/#/query/webSearch?code=51200002001211';
  readonly publicSecurityBadgePath: '/public-security-filing-badge.png';
};

export type FilePreviewStrategy = 'archive_manifest' | 'converted_pdf';
export type DerivedFilePreviewType = 'archive' | 'converted-pdf';

export interface FilePreviewFormatDefinition {
  readonly id: string;
  readonly category: 'compress' | 'word' | 'excel' | 'ppt';
  readonly previewType: DerivedFilePreviewType;
  readonly strategy: FilePreviewStrategy;
  readonly extensions: readonly string[];
  readonly mimeTypes: readonly string[];
}

export declare const FILE_PREVIEW_STRATEGY: {
  readonly ARCHIVE_MANIFEST: 'archive_manifest';
  readonly CONVERTED_PDF: 'converted_pdf';
};

export declare const FILE_PREVIEW_FORMATS: readonly FilePreviewFormatDefinition[];
export declare const FILE_PREVIEW_EXTRA_TEXT_EXTENSIONS: readonly string[];
export declare function normalizeFilePreviewMimeType(value?: unknown): string;
export declare function getFilePreviewExtension(fileName?: unknown, explicitExtension?: unknown): string;
export declare function resolveFilePreviewFormat(input?: {
  fileName?: unknown;
  fileType?: unknown;
  ext?: unknown;
}): FilePreviewFormatDefinition | null;

export type BookmarkUrlState = 'valid' | 'normalized' | 'needs_confirmation' | 'invalid';
export type BookmarkUrlCandidateSource = 'explicit' | 'domain';

export interface BookmarkUrlCandidate {
  url: string;
  source: BookmarkUrlCandidateSource;
}

export interface BookmarkUrlResolution {
  state: BookmarkUrlState;
  code: string;
  originalInput: string;
  canonicalUrl: string;
  candidates: BookmarkUrlCandidate[];
}

export declare const BOOKMARK_URL_STATE: {
  readonly VALID: 'valid';
  readonly NORMALIZED: 'normalized';
  readonly NEEDS_CONFIRMATION: 'needs_confirmation';
  readonly INVALID: 'invalid';
};

export declare const BOOKMARK_URL_CODE: {
  readonly OK: 'OK';
  readonly EMPTY: 'EMPTY';
  readonly TOO_LONG: 'TOO_LONG';
  readonly INVALID_FORMAT: 'INVALID_FORMAT';
  readonly UNSUPPORTED_PROTOCOL: 'UNSUPPORTED_PROTOCOL';
  readonly CREDENTIALS_NOT_ALLOWED: 'CREDENTIALS_NOT_ALLOWED';
  readonly URL_TOO_LONG: 'URL_TOO_LONG';
  readonly CANDIDATE_CONFIRMATION_REQUIRED: 'CANDIDATE_CONFIRMATION_REQUIRED';
};

export declare function resolveBookmarkUrlInput(
  value: unknown,
  options?: { allowTextExtraction?: boolean; maxInputLength?: number },
): BookmarkUrlResolution;

/** 笔记内联提及(N0)· 站内资源引用类型。 */
export type ResourceRefType = 'note' | 'bookmark' | 'file';

export interface ResourceRef {
  type: ResourceRefType;
  id: string;
}

export declare const RESOURCE_REF_TYPES: readonly ResourceRefType[];

/** 把历史类型值 `md` 归一为 `markdown`;其余原样字符串化。 */
export declare function normalizeNoteType(type: unknown): string;

/**
 * 仅恢复被 HTML 序列化污染的 Markdown 行首引用标记（`&gt;` → `>`）。
 * 普通正文、链接和代码块内的 HTML 实体保持不变。
 */
export declare function normalizeMarkdownBlockquoteEntities(value: unknown): string;

/** 解析 canonical href 为 { type, id };非 exact 或 id 不安全返回 null。 */
export declare function parseResourceHref(href: unknown): ResourceRef | null;

/** 由 { type, id } 构造 canonical href;非法输入返回 ''。 */
export declare function buildResourceHref(ref: ResourceRef): string;

/** 由安全 ref 生成 HTML anchor 增强属性。 */
export declare function buildResourceAnchorAttrs(ref: ResourceRef): {
  'data-ln-resource-type': string;
  'data-ln-resource-id': string;
};

/** 把一组 href 归一为去重、保序的引用集合。 */
export declare function dedupeResourceRefs(hrefs: string[]): ResourceRef[];

/** 前后端共享的 canonical 协议测试向量。 */
export declare const RESOURCE_REF_TEST_VECTORS: ReadonlyArray<{ href: string; ref: ResourceRef | null }>;

/** 轻笺 Android 正式发布记录（前后端共享的单一事实源）。 */
export declare const ANDROID_RELEASE: {
  readonly versionName: string;
  readonly versionCode: number;
  readonly packageName: string;
  readonly releaseDate: string;
  readonly fileSizeBytes: number;
  readonly sha256: string;
  readonly certificateSha256: string;
  readonly downloadPath: string;
  readonly minAndroidVersion: string;
  readonly permissions: ReadonlyArray<string>;
  readonly released: boolean;
};

/** 当前 Android 源码的 Manifest 权限；可以在下一版 APK 构建前领先于 ANDROID_RELEASE。 */
export declare const ANDROID_SOURCE_PERMISSIONS: ReadonlyArray<string>;

/** 唯一正式分发域名。 */
export declare const OFFICIAL_HOST: string;

/** 永不变化的安装包地址（相对路径），302 到当前版本的实际文件。 */
export declare const ANDROID_LATEST_APK_PATH: string;
