import { copyFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.resolve(__dirname, '../dist');

// Vite public 目录中的同名静态资源目录会优先于 nginx 的 SPA fallback。
// 这些路由必须在真实目录内保留入口，避免刷新时因目录无 index.html 返回 403。
const STATIC_DIRECTORY_SPA_ROUTES = Object.freeze(['/community-chat']);

async function main() {
  const spaEntry = path.join(DIST, 'index.html');

  for (const route of STATIC_DIRECTORY_SPA_ROUTES) {
    const relativeRoute = route.replace(/^\/+|\/+$/g, '');
    if (!relativeRoute || relativeRoute.includes('..')) {
      throw new Error(`非法 SPA 回退路由：${route}`);
    }

    const routeEntry = path.join(DIST, relativeRoute, 'index.html');
    await mkdir(path.dirname(routeEntry), { recursive: true });
    await copyFile(spaEntry, routeEntry);
    console.log(`✅  SPA 目录回退已生成：dist/${relativeRoute}/index.html`);
  }
}

main().catch((error) => {
  console.error('❌ SPA 目录回退生成失败:', error.message);
  process.exit(1);
});
