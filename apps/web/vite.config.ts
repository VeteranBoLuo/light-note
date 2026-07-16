import { defineConfig, loadEnv } from 'vite';
import vue from '@vitejs/plugin-vue';
import vueJsx from '@vitejs/plugin-vue-jsx';
import Components from 'unplugin-vue-components/vite';
import AutoImport from 'unplugin-auto-import/vite';
import { ElementPlusResolver, AntDesignVueResolver } from 'unplugin-vue-components/resolvers';

import path from 'path';
export default defineConfig(({ mode }) => {
  // 加载环境变量
  const env = loadEnv(mode, process.cwd(), '');
  console.log('env.VITE_ENV', env.VITE_ENV);
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
    // 加载对应的.env文件
    envPrefix: 'VITE_',
    // 根据mode加载不同的.env文件
    envDir: './',
    server: {
      // 读 PORT 环境变量(便于 CI / 多实例 / 预览工具用分配端口);缺省仍用 vite 默认端口
      port: process.env.PORT ? Number(process.env.PORT) : undefined,
      proxy: {
        // 只代理真正的 API 前缀。若使用 `/api` 的普通前缀匹配，移动端路由
        // `/apiLog` 刷新时也会被代理到线上，返回带旧构建哈希的 HTML，随后本地资源 404。
        '^/api(?:/|$)':
          env.VITE_ENV === 'local'
            ? {
                target: 'http://127.0.0.1:9001',
                changeOrigin: true,
                rewrite: (path: string) => path.replace(/^\/api/, ''),
              }
            : {
                target: 'https://boluo66.top',
                changeOrigin: true,
                secure: false,
              },
        // WebSocket 代理
        '/ws': {
          target: 'http://127.0.0.1:3000',
          changeOrigin: true,
          ws: true,
          rewrite: (path: string) => path.replace(/^\/ws/, ''),
        },
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
