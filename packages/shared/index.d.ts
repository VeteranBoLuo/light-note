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
