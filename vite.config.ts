import { defineConfig, loadEnv } from 'vite';
import vue from '@vitejs/plugin-vue';
import vueJsx from '@vitejs/plugin-vue-jsx';
import Components from 'unplugin-vue-components/vite';
import AutoImport from 'unplugin-auto-import/vite';
import { ElementPlusResolver, AntDesignVueResolver } from 'unplugin-vue-components/resolvers';
import { viteStaticCopy } from 'vite-plugin-static-copy';

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
      viteStaticCopy({
        targets: [
          {
            src: 'node_modules/tinymce/skins',
            dest: 'tinymce',
          },
          {
            src: 'node_modules/tinymce/plugins/emoticons/js/emojis.js',
            dest: 'tinymce/plugins/emoticons/js',
          },
          {
            src: 'node_modules/tinymce/langs',
            dest: 'tinymce',
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
