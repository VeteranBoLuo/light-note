import { clearExtensionSession, getExtensionSession, getOrCreateDeviceId } from './storage';

export const EXTENSION_APP_ORIGIN = __LIGHTNOTE_APP_ORIGIN__;
const AUTH_INVALID_STATUSES = new Set<unknown>([401, 403, 'visitor']);

export class ExtensionApiError extends Error {
  code: string;
  status: number | string;
  data: any;

  constructor(code: string, message: string, status: number | string = 500, data: any = null) {
    super(message);
    this.name = 'ExtensionApiError';
    this.code = code;
    this.status = status;
    this.data = data;
  }
}

export function isExtensionAuthError(error: unknown): boolean {
  const value = error as ExtensionApiError;
  return value?.code === 'EXTENSION_AUTH_REQUIRED' || AUTH_INVALID_STATUSES.has(value?.status);
}

async function requestHeaders(extraHeaders: HeadersInit = {}): Promise<Headers> {
  const session = await getExtensionSession();
  const deviceId = session?.deviceId || (await getOrCreateDeviceId());
  const headers = new Headers(extraHeaders);
  headers.set('Content-Type', 'application/json');
  headers.set('X-LightNote-Runtime', 'browser_extension');
  headers.set('X-Lang', navigator.language.toLowerCase().startsWith('zh') ? 'zh-CN' : 'en-US');
  headers.set('X-Device-Id', deviceId);
  if (session?.sid) headers.set('X-Session-Id', session.sid);
  return headers;
}

export async function extensionRequest<T = any>(
  path: string,
  options: { method?: 'GET' | 'POST'; body?: unknown; signal?: AbortSignal; requireAuth?: boolean } = {},
): Promise<T> {
  if (options.requireAuth && !(await getExtensionSession())?.sid) {
    throw new ExtensionApiError('EXTENSION_AUTH_REQUIRED', '请先登录轻笺', 401);
  }
  const response = await fetch(`${EXTENSION_APP_ORIGIN}${path}`, {
    method: options.method || (options.body === undefined ? 'GET' : 'POST'),
    headers: await requestHeaders(),
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    signal: options.signal,
    credentials: 'omit',
  });
  let envelope: any;
  try {
    envelope = await response.json();
  } catch {
    throw new ExtensionApiError('EXTENSION_RESPONSE_INVALID', '轻笺返回了无法识别的结果', response.status);
  }
  const status = envelope?.status ?? response.status;
  if (options.requireAuth !== false && AUTH_INVALID_STATUSES.has(status)) {
    await clearExtensionSession();
    window.dispatchEvent(new CustomEvent('light-note-extension-auth-expired'));
    throw new ExtensionApiError('EXTENSION_AUTH_REQUIRED', envelope?.msg || '登录已过期', status, envelope?.data);
  }
  if (!response.ok || Number(status) !== 200) {
    throw new ExtensionApiError(
      String(envelope?.data?.errorCode || envelope?.data?.code || `HTTP_${response.status}`),
      String(envelope?.msg || '请求失败，请稍后重试'),
      status,
      envelope?.data,
    );
  }
  return envelope.data as T;
}

export function extensionGet<T = any>(path: string, requireAuth = true): Promise<T> {
  return extensionRequest<T>(path, { method: 'GET', requireAuth });
}

export function extensionPost<T = any>(
  path: string,
  body?: unknown,
  requireAuth = true,
  signal?: AbortSignal,
): Promise<T> {
  return extensionRequest<T>(path, { method: 'POST', body, requireAuth, signal });
}
