import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import type { Plugin } from 'vite';
import type { OutputAsset, OutputBundle, OutputChunk } from 'rollup';
import {
  CODE_PREWARM_GROUP_SIZE,
  CODE_PREWARM_GROUPS,
  PREWARM_MANIFEST_LIMIT,
  PREWARM_RUNTIME_ENTRIES,
} from '../config/staticPrewarmGroups';
import { COMMUNITY_CHAT_OFFICIAL_STICKERS } from '../../../../packages/shared/communityChatStickers.js';
import { COMMUNITY_CHAT_INLINE_EMOJIS } from '../../../../packages/shared/communityChatInlineEmojis.js';

const publicRoot = fileURLToPath(new URL('../../public/', import.meta.url));
const virtualId = 'virtual:lightnote-public-art';
const sourceSize = (source: string | Uint8Array) =>
  typeof source === 'string' ? Buffer.byteLength(source) : source.byteLength;

export function publicArtworkPaths() {
  function list(directory: string): string[] {
    return readdirSync(path.join(publicRoot, directory), { withFileTypes: true }).flatMap((entry) => {
      const file = `${directory}/${entry.name}`;
      return entry.isDirectory() ? list(file) : entry.name.endsWith('.webp') ? [`/${file}`] : [];
    });
  }
  return [
    ...new Set([
      ...list('achievements/enamel'),
      ...readdirSync(path.join(publicRoot, 'brand-scenes'))
        .filter((name) => name.endsWith('.webp'))
        .map((name) => `/brand-scenes/${name}`),
      ...COMMUNITY_CHAT_OFFICIAL_STICKERS.map((item) => item.assetPath),
      ...COMMUNITY_CHAT_INLINE_EMOJIS.map((item) => item.assetPath),
    ]),
  ];
}

// 聊天表情的规范地址仍是 PNG（消息与共享协议引用它）；同名 WebP 存在时，展示与预热改用这份按显示尺寸压缩的副本。
export function publicArtworkDisplayPath(url: string) {
  if (!url.endsWith('.png')) return url;
  const webp = url.slice(0, -'.png'.length) + '.webp';
  return existsSync(path.join(publicRoot, webp)) ? webp : url;
}

/** Public canonical URLs remain available to old clients; new rendering and prewarming use the same hashed copy. */
export function publicArtworkPlugin(): Plugin {
  let building = false;
  const artworkRefs = new Set<string>();
  return {
    name: 'lightnote-public-art',
    configResolved(config) {
      building = config.command === 'build';
    },
    resolveId(id) {
      if (id === virtualId) return '\0' + virtualId;
    },
    load(id) {
      if (id !== '\0' + virtualId) return;
      const fields = publicArtworkPaths().map((url) => {
        const displayPath = publicArtworkDisplayPath(url);
        const file = path.join(publicRoot, displayPath);
        this.addWatchFile(file);
        if (!building) return `${JSON.stringify(url)}:${JSON.stringify(displayPath)}`;
        const ref = this.emitFile({ type: 'asset', name: path.basename(file), source: readFileSync(file) });
        artworkRefs.add(ref);
        return `${JSON.stringify(url)}:import.meta.ROLLUP_FILE_URL_${ref}`;
      });
      return `export default {${fields.join(',')}};`;
    },
    resolveFileUrl({ referenceId, fileName }) {
      if (artworkRefs.has(referenceId)) return JSON.stringify('/' + fileName);
    },
  };
}

export function buildPrewarmManifest(bundle: OutputBundle) {
  const assets: Record<string, number> = {};
  const groups: Record<string, string[]> = {};
  const maxBytes = 4 * 1024 * 1024;
  for (const [file, item] of Object.entries(bundle)) {
    if (!file.startsWith('assets/') || !/\.(js|mjs|css|webp|png|jpg|jpeg|svg|woff2?|ttf)$/.test(file)) continue;
    const bytes = item.type === 'asset' ? sourceSize(item.source) : Buffer.byteLength(item.code);
    if (bytes > 0 && bytes <= maxBytes) assets['/' + file] = bytes;
  }
  const chunks = Object.values(bundle).filter((item): item is OutputChunk => item.type === 'chunk');
  for (const [group, module] of Object.entries(PREWARM_RUNTIME_ENTRIES)) {
    const root = chunks.find((chunk) =>
      chunk.moduleIds.some((id) => id.replaceAll('\\', '/').endsWith('/src/' + module)),
    );
    if (!root) continue;
    const files = new Set<string>();
    function visit(file: string) {
      if (files.has(file)) return;
      files.add(file);
      const chunk = bundle[file] as OutputChunk & { viteMetadata?: { importedCss: Set<string> } };
      if (chunk?.type !== 'chunk') return;
      chunk.imports.forEach(visit);
      chunk.viteMetadata?.importedCss.forEach((css) => files.add(css));
    }
    visit(root.fileName);
    groups[group] = [...files].map((file) => '/' + file).filter((url) => assets[url]);
  }
  const manorAsset = bundle['manor/preload.json'] as OutputAsset | undefined;
  let manorScene: Array<{ url: string; width: number }> | undefined;
  if (manorAsset) {
    const manor = JSON.parse(String(manorAsset.source));
    const paths = [
      ...manor.desktop,
      ...(manor.mobile || []),
      ...(manor.catalog || []),
      ...(manor.desktopScene || []).map((item: { url: string }) => item.url),
    ] as string[];
    for (const url of paths) {
      const file = url.split('?')[0];
      if (!file.startsWith('/manor/') || file.includes('..')) throw Error('Invalid manor prewarm asset');
      const item = bundle[file.slice(1)];
      const bytes = item?.type === 'asset' ? sourceSize(item.source) : statSync(path.join(publicRoot, file)).size;
      if (bytes > 0 && bytes <= maxBytes) assets[url] = bytes;
    }
    groups['manor.desktop'] = manor.desktop.filter((url: string) => assets[url]);
    manorScene = manor.desktopScene;
    // Generated beside the actual boot manifest, not inferred from image list positions.
    groups['manor.mobile'] = (manor.mobile || []).filter((url: string) => assets[url]);
    groups['manor.catalog'] = (manor.catalog || []).filter((url: string) => assets[url]);
    groups['manor.mobileCritical'] = (manor.mobileCritical || []).filter((url: string) => assets[url]);
    groups['manor.critical'] = (manor.desktopCritical || []).filter((url: string) => assets[url]);
  }
  const code = Object.keys(assets)
    .filter((url) => url.startsWith('/assets/') && /\.(?:js|mjs|css)$/.test(url))
    .sort();
  if (code.length > CODE_PREWARM_GROUPS.length * CODE_PREWARM_GROUP_SIZE) throw Error('Too many code assets for prewarm shards');
  CODE_PREWARM_GROUPS.forEach((group, index) => {
    groups[group] = code.slice(index * CODE_PREWARM_GROUP_SIZE, (index + 1) * CODE_PREWARM_GROUP_SIZE);
  });
  const selectedCode = new Set(Object.values(groups).flat());
  for (const url of Object.keys(assets)) {
    if (/\.(?:js|mjs|css)(?:\?|$)/.test(url) && !selectedCode.has(url)) delete assets[url];
  }
  return {
    version: 1 as const,
    entries: chunks.filter((chunk) => chunk.isEntry).map((chunk) => '/' + chunk.fileName),
    assets,
    groups,
    manorScene,
  };
}

export default function staticPrewarmManifestPlugin(): Plugin {
  return {
    name: 'lightnote-static-prewarm-manifest',
    apply: 'build',
    generateBundle: {
      order: 'post',
      handler(_options, bundle) {
        const manifest = buildPrewarmManifest(bundle);
        const source = JSON.stringify(manifest);
        if (Buffer.byteLength(source) > PREWARM_MANIFEST_LIMIT) this.error('static-prewarm.json exceeds the runtime limit');
        this.emitFile({ type: 'asset', fileName: 'static-prewarm.json', source });
        const rows = Object.entries(manifest.groups).map(
          ([group, urls]) => `${group}\t${urls.length}\t${urls.reduce((sum, url) => sum + manifest.assets[url], 0)}`,
        );
        this.emitFile({
          type: 'asset',
          fileName: '.lightnote-prewarm-report.tsv',
          source: 'group\tfiles\tbytes\n' + rows.join('\n') + '\n',
        });
      },
    },
  };
}
