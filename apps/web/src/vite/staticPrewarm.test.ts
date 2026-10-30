// @vitest-environment node
import { describe, expect, it } from 'vitest';
import type { OutputBundle } from 'rollup';
import { buildPrewarmManifest, publicArtworkDisplayPath, publicArtworkPaths } from './staticPrewarm';

describe('构建预热清单', () => {
  it('沿静态依赖与样式收集，不展开动态模块或 WASM', () => {
    const chunk = (fileName: string, module: string, imports: string[] = [], dynamicImports: string[] = []) => ({
      type: 'chunk',
      fileName,
      code: 'export default 1;',
      moduleIds: ['/project/src/' + module],
      imports,
      dynamicImports,
      isEntry: fileName === 'assets/main.js',
      viteMetadata: { importedCss: new Set(['assets/editor.css']) },
    });
    const bundle = {
      'assets/main.js': chunk('assets/main.js', 'main.ts'),
      'assets/editor.js': chunk(
        'assets/editor.js',
        'components/noteLibrary/detail/TinyMceEditorRuntime.vue',
        ['assets/shared.js'],
        ['assets/optional.js'],
      ),
      'assets/shared.js': chunk('assets/shared.js', 'shared.ts'),
      'assets/optional.js': chunk('assets/optional.js', 'optional.ts'),
      'assets/editor.css': { type: 'asset', source: 'body{}' },
      'assets/db.wasm': { type: 'asset', source: new Uint8Array(10) },
    } as unknown as OutputBundle;
    const manifest = buildPrewarmManifest(bundle);
    expect(manifest.entries).toEqual(['/assets/main.js']);
    expect(manifest.groups['editor.html']).toEqual(['/assets/editor.js', '/assets/shared.js', '/assets/editor.css']);
    expect(manifest.assets['/assets/db.wasm']).toBeUndefined();
    // 动态模块不进入运行时分组，只由全部代码分片在 Service Worker 接管后补齐。
    expect(Object.values(manifest.groups).filter((urls) => urls.includes('/assets/optional.js'))).toEqual([
      manifest.groups['code.1'],
    ]);
    expect(manifest.groups['code.1']).toEqual([
      '/assets/editor.css',
      '/assets/editor.js',
      '/assets/main.js',
      '/assets/optional.js',
      '/assets/shared.js',
    ]);
    expect(manifest.groups['code.2']).toEqual([]);
  });
  it('公共图片只包含运行资源，历史贴图、原稿和安装包不进入副本', () => {
    const paths = publicArtworkPaths();
    expect(paths.some((url) => url.includes('paper-spirit-v3/'))).toBe(true);
    expect(paths.some((url) => /masters|downloads|paper-spirit-v[12]\//.test(url))).toBe(false);
    expect(paths.every((url) => /\.(png|webp)$/.test(url))).toBe(true);
  });
  it('聊天表情保留 PNG 规范地址，展示副本全部使用压缩后的 WebP', () => {
    const chatPaths = publicArtworkPaths().filter((url) => url.startsWith('/community-chat/'));
    expect(chatPaths.length).toBeGreaterThan(0);
    for (const url of chatPaths) {
      expect(url.endsWith('.png')).toBe(true);
      expect(publicArtworkDisplayPath(url)).toBe(url.replace(/\.png$/, '.webp'));
    }
    expect(publicArtworkDisplayPath('/brand-scenes/missing.png')).toBe('/brand-scenes/missing.png');
  });
});

it('庄园启动代码优先于场景和设施素材', () => {
  const urls = [
    '/manor/scene.webp',
    '/manor/decor.webp',
    '/manor/runtime.js?v=1234567890abcdef',
    '/manor/runtime.css?v=1234567890abcdef',
  ];
  const bundle = Object.fromEntries(urls.map((url) => [url.split('?')[0].slice(1), { type: 'asset', source: 'abc' }]));
  bundle['manor/catalog.webp'] = { type: 'asset', source: 'catalog' };
  bundle['manor/preload.json'] = { type: 'asset', source: JSON.stringify({ desktop: urls, desktopCritical: [...urls.slice(2), urls[0]], catalog: ['/manor/catalog.webp'] }) };
  const m = buildPrewarmManifest(bundle as unknown as OutputBundle);
  expect(m.groups['manor.critical'].slice(0, 2)).toEqual(urls.slice(2));
  expect(m.groups['manor.critical']).toContain(urls[0]);
  expect(m.groups['manor.catalog']).toEqual(['/manor/catalog.webp']);
  expect(m.assets['/manor/catalog.webp']).toBe(7);
  expect(m.groups['manor.critical']).not.toContain('/manor/catalog.webp');
});
