/** In-memory UI fixtures; no user files, backend or object storage are touched. */
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, open as openFile, link, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { chromium } from 'playwright-core';
const origin = process.env.LIGHTNOTE_WEB_ORIGIN || 'http://127.0.0.1:5173';
assert(['localhost', '127.0.0.1'].includes(new URL(origin).hostname));
const output = process.env.CLOUD_UPLOAD_TEST_OUTPUT || join(tmpdir(), 'lightnote-cloud-upload');
await mkdir(output, { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
});
const errors = [],
  report = [];
let selectionFixtureDir;
const profiles = [
  ...['day', 'night'].flatMap((theme) =>
    ['small', 'medium', 'large'].map((density) => ({ width: 1440, theme, density })),
  ),
  ...['day', 'night'].map((theme) => ({ width: 390, theme, renderProfile: 'mobile' })),
  { width: 320, theme: 'night', renderProfile: 'mobile', lang: 'en' },
  { width: 390, theme: 'day' },
];
async function open(profile = {}) {
  const page = await browser.newPage({
    viewport: { width: profile.width || 1440, height: 900 },
    hasTouch: (profile.width || 1440) < 768,
    reducedMotion: 'reduce',
  });
  page.setDefaultTimeout(30000);
  page.on('pageerror', (error) => errors.push(error.message));
  const url = new URL('/e2e/cloud-upload.html', origin);
  for (const [key, value] of Object.entries(profile)) url.searchParams.set(key, value);
  await page.goto(url.href);
  await page.waitForFunction(() => window.__cloudUploadFixture);
  return page;
}
async function settled(page, expected) {
  await page.waitForFunction(
    (n) => window.__cloudUploadFixture.controls.confirmed.size === n && !window.__cloudUploadFixture.controls.active,
    expected,
  );
  await page.getByRole('button', { name: /^(重试 |Retry )/ }).waitFor();
}
async function checkSingleFile(profile) {
  const single = await open(profile);
  await single.evaluate(() => {
    window.__cloudUploadFixture.controls.putDelay = 1200;
    void window.__cloudUploadFixture.start(1, ['photo-3.jpg']);
  });
  await single.waitForFunction(() => window.__cloudUploadFixture.controls.active === 1);
  assert.equal(await single.getByRole('progressbar').count(), 1, 'One file has one progress bar');
  const help = single.getByRole('button', { name: /^(上传说明|Upload details)$/ });
  await help.click();
  assert.equal(await help.getAttribute('aria-expanded'), 'true');
  assert.equal(await single.locator('#cloud-upload-help').isVisible(), true);
  await help.press('Enter');
  assert.equal(await help.getAttribute('aria-expanded'), 'false');
  assert.equal(await single.locator('#cloud-upload-help').count(), 0);
  await settled(single, 0);
  assert.equal(await single.getByRole('progressbar').count(), 1, 'Failed single file still has one progress bar');
  const buttons = await single.locator('.upload-actions').getByRole('button').all();
  const first = await buttons[0].boundingBox();
  const second = await buttons[1].boundingBox();
  assert(first.x + first.width < second.x || first.y + first.height < second.y, 'Actions are separated');
  const name = `${profile.width}-${profile.theme}-${profile.density || 'mobile'}-${profile.lang || 'zh'}-${profile.renderProfile || 'auto'}`;
  await single.screenshot({ path: join(output, `${name}-single-failed.png`) });
  await single.evaluate(() => {
    Object.assign(window.__cloudUploadFixture.controls, { fail: false, putDelay: 10 });
  });
  await single.getByRole('button', { name: /^(重试 |Retry )/ }).click();
  await single.getByText(/^(上传完成|Upload complete)$/).waitFor();
  await single
    .getByRole('status')
    .filter({ hasText: /^(已上传 1 个文件|1 file uploaded)$/ })
    .waitFor();
  assert.equal(await single.getByRole('progressbar').count(), 0, 'Completion shows a result instead of progress');
  await single.getByRole('button', { name: /^(收起上传队列|Collapse upload queue)$/ }).click();
  assert.equal(await single.locator('.upload-progress--collapsed .progress-track').count(), 0);
  await single.getByRole('button', { name: /^(展开上传队列|Expand upload queue)$/ }).click();
  assert.equal(await single.getByRole('progressbar').count(), 0);
  await single
    .locator('.upload-progress')
    .getByRole('button', { name: /^(关闭|Close)$/ })
    .click();
  await single.locator('.upload-progress').waitFor({ state: 'hidden' });
  await single.close();
}
try {
  for (const profile of profiles) {
    await checkSingleFile(profile);
    const page = await open(profile);
    await page.evaluate(() => {
      void window.__cloudUploadFixture.start(60);
    });
    await page.locator('.file-status').first().waitFor();
    const name = `${profile.width}-${profile.theme}-${profile.density || 'mobile'}-${profile.lang || 'zh'}-${profile.renderProfile || 'auto'}`;
    await page.screenshot({ path: join(output, `${name}-running.png`) });
    await settled(page, 59);
    assert.equal(await page.locator('.file-progress-item').count(), 1);
    assert.match(await page.locator('.file-status').textContent(), /失败|Failed/);
    const bounds = await page.locator('.upload-progress').boundingBox();
    assert(
      bounds.x >= 0 && bounds.y >= 0 && bounds.x + bounds.width <= profile.width && bounds.y + bounds.height <= 900,
      'Panel stays within viewport',
    );
    assert.equal(await page.locator('.upload-progress').evaluate((el) => el.scrollWidth <= el.clientWidth), true);
    await page.screenshot({ path: join(output, `${name}-failed.png`) });
    await page.evaluate(() => {
      window.__cloudUploadFixture.controls.fail = false;
    });
    await page.getByRole('button', { name: /^(重试 |Retry )/ }).click();
    await page.waitForFunction(() => window.__cloudUploadFixture.controls.confirmed.size === 60);
    await page.getByText(/^(上传完成|Upload complete)$/).waitFor();
    assert.equal(await page.evaluate(() => window.__cloudUploadFixture.controls.puts.length), 61);
    await page.screenshot({ path: join(output, `${name}-done.png`) });
    report.push({ profile, bounds, peak: await page.evaluate(() => window.__cloudUploadFixture.controls.peak) });
    await page.close();
  }
  const page = await open({ controls: '' });
  // 一个稀疏测试文件的硬链接：真实 FileList 与 8MiB 元信息，不复制几千份内容。
  selectionFixtureDir = await mkdtemp(join(tmpdir(), 'lightnote-upload-selection-'));
  const firstPath = join(selectionFixtureDir, 'photo-0.jpg');
  const firstFile = await openFile(firstPath, 'w');
  await firstFile.write('Synthetic upload selection fixture');
  await firstFile.truncate(8 * 1024 * 1024);
  await firstFile.close();
  const filePaths = [firstPath];
  for (let index = 1; index < 3000; index++) {
    const path = join(selectionFixtureDir, `photo-${index}.jpg`);
    await link(firstPath, path);
    filePaths.push(path);
  }
  await page.evaluate(() => {
    Object.assign(window.__cloudUploadFixture.controls, { fail: false, putDelay: 1 });
    window.__cloudUploadFixture.cloud.folder.id = 'album-a';
    const audit = (window.__selectionAudit = { changeAt: 0, paintAt: 0, readers: 0, tasks: [] });
    window.FileReader = new Proxy(window.FileReader, {
      construct(target, args) {
        audit.readers++;
        return Reflect.construct(target, args);
      },
    });
    new PerformanceObserver((list) =>
      audit.tasks.push(...list.getEntries().map((entry) => ({ start: entry.startTime, duration: entry.duration }))),
    ).observe({ type: 'longtask' });
    document.querySelector('input[type=file]').addEventListener(
      'change',
      () => {
        audit.changeAt = performance.now();
        requestAnimationFrame(() =>
          requestAnimationFrame(() => {
            audit.paintAt = performance.now();
          }),
        );
      },
      { capture: true },
    );
  });
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: '上传文件', exact: true }).first().click();
  await (await chooser).setFiles(filePaths);
  await page.waitForFunction(() => window.__cloudUploadFixture.controls.confirmed.size === 3000, null, {
    timeout: 60000,
  });
  await page.getByText('上传完成', { exact: true }).waitFor();
  const result = await page.evaluate(() => {
    const x = window.__cloudUploadFixture.controls;
    const audit = window.__selectionAudit;
    return {
      puts: x.puts.length,
      peak: x.peak,
      batches: x.batches,
      targets: x.targets,
      selection: {
        paintAfterChangeMs: audit.paintAt - audit.changeAt,
        longestAppTaskMs: Math.max(
          0,
          ...audit.tasks.map((task) =>
            task.start + task.duration > audit.changeAt
              ? task.start + task.duration - Math.max(task.start, audit.changeAt)
              : 0,
          ),
        ),
        fileReaders: audit.readers,
        fileBytes: 8 * 1024 * 1024,
      },
    };
  });
  assert.equal(result.puts, 3000);
  assert.equal(result.peak, 3);
  assert(result.batches.every((n) => n <= 20));
  assert(result.targets.every((id) => id === 'album-a'));
  assert.equal(result.selection.fileReaders, 0);
  assert(result.selection.paintAfterChangeMs > 0);
  assert.equal(await page.locator('.file-progress-item').count(), 0);
  await page.screenshot({ path: join(output, '3000-complete.png') });
  await page.close();

  const quota = await open();
  await quota.evaluate(() => {
    window.__cloudUploadFixture.controls.quota = true;
    void window.__cloudUploadFixture.start(60);
  });
  await quota.getByRole('alert').filter({ hasText: '云空间容量不足' }).waitFor();
  assert.equal(await quota.evaluate(() => window.__cloudUploadFixture.controls.puts.length), 0);
  await quota.screenshot({ path: join(output, 'quota.png') });
  await quota.evaluate(() => {
    Object.assign(window.__cloudUploadFixture.controls, { quota: false, fail: false });
  });
  await quota.getByRole('button', { name: /^重试 / }).click();
  await quota.getByText('上传完成', { exact: true }).waitFor();
  await quota.close();

  const cancel = await open();
  await cancel.evaluate(() => {
    window.__cloudUploadFixture.controls.putDelay = 1000;
    void window.__cloudUploadFixture.start(60);
  });
  await cancel.waitForFunction(() => window.__cloudUploadFixture.controls.active === 3);
  await cancel.getByRole('button', { name: '取消上传', exact: true }).click();
  await cancel.getByRole('button', { name: '确定', exact: true }).click();
  await cancel.getByRole('button', { name: /^重试 / }).waitFor();
  assert(await cancel.evaluate(() => window.__cloudUploadFixture.controls.puts.length <= 3));
  await cancel.evaluate(() => {
    Object.assign(window.__cloudUploadFixture.controls, { fail: false, putDelay: 5 });
  });
  await cancel.getByRole('button', { name: /^重试 / }).click();
  await cancel.getByText('上传完成', { exact: true }).waitFor();
  await cancel.close();
  const duplicates = await open();
  await duplicates.evaluate(() => {
    window.__cloudUploadFixture.controls.fail = false;
    void window.__cloudUploadFixture.start(2, ['same.jpg', 'same.jpg']);
  });
  await duplicates.getByText('本次选择或待上传队列中存在同名文件。自动改名后可全部保留，避免照片相互覆盖。').waitFor();
  assert.equal(await duplicates.getByRole('button', { name: '全部覆盖', exact: true }).count(), 0);
  await duplicates.getByRole('button', { name: '全部自动改名', exact: true }).click();
  await duplicates.getByText('上传完成', { exact: true }).waitFor();
  assert.deepEqual(await duplicates.evaluate(() => window.__cloudUploadFixture.controls.puts), [
    'same (1).jpg',
    'same (2).jpg',
  ]);
  await duplicates.close();

  const checkFailure = await open();
  await checkFailure.evaluate(() => {
    window.__cloudUploadFixture.controls.failCheck = true;
    void window.__cloudUploadFixture.start(3);
  });
  await checkFailure.getByText('文件名检查失败，未开始上传，请重试。', { exact: true }).waitFor();
  assert.equal(await checkFailure.evaluate(() => window.__cloudUploadFixture.controls.puts.length), 0);
  await checkFailure.close();

  const changing = await open();
  await changing.evaluate(() => {
    window.__cloudUploadFixture.controls.putDelay = 1000;
    void window.__cloudUploadFixture.start(60);
  });
  await changing.waitForFunction(() => window.__cloudUploadFixture.controls.active === 3);
  await changing.evaluate(() => {
    window.__cloudUploadFixture.user.id = 'another-account';
  });
  await changing.waitForFunction(() => window.__cloudUploadFixture.controls.active === 0);
  assert.equal(await changing.locator('.upload-progress').count(), 0);
  assert.equal(await changing.evaluate(() => window.__cloudUploadFixture.controls.puts.length), 3);
  assert.equal(await changing.evaluate(() => window.__cloudUploadFixture.controls.confirmed.size), 0);
  await changing.close();

  // 旧确认框不能在身份或会话变更后取消／清空新队列。
  for (const action of ['cancel', 'close']) {
    const stale = await open();
    await stale.evaluate(() => {
      Object.assign(window.__cloudUploadFixture.controls, { putDelay: 500, fail: false });
      void window.__cloudUploadFixture.start(60);
    });
    await stale.waitForFunction(() => window.__cloudUploadFixture.controls.active === 3);
    if (action === 'close') {
      await stale.evaluate(() => window.__cloudUploadFixture.upload.cancel());
      await stale.getByRole('button', { name: /^重试 / }).waitFor();
      await stale.locator('.upload-progress').getByRole('button', { name: '关闭', exact: true }).click();
    } else await stale.getByRole('button', { name: '取消上传', exact: true }).click();
    await stale.evaluate(() => {
      window.__cloudUploadFixture.upload.clear();
      window.__cloudUploadFixture.user.id = 'new-owner';
      void window.__cloudUploadFixture.start(1, ['new-owner.jpg']);
    });
    await stale.waitForFunction(() => window.__cloudUploadFixture.controls.active === 1);
    await stale.getByRole('button', { name: '确定', exact: true }).click();
    await stale.getByText('上传完成', { exact: true }).waitFor();
    assert.equal(await stale.evaluate(() => window.__cloudUploadFixture.controls.confirmed.size), 1);
    await stale.close();
  }

  const beforeCheck = await open();
  await beforeCheck.evaluate(() => {
    window.__cloudUploadFixture.controls.delayCheck = 100;
    void window.__cloudUploadFixture.start(60);
    window.__cloudUploadFixture.user.id = 'changed-before-check';
  });
  await beforeCheck.waitForTimeout(200);
  assert.equal(await beforeCheck.evaluate(() => window.__cloudUploadFixture.controls.puts.length), 0);
  assert.equal(await beforeCheck.locator('.upload-progress').count(), 0);
  await beforeCheck.close();

  const leaving = await open();
  await leaving.evaluate(() => {
    Object.assign(window.__cloudUploadFixture.controls, { putDelay: 60, fail: false });
    void window.__cloudUploadFixture.start(60);
  });
  await leaving.waitForFunction(() => window.__cloudUploadFixture.controls.active === 3);
  await leaving.getByRole('button', { name: '收起上传队列', exact: true }).click();
  await leaving.evaluate(() => {
    void window.__cloudUploadFixture.router.push('/other');
  });
  await leaving.getByText('Other page', { exact: true }).waitFor();
  assert.equal(await leaving.locator('.upload-progress--collapsed').count(), 1);
  assert.equal(await leaving.getByRole('dialog').count(), 0);
  await leaving.getByRole('button', { name: '展开上传队列', exact: true }).click();
  await leaving.evaluate(() => {
    void window.__cloudUploadFixture.start(20, undefined, 'album-b', 60);
  });
  await leaving.getByText('上传完成', { exact: true }).waitFor();
  assert.equal(await leaving.evaluate(() => window.__cloudUploadFixture.controls.confirmed.size), 80);
  assert.equal(await leaving.evaluate(() => window.__cloudUploadFixture.controls.peak), 3);
  assert.deepEqual(await leaving.evaluate(() => [...new Set(window.__cloudUploadFixture.controls.targets)]), [
    'album-a',
    'album-b',
  ]);
  await leaving.evaluate(() => {
    void window.__cloudUploadFixture.router.push('/cloudSpace');
  });
  await leaving.waitForFunction(() => window.__cloudUploadFixture.router.currentRoute.value.path === '/cloudSpace');
  assert.equal(await leaving.evaluate(() => window.__cloudUploadFixture.controls.puts.length), 80);
  await leaving.screenshot({ path: join(output, 'global-route-queue.png') });
  await leaving.close();

  for (const eventName of ['pagehide', 'light-note:app-exit']) {
    const exiting = await open();
    await exiting.evaluate(() => {
      window.__cloudUploadFixture.controls.putDelay = 2000;
      void window.__cloudUploadFixture.start(60);
    });
    await exiting.waitForFunction(() => window.__cloudUploadFixture.controls.active === 3);
    await exiting.evaluate((name) => window.dispatchEvent(new Event(name)), eventName);
    await exiting.waitForFunction(() => window.__cloudUploadFixture.controls.active === 0);
    assert.equal(await exiting.locator('.upload-progress').count(), 0);
    assert.equal(await exiting.evaluate(() => window.__cloudUploadFixture.controls.confirmed.size), 0);
    await exiting.close();
  }

  const oversized = await open();
  await oversized.evaluate(() => {
    const file = new File(['fixture'], '11GB-video.mp4', { type: 'video/mp4' });
    Object.defineProperty(file, 'size', { value: 11 * 1024 ** 3 });
    void window.__cloudUploadFixture.upload.enqueue([file], 'album-a');
  });
  await oversized
    .getByRole('alert')
    .filter({ hasText: /11GB-video.mp4.*10GB/ })
    .waitFor();
  assert.equal(await oversized.evaluate(() => window.__cloudUploadFixture.controls.checks), 0);
  assert.equal(await oversized.evaluate(() => window.__cloudUploadFixture.controls.puts.length), 0);
  await oversized.screenshot({ path: join(output, '10gb-limit.png') });
  await oversized.evaluate(() => {
    window.__cloudUploadFixture.controls.fail = false;
    void window.__cloudUploadFixture.start(1);
  });
  await oversized.getByText('上传完成', { exact: true }).waitFor();
  assert.equal(await oversized.getByRole('alert').count(), 0);
  await oversized.close();

  const picker = await open({ width: 390, controls: '' });
  await picker.locator('input[type=file]').setInputFiles([
    { name: 'picked-a.jpg', mimeType: 'image/jpeg', buffer: Buffer.from('fixture a') },
    { name: 'picked-b.jpg', mimeType: 'image/jpeg', buffer: Buffer.from('fixture b') },
  ]);
  await picker.getByText('上传完成', { exact: true }).waitFor();
  assert.deepEqual(await picker.evaluate(() => window.__cloudUploadFixture.controls.puts), [
    'picked-a.jpg',
    'picked-b.jpg',
  ]);
  await picker.close();

  const mobileCreate = await open({ width: 390, renderProfile: 'mobile', mobileCreate: '' });
  await mobileCreate.evaluate(() => {
    const x = window.__cloudUploadFixture;
    x.controls.fail = false;
    x.cloud.folder.id = 'album-a';
    x.cloud.folderList = [
      { id: 'album-a', parentId: null, name: '相册 A', depth: 1, path: ['相册 A'], fullPath: '相册 A' },
    ];
    x.openMobileCreate();
  });
  await mobileCreate.getByRole('dialog').waitFor();
  const mobileChoosing = mobileCreate.waitForEvent('filechooser');
  await mobileCreate.getByRole('button', { name: '选择文件', exact: true }).click();
  const mobileChooser = await mobileChoosing;
  await mobileCreate.locator('.mobile-cloud-upload').waitFor({ state: 'hidden' });
  await mobileCreate.evaluate(() => {
    void window.__cloudUploadFixture.router.push('/other');
  });
  await mobileCreate.getByText('Other page', { exact: true }).waitFor();
  await mobileChooser.setFiles([{ name: 'from-create.jpg', mimeType: 'image/jpeg', buffer: Buffer.from('fixture') }]);
  await mobileCreate.getByText('上传完成', { exact: true }).waitFor();
  assert.equal(await mobileCreate.locator('input[type=file]').count(), 1);
  assert.deepEqual(await mobileCreate.evaluate(() => window.__cloudUploadFixture.controls.targets), ['album-a']);
  await mobileCreate.close();

  const mobile = await open({ width: 390, renderProfile: 'mobile' });
  await mobile.evaluate(() => window.__cloudUploadFixture.start(3000));
  await mobile.getByText(/每次最多选择 100 个文件。本次未添加/).waitFor();
  assert.equal(await mobile.evaluate(() => window.__cloudUploadFixture.controls.checks), 0);
  assert.equal(await mobile.getByRole('alert').count(), 1);
  await mobile.locator('input[type=file]').setInputFiles(
    Array.from({ length: 101 }, (_, i) => ({
      name: `oversized-${i}.jpg`,
      mimeType: 'image/jpeg',
      buffer: Buffer.from('fixture'),
    })),
  );
  assert.equal(await mobile.evaluate(() => window.__cloudUploadFixture.controls.checks), 0);
  assert.equal(await mobile.locator('input[type=file]').inputValue(), '');
  await mobile.evaluate(() => {
    window.__cloudUploadFixture.controls.putDelay = 40;
    void window.__cloudUploadFixture.start(100);
  });
  await mobile.waitForFunction(() => window.__cloudUploadFixture.controls.active === 3);
  const choosing = mobile.waitForEvent('filechooser');
  await mobile.getByRole('button', { name: '继续添加文件', exact: true }).click();
  await (
    await choosing
  ).setFiles(
    Array.from({ length: 100 }, (_, i) => ({
      name: `photo-${i + 100}.jpg`,
      mimeType: 'image/jpeg',
      buffer: Buffer.from('fixture'),
    })),
  );
  await mobile
    .locator('.progress-summary')
    .filter({ hasText: /200 个/ })
    .waitFor();
  await mobile.evaluate(() => {
    void window.__cloudUploadFixture.start(3, undefined, 'album-b', 200);
  });
  await settled(mobile, 202);
  assert.equal(await mobile.evaluate(() => window.__cloudUploadFixture.controls.puts.length), 203);
  assert.match(await mobile.locator('.progress-summary').last().textContent(), /203 个/);
  assert.equal(await mobile.evaluate(() => window.__cloudUploadFixture.controls.peak), 3);
  const targets = await mobile.evaluate(() => window.__cloudUploadFixture.controls.targets);
  assert.deepEqual([...new Set(targets)], ['album-a', 'album-b']);
  await mobile.evaluate(() => {
    window.__cloudUploadFixture.controls.fail = false;
    void window.__cloudUploadFixture.start(2, undefined, 'album-c', 203);
  });
  await settled(mobile, 204);
  assert.equal(await mobile.evaluate(() => window.__cloudUploadFixture.controls.puts.length), 205);
  await mobile.screenshot({ path: join(output, 'mobile-append-failed.png') });
  await mobile.getByRole('button', { name: '重试 1 个文件', exact: true }).click();
  await mobile.getByText('上传完成', { exact: true }).waitFor();
  assert.equal(await mobile.evaluate(() => window.__cloudUploadFixture.controls.puts.length), 206);
  assert.equal(await mobile.evaluate(() => window.__cloudUploadFixture.controls.targets.at(-1)), 'album-a');
  await mobile.close();

  const collision = await open({ width: 390, renderProfile: 'mobile' });
  await collision.evaluate(() => {
    Object.assign(window.__cloudUploadFixture.controls, { putDelay: 150, fail: false });
    void window.__cloudUploadFixture.start(1, ['same.jpg']);
  });
  await collision.waitForFunction(() => window.__cloudUploadFixture.controls.active === 1);
  await collision.evaluate(() => {
    window.__cloudUploadFixture.controls.delayCheck = 400;
    void window.__cloudUploadFixture.start(1, ['same.jpg']);
  });
  await collision.getByText(/本次选择或待上传队列中存在同名文件/).waitFor();
  assert.equal(await collision.getByRole('button', { name: '全部覆盖', exact: true }).count(), 0);
  await collision.getByRole('button', { name: '全部自动改名', exact: true }).click();
  await collision.getByText('上传完成', { exact: true }).waitFor();
  assert.deepEqual(await collision.evaluate(() => window.__cloudUploadFixture.controls.puts), [
    'same.jpg',
    'same (1).jpg',
  ]);
  await collision.close();

  const checkingAppend = await open({ width: 390, renderProfile: 'mobile' });
  await checkingAppend.evaluate(() => {
    Object.assign(window.__cloudUploadFixture.controls, { putDelay: 150, fail: false });
    void window.__cloudUploadFixture.start(1);
  });
  await checkingAppend.waitForFunction(() => window.__cloudUploadFixture.controls.active === 1);
  await checkingAppend.evaluate(() => {
    window.__cloudUploadFixture.controls.delayCheck = 600;
    void window.__cloudUploadFixture.start(1, undefined, 'album-b', 1);
  });
  await checkingAppend.waitForFunction(() => window.__cloudUploadFixture.controls.confirmed.size === 1);
  await checkingAppend.evaluate(() => {
    void window.__cloudUploadFixture.start(1, undefined, null, 2);
  });
  assert.equal(
    await checkingAppend.evaluate(() => window.__cloudUploadFixture.controls.checks),
    2,
    'Completion of the previous upload must not unlock an unfinished name check',
  );
  await checkingAppend.waitForFunction(() => window.__cloudUploadFixture.controls.confirmed.size === 2);
  await checkingAppend.getByText('上传完成', { exact: true }).waitFor();
  assert.deepEqual(await checkingAppend.evaluate(() => window.__cloudUploadFixture.controls.puts), [
    'photo-0.jpg',
    'photo-1.jpg',
  ]);
  await checkingAppend.close();
  assert.deepEqual(errors, []);
  await writeFile(
    join(output, 'report.json'),
    JSON.stringify({ profiles: report, largeBatch: result, errors }, null, 2),
  );
  console.log(
    `Cloud upload browser checks passed: ${profiles.length} profiles, desktop 3000, global navigation and collapse, 10GB guard, app/page exit, mobile 100 limit and queue append, retry, cancellation and quota. Screenshots: ${output}`,
  );
} finally {
  await browser.close();
  if (selectionFixtureDir) await rm(selectionFixtureDir, { recursive: true, force: true });
}
