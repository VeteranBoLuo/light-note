import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.resolve(__dirname, '../dist');
const SITE = 'https://boluo66.top/';

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function findTag(html, pattern, description) {
  const tag = html.match(pattern)?.[0] || '';
  assert(tag, `缺少 ${description}`);
  return tag;
}

function readAttribute(tag, name) {
  return tag.match(new RegExp(`\\b${name}=["']([^"']*)["']`, 'i'))?.[1] || '';
}

function plainText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

async function main() {
  const spaFile = path.join(DIST, 'index.html');
  const rootFile = path.join(DIST, '__seo/root/index.html');
  const legacyLandingFile = path.join(DIST, 'landing/index.html');
  const manifestFile = path.join(DIST, 'site.webmanifest');
  const robotsFile = path.join(DIST, 'robots.txt');

  assert(existsSync(spaFile), '缺少通用 SPA 入口 dist/index.html');
  assert(existsSync(rootFile), '缺少根官网 SEO 产物 dist/__seo/root/index.html');
  assert(!existsSync(legacyLandingFile), '不应继续生成 /landing 独立预渲染页面');

  const [spaHtml, rootHtml, manifestText, robotsText] = await Promise.all([
    readFile(spaFile, 'utf8'),
    readFile(rootFile, 'utf8'),
    readFile(manifestFile, 'utf8'),
    readFile(robotsFile, 'utf8'),
  ]);

  const spaRobots = findTag(
    spaHtml,
    /<meta\b[^>]*name=["']robots["'][^>]*>/i,
    'SPA robots 元标签',
  );
  assert(readAttribute(spaRobots, 'content') === 'noindex, nofollow', '通用 SPA 空壳必须保持 noindex, nofollow');
  assert(!/<link\b[^>]*rel=["']canonical["'][^>]*>/i.test(spaHtml), '通用 SPA 空壳不应声明固定 canonical');

  const rootRobots = findTag(
    rootHtml,
    /<meta\b[^>]*name=["']robots["'][^>]*>/i,
    '根官网 robots 元标签',
  );
  assert(readAttribute(rootRobots, 'content') === 'index, follow', '根官网必须为 index, follow');

  const canonicalTag = findTag(
    rootHtml,
    /<link\b[^>]*rel=["']canonical["'][^>]*>/i,
    '根官网 canonical',
  );
  assert(readAttribute(canonicalTag, 'href') === SITE, '根官网 canonical 必须自引用 https://boluo66.top/');

  const ogUrlTag = findTag(
    rootHtml,
    /<meta\b[^>]*property=["']og:url["'][^>]*>/i,
    '根官网 og:url',
  );
  assert(readAttribute(ogUrlTag, 'content') === SITE, '根官网 og:url 必须指向 https://boluo66.top/');
  assert(/<h1\b[^>]*class=["'][^"']*\bhero-title\b[^"']*["'][^>]*>/i.test(rootHtml), '根官网缺少 hero H1');
  assert(plainText(rootHtml).includes('轻笺'), '根官网正文必须包含品牌词“轻笺”');
  assert(plainText(rootHtml).length >= 500, '根官网正文过短，疑似预渲染空壳');

  const manifest = JSON.parse(manifestText);
  assert(manifest.id === '/', 'PWA id 必须保持 /，避免被识别为新的应用');
  assert(manifest.start_url === '/app', 'PWA start_url 必须使用 /app');

  assert(!/^Disallow:\s*\/admin\s*$/imu.test(robotsText), 'robots.txt 不应屏蔽 /admin，否则爬虫看不到 noindex');
  assert(/^Disallow:\s*\/api\/\s*$/imu.test(robotsText), 'robots.txt 必须继续屏蔽 /api/');

  console.log('✅ SEO 产物校验通过：根官网可索引，通用 SPA 保持 noindex，PWA 使用 /app');
}

main().catch((error) => {
  console.error('❌ SEO 产物校验失败:', error.message);
  process.exit(1);
});
