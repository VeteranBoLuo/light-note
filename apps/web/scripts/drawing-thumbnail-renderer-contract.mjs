import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';

const WEB_ROOT = fileURLToPath(new URL('../', import.meta.url));
const REPOSITORY_ROOT = path.resolve(WEB_ROOT, '../..');
const MANIFEST_PATH = path.join(WEB_ROOT, 'scripts/drawing-thumbnail-renderer-contract.json');
const SHARED_PROTOCOL_PATH = path.join(REPOSITORY_ROOT, 'packages/shared/drawingNote.js');

// 只覆盖会改变缩略图像素结果的渲染入口及其依赖，不绑定整站构建哈希。
// 新增像素级依赖时必须加入这里；检查使用编译后的 JS，注释和格式化不会触发版本升级。
export const DRAWING_THUMBNAIL_RENDERER_SOURCES = Object.freeze([
  'apps/web/src/utils/drawingThumbnail.ts',
  'apps/web/src/utils/drawingStroke.ts',
  'apps/web/src/utils/drawingShape.ts',
  'apps/web/src/utils/drawingFill.ts',
  'apps/web/src/utils/drawingMask.ts',
  'packages/shared/drawingNote.js',
]);

function normalizedRendererSource(fileName, source) {
  const withoutVersionValue = source.replace(
    /export const DRAWING_THUMBNAIL_RENDERER_VERSION\s*=\s*\d+\s*;/u,
    'export const DRAWING_THUMBNAIL_RENDERER_VERSION = __RENDERER_VERSION__;',
  );
  return ts.transpileModule(withoutVersionValue, {
    fileName,
    compilerOptions: {
      allowJs: true,
      module: ts.ModuleKind.ESNext,
      removeComments: true,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
}

export async function calculateDrawingThumbnailRendererFingerprint() {
  const hash = createHash('sha256');
  for (const relativePath of DRAWING_THUMBNAIL_RENDERER_SOURCES) {
    const absolutePath = path.join(REPOSITORY_ROOT, relativePath);
    const source = await fs.readFile(absolutePath, 'utf8');
    hash.update(relativePath);
    hash.update('\0');
    hash.update(normalizedRendererSource(relativePath, source));
    hash.update('\0');
  }
  return `sha256:${hash.digest('hex')}`;
}

export async function readDrawingThumbnailRendererVersion() {
  const source = await fs.readFile(SHARED_PROTOCOL_PATH, 'utf8');
  const match = /export const DRAWING_THUMBNAIL_RENDERER_VERSION\s*=\s*(\d+)\s*;/u.exec(source);
  const version = Number(match?.[1]);
  if (!Number.isSafeInteger(version) || version < 1) {
    throw new Error('无法读取 DRAWING_THUMBNAIL_RENDERER_VERSION');
  }
  return version;
}

export async function verifyDrawingThumbnailRendererContract() {
  const manifest = JSON.parse(await fs.readFile(MANIFEST_PATH, 'utf8'));
  const rendererVersion = await readDrawingThumbnailRendererVersion();
  const fingerprint = await calculateDrawingThumbnailRendererFingerprint();
  if (manifest.rendererVersion !== rendererVersion) {
    throw new Error(
      `缩略图渲染器版本不一致：共享协议为 v${rendererVersion}，门禁清单为 v${manifest.rendererVersion}`,
    );
  }
  if (manifest.fingerprint !== fingerprint) {
    throw new Error(
      [
        `缩略图像素渲染依赖已变化，但 v${rendererVersion} 的指纹未更新。`,
        '若像素结果会变化，请提升 DRAWING_THUMBNAIL_RENDERER_VERSION 并登记新指纹；',
        '若确认像素完全等价，请在评审说明中记录依据后更新指纹。',
        `当前指纹：${fingerprint}`,
      ].join('\n'),
    );
  }
  return { rendererVersion, fingerprint };
}

const isDirectRun = process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
if (isDirectRun) {
  verifyDrawingThumbnailRendererContract()
    .then(({ rendererVersion, fingerprint }) => {
      console.log(`[drawing-thumbnail-renderer] v${rendererVersion} ${fingerprint}`);
    })
    .catch((error) => {
      console.error(`[drawing-thumbnail-renderer] ${String(error?.message || error)}`);
      process.exitCode = 1;
    });
}
