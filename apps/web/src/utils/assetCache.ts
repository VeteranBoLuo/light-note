const CONTROLLER_WAIT_MS = 15000;
const SYNC_TIMEOUT_MS = 10000;

function waitForController(container: ServiceWorkerContainer, timeoutMs: number) {
  return new Promise<ServiceWorker | null>((resolve) => {
    const finish = () => {
      clearTimeout(timer);
      container.removeEventListener('controllerchange', finish);
      resolve(container.controller);
    };
    const timer = setTimeout(finish, timeoutMs);
    container.addEventListener('controllerchange', finish);
  });
}

/**
 * 让 Service Worker 按线上发布清单保留当前与上一版本的构建资源。
 * 返回页面是否已由开启资源缓存的 Service Worker 接管；只有此时补齐全部代码才会持久保存。
 */
export async function syncServiceWorkerAssets(): Promise<boolean> {
  if (!import.meta.env.PROD || typeof navigator === 'undefined' || !navigator.serviceWorker) return false;
  const container = navigator.serviceWorker;
  // 首次访问时 Service Worker 刚注册，激活后才会接管当前页面。
  const controller = container.controller || (await waitForController(container, CONTROLLER_WAIT_MS));
  if (!controller) return false;
  return new Promise<boolean>((resolve) => {
    const channel = new MessageChannel();
    const timer = setTimeout(() => resolve(false), SYNC_TIMEOUT_MS);
    channel.port1.onmessage = (event) => {
      clearTimeout(timer);
      resolve(event.data?.enabled === true && !event.data?.error);
    };
    controller.postMessage({ type: 'assets.sync' }, [channel.port2]);
  });
}
