import assert from 'node:assert/strict';
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { verifySeoArtifacts } from './verify-seo-artifacts.mjs';

const origin = 'https://boluo66.top';
const pages = [
  { file: '__seo/root/index.html', route: '/', heading: 'hero-title' },
  { file: 'browser-extension/index.html', route: '/browser-extension', heading: 'browser-extension-hero__title' },
  { file: 'download/android/index.html', route: '/download/android', heading: 'dl-hero-title' },
  { file: 'updateLogs/index.html', route: '/updateLogs', heading: 'intro-title' },
];

function fixture(t) {
  const root = mkdtempSync(path.join(tmpdir(), 'lightnote-seo-artifacts-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const dist = path.join(root, 'dist');
  const write = (file, html) => {
    const target = path.join(dist, file);
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, html);
  };
  const spa =
    '<html><head><meta name="robots" content="noindex, nofollow"></head><body><div data-light-note-early-app-entry></div></body></html>';
  write('index.html', spa);
  write('community-chat/index.html', spa);
  write('site.webmanifest', JSON.stringify({ id: '/', start_url: '/app?source=pwa' }));
  write('robots.txt', 'User-agent: *\nDisallow: /api/\n');
  const htmlByFile = {};
  for (const { file, route, heading } of pages) {
    const html = `<html><head>
<title>轻笺 · 随手收</title>
<meta name="robots" content="index, follow">
<link rel="canonical" href="${origin}${route}">
<meta property="og:url" content="${origin}${route}">
<script data-light-note-landing-early-intent="true"></script>
</head><body>
<h1 class="${heading}">轻笺使用指南</h1>
${route === '/' ? '<button data-landing-early-action="primary:landing_primary">开始使用</button><button data-landing-early-action="account:landing_account">登录</button>' : ''}
<p>${'使用轻笺保存网页、笔记和文件，并整理自己的数字资料。'.repeat(40)}</p>
<section class="log-card"><h2>轻笺更新日志</h2><p>更新说明与使用方法。</p></section>
<a href="https://chromewebstore.google.com/detail/hfdpgaiggloacopnkihfkloicjepldig">安装扩展</a>
<div data-light-note-early-app-entry data-visit="ln-mobile-landing-visited"></div>
</body></html>`;
    htmlByFile[file] = html;
    write(file, html);
  }
  return { root, dist, write, htmlByFile };
}

test('四个公共页面正文、索引指令与 canonical 均正确时完成 SEO 验收', async (t) => {
  const f = fixture(t);
  // 捕获并核对诊断输出，避免 Node 22 测试进程的非 ASCII stdout 解析缺陷。
  const log = t.mock.method(console, 'log', () => {});
  assert.deepEqual(await verifySeoArtifacts({ dist: f.dist, skipPrerender: false }), { complete: true });
  assert.equal(log.mock.callCount(), 1);
  assert.match(log.mock.calls[0].arguments[0], /^✅ 完整 SEO 产物校验通过：/u);
});

test('根官网缺少接管前点击记录脚本时拒绝完整验收', async (t) => {
  const f = fixture(t);
  const file = '__seo/root/index.html';
  f.write(file, f.htmlByFile[file].replace(' data-light-note-landing-early-intent="true"', ''));
  await assert.rejects(verifySeoArtifacts({ dist: f.dist, skipPrerender: false }), {
    message: '根官网缺少接管前主按钮点击记录',
  });
});

for (const action of ['primary:landing_primary', 'account:landing_account']) {
  test(`根官网缺少 ${action} 接管前点击标记时拒绝完整验收`, async (t) => {
    const f = fixture(t);
    const file = '__seo/root/index.html';
    f.write(file, f.htmlByFile[file].replace(` data-landing-early-action="${action}"`, ''));
    await assert.rejects(verifySeoArtifacts({ dist: f.dist, skipPrerender: false }), {
      message: `根官网首屏主按钮缺少接管前点击标记：${action}`,
    });
  });
}

for (const page of pages) {
  for (const scenario of ['缺失', '空壳', '禁止索引', '错误 canonical']) {
    test(`${page.route} 产物${scenario}时拒绝完整验收`, async (t) => {
      const f = fixture(t);
      const original = f.htmlByFile[page.file];
      if (scenario === '缺失') rmSync(path.join(f.dist, page.file));
      if (scenario === '空壳')
        f.write(page.file, original.replace(/<body>[\s\S]*<\/body>/i, '<body><div id="app"></div></body>'));
      if (scenario === '禁止索引') f.write(page.file, original.replace('index, follow', 'noindex, nofollow'));
      if (scenario === '错误 canonical')
        f.write(
          page.file,
          original.replace(
            `rel="canonical" href="${origin}${page.route}"`,
            'rel="canonical" href="https://other.example/"',
          ),
        );
      await assert.rejects(verifySeoArtifacts({ dist: f.dist, skipPrerender: false }));
    });
  }
}

test('CI/debug 跳过只返回基础检查状态，同一产物不能通过完整 SEO 验收', async (t) => {
  const f = fixture(t);
  const log = t.mock.method(console, 'log', () => {});
  for (const { file } of pages) rmSync(path.join(f.dist, file));
  assert.deepEqual(await verifySeoArtifacts({ dist: f.dist, skipPrerender: true }), { complete: false });
  await assert.rejects(verifySeoArtifacts({ dist: f.dist, skipPrerender: false }));
  assert.equal(log.mock.callCount(), 1);
  assert.match(log.mock.calls[0].arguments[0], /^⏭\s+SKIP_PRERENDER=1：.*未完成生产 SEO 验收$/u);
});

test('命令行在 Android 产物缺失时以失败退出，阻断后续发布流程', (t) => {
  const f = fixture(t);
  rmSync(path.join(f.dist, 'download/android/index.html'));
  const scripts = path.join(f.root, 'scripts');
  mkdirSync(scripts);
  const script = path.join(scripts, 'verify-seo-artifacts.mjs');
  copyFileSync(fileURLToPath(new URL('./verify-seo-artifacts.mjs', import.meta.url)), script);
  const result = spawnSync(process.execPath, [script], {
    encoding: 'utf8',
    env: { ...process.env, SKIP_PRERENDER: '0' },
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /缺少 Android 下载 SEO 产物/);
});
