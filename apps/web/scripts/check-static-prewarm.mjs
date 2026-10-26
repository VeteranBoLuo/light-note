import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdtemp, stat, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';
import { chromium } from 'playwright-core';

// A production-built, isolated fixture. Never visits the real API or logged-in account.
const root = fileURLToPath(new URL('../', import.meta.url));
const output = await mkdtemp(path.join(tmpdir(), 'lightnote-prewarm-'));
const dist = path.join(output, 'dist');
await build({
  root,
  configFile: path.join(root, 'vite.config.ts'),
  logLevel: 'error',
  build: {
    outDir: dist,
    emptyOutDir: true,
    copyPublicDir: false,
    reportCompressedSize: false,
    rollupOptions: { input: path.join(root, 'e2e/static-prewarm.html') },
  },
});
const payload = Buffer.from('window.__prewarmExecuted = true;\n//' + 'x'.repeat(512 * 1024));
const foreground = Buffer.from('export const ready = true;\n//' + 'y'.repeat(32 * 1024));
const manifest = JSON.parse(await readFile(path.join(dist, 'static-prewarm.json'), 'utf8'));
manifest.assets['/assets/prewarm-payload.js'] = payload.length;
const requests = [];
const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1');
  const record = { path: url.pathname, bytes: 0, completed: false, closed: false };
  requests.push(record);
  res.on('finish', () => {
    record.completed = true;
  });
  res.on('close', () => {
    record.closed = true;
  });
  res.setHeader('Cache-Control', /^\/(assets|manor)\//.test(url.pathname) ? 'max-age=31536000' : 'no-store');
  if (url.pathname === '/static-prewarm.json') {
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(manifest));
    return;
  }
  if (url.pathname === '/assets/prewarm-payload.js' || url.pathname === '/assets/foreground-test.js') {
    const body = url.pathname.includes('prewarm-payload') ? payload : foreground;
    res.setHeader('Content-Type', 'application/javascript');
    res.setHeader('Content-Length', body.length);
    let offset = 0;
    const send = () => {
      if (res.destroyed) return;
      const chunk = body.subarray(offset, offset + 8192);
      offset += chunk.length;
      record.bytes += chunk.length;
      res.write(chunk);
      if (offset >= body.length) res.end();
      else setTimeout(send, 15);
    };
    send();
    return;
  }
  try {
    let file = path.join(dist, decodeURIComponent(url.pathname));
    if (!file.startsWith(dist + path.sep)) throw Error('not found');
    if (url.pathname.startsWith('/manor/') && !(await stat(file).catch(() => null))?.isFile()) {
      file = path.join(root, 'public', decodeURIComponent(url.pathname));
      if (!file.startsWith(path.join(root, 'public/manor') + path.sep)) throw Error('not found');
    }
    if (!(await stat(file)).isFile()) throw Error('not found');
    res.setHeader(
      'Content-Type',
      {
        '.html': 'text/html',
        '.js': 'application/javascript',
        '.css': 'text/css',
        '.webp': 'image/webp',
        '.png': 'image/png',
      }[path.extname(file)] || 'application/octet-stream',
    );
    res.end(await readFile(file));
  } catch {
    res.statusCode = 404;
    res.end();
  }
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const results = { comparisons: [], visual: [], cache: false, manorCache: false, paperCache: false };
const images = path.join(output, 'screenshots');
await mkdir(images);
async function pageFor(query = '', mobile = false) {
  const context = await browser.newContext({
    viewport: mobile ? { width: 390, height: 844 } : { width: 1280, height: 900 },
  });
  const page = await context.newPage();
  await page.addInitScript(() => {
    performance.setResourceTimingBufferSize(3000);
    const connection = new EventTarget();
    connection.effectiveType = '4g';
    connection.saveData = false;
    Object.defineProperty(navigator, 'connection', { value: connection, configurable: true });
  });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(`${origin}/e2e/static-prewarm.html?${query}`, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => Boolean(window.__staticPrewarmHarness));
  await page.waitForFunction(() =>
    [...document.querySelectorAll('#public-artwork img')].every((image) => image.complete && image.naturalWidth > 0),
  );
  assert.equal(await page.locator('#public-artwork img').count(), 3);
  assert(
    await page
      .locator('#public-artwork img')
      .evaluateAll((images) => images.every((image) => new URL(image.src).pathname.startsWith('/assets/'))),
    'display must use the same hashed image URLs as prewarming',
  );
  assert.deepEqual(errors, []);
  return { page, context, errors };
}
try {
  // Complete byte-only download, then prove native HTTP-cache reuse by a real module load.
  const { page, context } = await pageFor();
  await page.evaluate(() => window.__staticPrewarmHarness.start());
  await page.waitForFunction(
    () =>
      performance.getEntriesByType('resource').some((entry) => entry.name.endsWith('/assets/prewarm-payload.js')) &&
      !window.__staticPrewarmHarness.snapshot().fetching,
  );
  assert.equal(await page.evaluate(() => window.__prewarmExecuted), undefined);
  const count = requests.filter((item) => item.path === '/assets/prewarm-payload.js').length;
  await page.evaluate(async () => {
    await import('/assets/prewarm-payload.js');
  });
  assert.equal(await page.evaluate(() => window.__prewarmExecuted), true);
  assert.equal(requests.filter((item) => item.path === '/assets/prewarm-payload.js').length, count);
  results.cache = true;
  await context.close();

  // The same selection used by App must warm paper-spirit images before chat opens.
  {
    const { page, context } = await pageFor();
    const urls = await page.evaluate(() => window.__staticPrewarmHarness.warmChatFirstScreen());
    assert.equal(urls.length, 8);
    await page.waitForFunction(
      (urls) =>
        urls.every((url) =>
          performance.getEntriesByName(new URL(url, location.origin).href).some((entry) => entry.decodedBodySize > 0),
        ),
      urls,
    );
    const target = urls[2];
    assert(
      await page.evaluate(
        (url) =>
          performance
            .getEntriesByName(new URL(url, location.origin).href)
            .some((entry) => entry.initiatorType === 'fetch'),
        target,
      ),
    );
    const before = requests.filter((item) => item.path === target).length;
    assert.equal(before, 1, 'paper-spirit first screen must be prefetched');
    await page.evaluate(async (url) => {
      const image = new Image();
      image.src = url;
      await image.decode();
    }, target);
    assert.equal(
      requests.filter((item) => item.path === target).length,
      before,
      'paper-spirit display must reuse HTTP cache',
    );
    results.paperCache = true;
    await context.close();
  }

  // Generated manor boot code and the actual display-sized scene must both reuse native cache.
  {
    const { page, context } = await pageFor();
    await page.evaluate(() => window.__staticPrewarmHarness.warmManor());
    await page.waitForFunction(() => window.__staticPrewarmHarness.snapshot().reason === 'complete', null, {
      timeout: 60000,
    });
    const scene = manifest.manorScene.find((item) => item.width >= 1280).url;
    const runtime = manifest.groups['manor.critical'].find((url) => /runtime\.js\?/.test(url));
    for (const target of [scene, runtime]) {
      assert(
        await page.evaluate(
          (url) =>
            performance
              .getEntriesByName(new URL(url, location.origin).href)
              .some((entry) => entry.initiatorType === 'fetch' && entry.decodedBodySize > 0),
          target,
        ),
      );
      const requestPath = new URL(target, origin).pathname;
      const count = requests.filter((item) => item.path === requestPath).length;
      await page.evaluate(async (url) => {
        if (url.includes('.js?')) await (await fetch(url)).arrayBuffer();
        else {
          const image = new Image();
          image.src = url;
          await image.decode();
        }
      }, target);
      assert.equal(
        requests.filter((item) => item.path === requestPath).length,
        count,
        'manor display must reuse cache',
      );
    }
    assert.equal(
      await page.evaluate(() => typeof window.FARM_CAL),
      'undefined',
      'prewarming must not execute the manor',
    );
    results.manorCache = true;
    await context.close();
  }

  for (const mobile of [false, true]) {
    const baseline = [],
      warming = [];
    for (let index = 0; index < 10; index++) {
      for (const warm of [false, true]) {
        const { page, context } = await pageFor(mobile ? 'renderProfile=mobile' : '', mobile);
        const cdp = await context.newCDPSession(page);
        await cdp.send('Network.enable');
        await cdp.send('Network.emulateNetworkConditions', {
          offline: false,
          latency: 80,
          downloadThroughput: 200 * 1024,
          uploadThroughput: 200 * 1024,
        });
        let request;
        if (warm) {
          const before = requests.length;
          await page.evaluate(() => window.__staticPrewarmHarness.start());
          await page.waitForFunction(() => window.__staticPrewarmHarness.snapshot().fetching);
          for (let attempt = 0; attempt < 100 && !request; attempt++) {
            request = requests.slice(before).find((item) => item.path === '/assets/prewarm-payload.js');
            if (!request) await new Promise((resolve) => setTimeout(resolve, 20));
          }
          assert(request, 'background resource must start');
          assert(!request.completed, 'must interrupt an in-flight download');
        }
        await page.locator('#navigate').click();
        await page.waitForFunction(() => document.querySelector('#elapsed').dataset.loaded === 'true');
        const elapsed = Number(await page.locator('#elapsed').textContent());
        (warm ? warming : baseline).push(elapsed);
        if (request) {
          await page.waitForFunction(() => !window.__staticPrewarmHarness.snapshot().fetching);
          for (let attempt = 0; attempt < 20 && !request.closed; attempt++)
            await new Promise((resolve) => setTimeout(resolve, 20));
          assert(request.closed && !request.completed, 'navigation must cancel the background transfer');
        }
        await context.close();
      }
    }
    const metric = (values, p) => [...values].sort((a, b) => a - b)[Math.ceil(values.length * p) - 1];
    for (const p of [0.5, 0.95]) {
      const normal = metric(baseline, p),
        warm = metric(warming, p);
      assert(warm - normal <= Math.max(100, normal * 0.1), `foreground latency regression: ${normal} -> ${warm}`);
    }
    results.comparisons.push({ mobile, baseline, warming });
  }
  for (const mobile of [false, true])
    for (const theme of ['day', 'night'])
      for (const density of mobile ? ['standard'] : ['compact', 'standard', 'comfortable']) {
        const query = new URLSearchParams({ theme, density, ...(mobile ? { renderProfile: 'mobile' } : {}) });
        const { page, context, errors } = await pageFor(query.toString(), mobile);
        const initial = await page.locator('#frames .avatar-frame__canvas').count();
        assert(initial > 0 && initial < 20, 'offscreen frames should not all mount their artwork');
        await page.screenshot({ path: path.join(images, `${mobile ? 'mobile' : 'desktop'}-${theme}-${density}.png`) });
        const lastFrame = page.locator('#frames [data-frame]').last();
        await lastFrame.scrollIntoViewIfNeeded();
        await lastFrame.locator('.avatar-frame__canvas--front').waitFor();
        await page.waitForFunction(() =>
          [...document.querySelectorAll('#frames [data-frame]:last-child img')].every(
            (image) => image.complete && image.naturalWidth > 0,
          ),
        );
        await page.screenshot({
          path: path.join(images, `${mobile ? 'mobile' : 'desktop'}-${theme}-${density}-last.png`),
        });
        assert.deepEqual(errors, []);
        results.visual.push({ mobile, theme, density, initialCanvases: initial });
        await context.close();
      }
  assert(!requests.some((item) => item.path.startsWith('/api/')), 'fixture must not call an account API');
  await writeFile(path.join(output, 'results.json'), JSON.stringify(results, null, 2));
  console.log(
    JSON.stringify({
      output,
      cache: results.cache,
      paperCache: results.paperCache,
      manorCache: results.manorCache,
      visualCases: results.visual.length,
      comparisons: results.comparisons.map((item) => ({
        mobile: item.mobile,
        medianBaseline: [...item.baseline].sort((a, b) => a - b)[4],
        medianWarming: [...item.warming].sort((a, b) => a - b)[4],
      })),
    }),
  );
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
