export const LOCAL_VITE_BACKEND_TARGET = 'http://127.0.0.1:9001';

export function assertLocalViteBackend(viteEnv: unknown) {
  const normalized = String(viteEnv || '')
    .trim()
    .toLowerCase();
  if (!normalized || normalized === 'local') return;
  throw new Error(
    'VITE_REMOTE_BACKEND_PROXY_BLOCKED: Vite 开发服务器只允许代理本机后端，请使用 VITE_ENV=local。',
  );
}

export function createLocalBackendProxy() {
  return {
    '^/api(?:/|$)': {
      target: LOCAL_VITE_BACKEND_TARGET,
      changeOrigin: true,
      rewrite: (path: string) => path.replace(/^\/api/, ''),
    },
    '/uploads': {
      target: LOCAL_VITE_BACKEND_TARGET,
      changeOrigin: true,
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
