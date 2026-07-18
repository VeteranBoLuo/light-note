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
