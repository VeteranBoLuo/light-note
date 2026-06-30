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
