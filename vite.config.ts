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
      outDir: 'D:\\nginx-1.24.0\\html\\dist',
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
      proxy: {
        '/api':
          env.VITE_ENV === 'local1'
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
