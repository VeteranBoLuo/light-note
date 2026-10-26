// @vitest-environment node
import { describe, expect, it } from 'vitest';
import type { OutputBundle } from 'rollup';
import { buildPrewarmManifest, publicArtworkPaths } from './staticPrewarm';

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
    expect(manifest.assets['/assets/optional.js']).toBeUndefined();
  });
  it('公共图片只包含运行资源，历史贴图、原稿和安装包不进入副本', () => {
    const paths = publicArtworkPaths();
    expect(paths.some((url) => url.includes('paper-spirit-v3/'))).toBe(true);
    expect(paths.some((url) => /masters|downloads|paper-spirit-v[12]\//.test(url))).toBe(false);
    expect(paths.every((url) => /\.(png|webp)$/.test(url))).toBe(true);
  });
});
