/** In-memory UI fixtures; no user files, backend or object storage are touched. */
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
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
  await page.getByRole('button', { name: /重试剩余|Retry .* remaining/ }).waitFor();
}
try {
  for (const profile of profiles) {
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
    await page.getByRole('button', { name: /重试剩余|Retry .* remaining/ }).click();
    await page.waitForFunction(() => window.__cloudUploadFixture.controls.confirmed.size === 60);
    await page.getByText(/^(上传完成|Upload complete)$/).waitFor();
    assert.equal(await page.evaluate(() => window.__cloudUploadFixture.controls.puts.length), 61);
    await page.screenshot({ path: join(output, `${name}-done.png`) });
    report.push({ profile, bounds, peak: await page.evaluate(() => window.__cloudUploadFixture.controls.peak) });
    await page.close();
  }
  const page = await open();
  await page.evaluate(() => {
    Object.assign(window.__cloudUploadFixture.controls, { fail: false, putDelay: 1 });
    void window.__cloudUploadFixture.start(3000);
  });
  await page.waitForFunction(() => window.__cloudUploadFixture.controls.confirmed.size === 3000, null, {
    timeout: 60000,
  });
  await page.getByText('上传完成', { exact: true }).waitFor();
  const result = await page.evaluate(() => {
    const x = window.__cloudUploadFixture.controls;
    return { puts: x.puts.length, peak: x.peak, batches: x.batches, targets: x.targets };
  });
  assert.equal(result.puts, 3000);
  assert.equal(result.peak, 3);
  assert(result.batches.every((n) => n <= 20));
  assert(result.targets.every((id) => id === 'album-a'));
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
  await quota.getByRole('button', { name: /重试剩余/ }).click();
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
  await cancel.getByRole('button', { name: /重试剩余/ }).waitFor();
  assert(await cancel.evaluate(() => window.__cloudUploadFixture.controls.puts.length <= 3));
  await cancel.evaluate(() => {
    Object.assign(window.__cloudUploadFixture.controls, { fail: false, putDelay: 5 });
  });
  await cancel.getByRole('button', { name: /重试剩余/ }).click();
  await cancel.getByText('上传完成', { exact: true }).waitFor();
  await cancel.close();
  const duplicates = await open();
  await duplicates.evaluate(() => {
    window.__cloudUploadFixture.controls.fail = false;
    void window.__cloudUploadFixture.start(2, ['same.jpg', 'same.jpg']);
  });
  await duplicates.getByText('本次选择中包含同名文件。自动改名后可全部保留，避免照片相互覆盖。').waitFor();
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
    window.__cloudUploadFixture.controls.putDelay = 2000;
    void window.__cloudUploadFixture.start(60);
  });
  await leaving.waitForFunction(() => window.__cloudUploadFixture.controls.active === 3);
  await leaving.evaluate(() => {
    void window.__cloudUploadFixture.router.push('/other');
  });
  await leaving.getByRole('button', { name: '取消', exact: true }).click();
  assert.equal(await leaving.locator('.upload-progress').count(), 1);
  await leaving.evaluate(() => {
    void window.__cloudUploadFixture.router.push('/other');
  });
  await leaving.getByRole('button', { name: '确定', exact: true }).click();
  await leaving.getByText('Other page', { exact: true }).waitFor();
  await leaving.waitForFunction(() => window.__cloudUploadFixture.controls.active === 0);
  assert.equal(await leaving.locator('.upload-progress').count(), 0);
  await leaving.close();

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
  assert.deepEqual(errors, []);
  await writeFile(
    join(output, 'report.json'),
    JSON.stringify({ profiles: report, largeBatch: result, errors }, null, 2),
  );
  console.log(
    `Cloud upload browser checks passed: ${profiles.length} profiles, 3000 files, retry, cancellation and quota. Screenshots: ${output}`,
  );
} finally {
  await browser.close();
}
