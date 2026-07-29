import { createReadStream, existsSync } from 'node:fs';
import path from 'node:path';
import type { Plugin } from 'vite';

/**
 * 让 `vite preview` 复现线上 nginx 的两个 SEO 精确路由：
 * - `/` 读取独立的可索引预渲染首页；
 * - `/landing` 永久重定向到规范根地址。
 *
 * 其他地址继续交给 Vite 的 SPA fallback，读取保持 noindex 的 dist/index.html。
 */
export default function seoPreviewRoutes(): Plugin {
  return {
    name: 'light-note-seo-preview-routes',
    configurePreviewServer(server) {
      const seoRootFile = path.resolve(process.cwd(), 'dist/__seo/root/index.html');

      server.middlewares.use((req, res, next) => {
        const pathname = new URL(req.url || '/', 'http://127.0.0.1').pathname;
        if (pathname === '/landing') {
          res.statusCode = 301;
          res.setHeader('Location', '/');
          res.end();
          return;
        }
        if (pathname !== '/' || !existsSync(seoRootFile)) {
          next();
          return;
        }

        res.statusCode = 200;
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.setHeader('Cache-Control', 'no-cache');
        createReadStream(seoRootFile).pipe(res);
      });
    },
  };
}
