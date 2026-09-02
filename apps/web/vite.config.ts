import { defineConfig, loadEnv } from 'vite';
import vue from '@vitejs/plugin-vue';
import vueJsx from '@vitejs/plugin-vue-jsx';
import Components from 'unplugin-vue-components/vite';
import AutoImport from 'unplugin-auto-import/vite';
import { ElementPlusResolver, AntDesignVueResolver } from 'unplugin-vue-components/resolvers';
import androidColorMixFallback from './src/vite/androidColorMixFallback';
import androidFontWeightFallback from './src/vite/androidFontWeightFallback';
import dynamicViewportFallback from './src/vite/dynamicViewportFallback';
import earlyAppEntryBootstrap from './src/vite/earlyAppEntryBootstrap';
import { assertLocalViteBackend, createLocalBackendProxy } from './src/vite/localBackendProxy';
import seoPreviewRoutes from './src/vite/seoPreviewRoutes';

import path from 'path';
export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  // 构建产物在生产域名下直接走同源请求；Vite serve 只允许连接本机后端，
  // 避免缺失或误配 .env 时把调试请求、游客在线状态写入生产运行时。
  if (command === 'serve') assertLocalViteBackend(env.VITE_ENV);
  return {
    esbuild: {
      pure: ['console.log'], // 构建时删除 console.log
      drop: ['debugger'], // 构建时删除 debugger
    },
    build: {
      outDir: 'dist', // D:\nginx-1.24.0\html\dist
      sourcemap: false, // 默认就是false
    },
    plugins: [
      earlyAppEntryBootstrap(),
      seoPreviewRoutes(),
      vue(),
      vueJsx(),
      Components({
        dirs: ['src/components/base/*'],
        directoryAsNamespace: true,
        deep: true,
        resolvers: [ElementPlusResolver(), AntDesignVueResolver({ importStyle: 'less' })],
      }),
      AutoImport({
        imports: [
          {
            'vue-i18n': ['useI18n'],
          },
        ],
      }),
    ],
    css: {
      postcss: {
        plugins: [androidColorMixFallback(), androidFontWeightFallback(), dynamicViewportFallback()],
      },
    },
    envPrefix: 'VITE_',
    envDir: './',
    server: {
      // 读 PORT 环境变量(便于 CI / 多实例 / 预览工具用分配端口);缺省仍用 vite 默认端口
      port: process.env.PORT ? Number(process.env.PORT) : undefined,
      proxy: {
        ...createLocalBackendProxy(),
        '/obs': {
          target: 'https://obs.cn-south-1.myhuaweicloud.com',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/obs/, ''),
          // 可能需要配置secure，如果遇到证书问题可尝试设置为false
          // secure: false,
        },
      },
      open: true,
    },
    resolve: {
      alias: [
        { find: '@', replacement: path.resolve(__dirname, 'src') },
        { find: 'assets', replacement: path.resolve(__dirname, 'src/assets') },
      ],
    },
  };
});
