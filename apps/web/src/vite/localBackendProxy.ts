import type { ClientRequest, IncomingMessage } from 'node:http';
import type { ProxyOptions } from 'vite';

export const LOCAL_VITE_BACKEND_TARGET = 'http://127.0.0.1:9001';
export const PUBLIC_UPLOAD_ORIGIN = 'https://boluo66.top';

const PUBLIC_UPLOAD_READ_METHODS = new Set(['GET', 'HEAD']);
const PUBLIC_UPLOAD_SENSITIVE_REQUEST_HEADERS = [
  'authorization',
  'cookie',
  'proxy-authorization',
  'x-session-id',
  'x-admin-context',
  'fingerprint',
  'x-device-id',
  'x-log-device-id',
] as const;

export function isPublicUploadReadMethod(method: unknown) {
  return PUBLIC_UPLOAD_READ_METHODS.has(String(method || '').toUpperCase());
}

export function stripPublicUploadRequestCredentials(proxyRequest: Pick<ClientRequest, 'removeHeader'>) {
  PUBLIC_UPLOAD_SENSITIVE_REQUEST_HEADERS.forEach((header) => proxyRequest.removeHeader(header));
}

export function stripPublicUploadResponseCookies(proxyResponse: Pick<IncomingMessage, 'headers'>) {
  delete proxyResponse.headers['set-cookie'];
}

export function assertLocalViteBackend(viteEnv: unknown) {
  const normalized = String(viteEnv || '')
    .trim()
    .toLowerCase();
  if (!normalized || normalized === 'local') return;
  throw new Error('VITE_REMOTE_BACKEND_PROXY_BLOCKED: Vite 开发服务器只允许代理本机后端，请使用 VITE_ENV=local。');
}

export function createLocalBackendProxy(): Record<string, ProxyOptions> {
  return {
    '^/api(?:/|$)': {
      target: LOCAL_VITE_BACKEND_TARGET,
      changeOrigin: true,
      rewrite: (path: string) => path.replace(/^\/api/, ''),
    },
    '^/uploads(?:/|$)': {
      target: PUBLIC_UPLOAD_ORIGIN,
      changeOrigin: true,
      bypass: (req) => (isPublicUploadReadMethod(req.method) ? undefined : false),
      configure: (proxy) => {
        proxy.on('proxyReq', stripPublicUploadRequestCredentials);
        proxy.on('proxyRes', stripPublicUploadResponseCookies);
      },
    },
    '/realtime/chat': {
      target: LOCAL_VITE_BACKEND_TARGET,
      changeOrigin: false,
      ws: true,
    },
    '/realtime/notifications': {
      target: LOCAL_VITE_BACKEND_TARGET,
      changeOrigin: false,
      ws: true,
    },
  };
}
