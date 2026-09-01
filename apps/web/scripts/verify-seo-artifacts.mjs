import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.resolve(__dirname, '../dist');
const SITE = 'https://boluo66.top/';
const EXTENSION_SITE = 'https://boluo66.top/browser-extension';
const EXTENSION_STORE = 'https://chromewebstore.google.com/detail/hfdpgaiggloacopnkihfkloicjepldig';
const EARLY_APP_ENTRY_MARKER = 'data-light-note-early-app-entry';
const MOBILE_LANDING_VISIT_MARKER = 'ln-mobile-landing-visited';

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
  const communityChatSpaFile = path.join(DIST, 'community-chat/index.html');
  const rootFile = path.join(DIST, '__seo/root/index.html');
  const browserExtensionFile = path.join(DIST, 'browser-extension/index.html');
  const legacyLandingFile = path.join(DIST, 'landing/index.html');
  const manifestFile = path.join(DIST, 'site.webmanifest');
  const robotsFile = path.join(DIST, 'robots.txt');
  const skipPrerender = process.env.SKIP_PRERENDER === '1';

  assert(existsSync(spaFile), '缺少通用 SPA 入口 dist/index.html');
  assert(existsSync(communityChatSpaFile), '缺少聊天室静态目录 SPA 入口 dist/community-chat/index.html');
  assert(!existsSync(legacyLandingFile), '不应继续生成 /landing 独立预渲染页面');

  const [spaHtml, communityChatSpaHtml, manifestText, robotsText] = await Promise.all([
    readFile(spaFile, 'utf8'),
    readFile(communityChatSpaFile, 'utf8'),
    readFile(manifestFile, 'utf8'),
    readFile(robotsFile, 'utf8'),
  ]);

  assert(communityChatSpaHtml === spaHtml, '聊天室静态目录 SPA 入口必须与通用 SPA 入口一致');

  const spaRobots = findTag(spaHtml, /<meta\b[^>]*name=["']robots["'][^>]*>/i, 'SPA robots 元标签');
  assert(readAttribute(spaRobots, 'content') === 'noindex, nofollow', '通用 SPA 空壳必须保持 noindex, nofollow');
  assert(!/<link\b[^>]*rel=["']canonical["'][^>]*>/i.test(spaHtml), '通用 SPA 空壳不应声明固定 canonical');
  assert(spaHtml.includes(EARLY_APP_ENTRY_MARKER), '通用 SPA 缺少移动端首屏前应用入口守卫');

  const manifest = JSON.parse(manifestText);
  assert(manifest.id === '/', 'PWA id 必须保持 /，避免被识别为新的应用');
  assert(manifest.start_url === '/app?source=pwa', 'PWA start_url 必须使用带来源标记的 /app 入口');

  assert(!/^Disallow:\s*\/admin\s*$/imu.test(robotsText), 'robots.txt 不应屏蔽 /admin，否则爬虫看不到 noindex');
  assert(/^Disallow:\s*\/api\/\s*$/imu.test(robotsText), 'robots.txt 必须继续屏蔽 /api/');

  if (skipPrerender) {
    console.log('⏭  SKIP_PRERENDER=1：已校验 SPA/manifest/robots，跳过仅预渲染产物检查');
    return;
  }

  assert(existsSync(rootFile), '缺少根官网 SEO 产物 dist/__seo/root/index.html');
  assert(existsSync(browserExtensionFile), '缺少浏览器扩展 SEO 产物 dist/browser-extension/index.html');
  const [rootHtml, browserExtensionHtml] = await Promise.all([
    readFile(rootFile, 'utf8'),
    readFile(browserExtensionFile, 'utf8'),
  ]);
  const rootRobots = findTag(rootHtml, /<meta\b[^>]*name=["']robots["'][^>]*>/i, '根官网 robots 元标签');
  assert(readAttribute(rootRobots, 'content') === 'index, follow', '根官网必须为 index, follow');

  const canonicalTag = findTag(rootHtml, /<link\b[^>]*rel=["']canonical["'][^>]*>/i, '根官网 canonical');
  assert(readAttribute(canonicalTag, 'href') === SITE, '根官网 canonical 必须自引用 https://boluo66.top/');

  const ogUrlTag = findTag(rootHtml, /<meta\b[^>]*property=["']og:url["'][^>]*>/i, '根官网 og:url');
  assert(readAttribute(ogUrlTag, 'content') === SITE, '根官网 og:url 必须指向 https://boluo66.top/');
  assert(/<h1\b[^>]*class=["'][^"']*\bhero-title\b[^"']*["'][^>]*>/i.test(rootHtml), '根官网缺少 hero H1');
  assert(plainText(rootHtml).includes('轻笺'), '根官网正文必须包含品牌词“轻笺”');
  assert(plainText(rootHtml).length >= 500, '根官网正文过短，疑似预渲染空壳');
  assert(rootHtml.includes(EARLY_APP_ENTRY_MARKER), '根官网缺少移动端首屏前应用入口守卫');
  assert(rootHtml.includes(MOBILE_LANDING_VISIT_MARKER), '根官网入口守卫缺少移动浏览器首访记录');
  assert(!/googlebot|baiduspider|bingbot/i.test(rootHtml), '根官网不得按搜索引擎 UA 分流');

  const extensionRobots = findTag(
    browserExtensionHtml,
    /<meta\b[^>]*name=["']robots["'][^>]*>/i,
    '浏览器扩展页 robots 元标签',
  );
  assert(readAttribute(extensionRobots, 'content') === 'index, follow', '浏览器扩展页必须为 index, follow');
  const extensionCanonical = findTag(
    browserExtensionHtml,
    /<link\b[^>]*rel=["']canonical["'][^>]*>/i,
    '浏览器扩展页 canonical',
  );
  assert(readAttribute(extensionCanonical, 'href') === EXTENSION_SITE, '浏览器扩展页 canonical 必须自引用');
  assert(
    /<h1\b[^>]*class=["'][^"']*\bbrowser-extension-hero__title\b[^"']*["'][^>]*>/i.test(browserExtensionHtml),
    '浏览器扩展页缺少产品 H1',
  );
  assert(plainText(browserExtensionHtml).includes('轻笺 · 随手收'), '浏览器扩展页正文缺少正式产品名');
  assert(browserExtensionHtml.includes(EXTENSION_STORE), '浏览器扩展页缺少 Chrome Web Store 长期链接');
  assert(plainText(browserExtensionHtml).length >= 700, '浏览器扩展页正文过短，疑似预渲染空壳');

  console.log(
    '✅ SEO 产物校验通过：根官网与浏览器扩展页可索引且自引用，通用 SPA 保持 noindex，PWA 使用带来源标记的 /app',
  );
}

main().catch((error) => {
  console.error('❌ SEO 产物校验失败:', error.message);
  process.exit(1);
});
