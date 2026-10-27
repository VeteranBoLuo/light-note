// Exercises actual Vue pages with non-personal API fixtures; never calls a real AI provider.
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright-core';
const out = process.env.TOOLBOX_TASK_OUTPUT || join(tmpdir(), 'lightnote-task-flow');
await fs.mkdir(out, { recursive: true });
const base = process.env.TOOLBOX_TASK_ORIGIN || 'http://127.0.0.1:5173';
assert(['localhost', '127.0.0.1'].includes(new URL(base).hostname), 'Use a local fixture server');
const origin = new URL('/e2e/toolbox-workspace.html', base).toString();
const browser = await chromium.launch({
  headless: true,
  executablePath:
    process.env.CHROME_PATH ||
    (process.platform === 'darwin' ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' : undefined),
});
const results = [],
  errors = [];
let page;
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
  page = await context.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(origin + '?view=home&taskFlow=1&tool=material_to_note');
  await page.locator('.toolbox-tasks .toolbox-task-row').first().waitFor({ timeout: 45000 });
  assert((await page.locator('.toolbox-tasks').innerText()).includes('阅读摘记'));
  await page.getByRole('button', { name: '查看全部任务', exact: true }).click();
  await page.locator('.task-record').first().waitFor();
  await page.getByRole('tab', { name: '失败', exact: true }).click();
  await page.waitForFunction(() => document.querySelectorAll('.task-record').length === 2);
  await page.getByRole('button', { name: '阅读摘记 · 资料转笔记', exact: true }).click();
  await page.locator('.toolbox-task__context').waitFor();
  await page.getByRole('button', { name: '重新发起', exact: true }).click();
  await page.locator('.toolbox-workbench__restore').filter({ hasText: '已恢复上次可用的材料和处理要求' }).waitFor();
  assert.equal(await page.locator('textarea').first().inputValue(), '整理阅读材料中的主张与证据，保留具体的应用建议。');
  assert((await page.locator('.toolbox-resource-selector__selected').innerText()).includes('阅读摘记'));
  assert.equal(
    await page.evaluate(
      () =>
        window.taskFlowRequests.filter(
          (r) => r.method === 'post' && ['/api/toolbox/quotes', '/api/toolbox/jobs'].includes(r.url),
        ).length,
    ),
    0,
  );
  await page.screenshot({ path: out + '/restored-input.png' });
  results.push('Home → full list → failed detail → restore input without quote/charge');
  await page.locator('.toolbox-page-header__back').click();
  await page.locator('.toolbox-task__context').waitFor();
  await page.getByRole('button', { name: '移除提醒', exact: true }).click();
  await page.getByRole('button', { name: '移除提醒', exact: true }).last().click();
  await page.locator('.toolbox-tasks-page').waitFor();
  await page.getByRole('tab', { name: '失败', exact: true }).click();
  await page.waitForFunction(() => document.querySelectorAll('.task-record').length === 1);
  assert(!(await page.locator('.task-records').innerText()).includes('阅读摘记'));
  results.push('Dismiss confirmation hides task from full list');
  await context.close();
  const restartContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  page = await restartContext.newPage();
  await page.goto(origin + '?view=tasks&taskFlow=1&tool=material_to_note&filter=failed');
  await page.getByRole('button', { name: '阅读摘记 · 资料转笔记', exact: true }).click();
  await page.getByRole('button', { name: '重新发起', exact: true }).click();
  await page.locator('.toolbox-workbench__restore').waitFor();
  await page.getByRole('button', { name: '生成笔记', exact: true }).click();
  await page.locator('.toolbox-quote__actions button').last().click();
  await page.locator('.toolbox-task__progress').waitFor();
  assert.equal(await page.evaluate(() => sessionStorage.getItem('toolbox-dismissed-old-failure')), '1');
  results.push('Confirmed restart creates a new task and hides its previous failed reminder');
  await restartContext.close();
  for (const cfg of [
    { width: 1440, theme: 'day', density: 'compact', locale: 'zh-CN' },
    { width: 1440, theme: 'day', density: 'standard', locale: 'zh-CN' },
    { width: 1440, theme: 'night', density: 'comfortable', locale: 'zh-CN' },
    { width: 390, theme: 'night', density: 'standard', locale: 'zh-CN' },
    { width: 320, theme: 'day', density: 'standard', locale: 'en-US' },
  ]) {
    const ctx = await browser.newContext({ viewport: { width: cfg.width, height: 900 }, reducedMotion: 'reduce' });
    page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push(e.message));
    const query = new URLSearchParams({
      view: 'tasks',
      taskFlow: '1',
      tool: 'material_to_note',
      ...Object.fromEntries(Object.entries(cfg).map(([k, v]) => [k, String(v)])),
    });
    await page.goto(origin + '?' + query);
    await page.locator('.task-record').first().waitFor({ timeout: 30000 });
    const metrics = await page.locator('.toolbox-tasks-page').evaluate((e) => ({
      width: e.clientWidth,
      scrollWidth: e.scrollWidth,
      visible: [...e.querySelectorAll('.task-record')].filter((r) => {
        const b = r.getBoundingClientRect();
        return b.top >= 0 && b.bottom <= innerHeight;
      }).length,
    }));
    assert(metrics.scrollWidth <= metrics.width + 1);
    await page.locator('.toolbox-tasks-page').evaluate((e) => (e.scrollTop = e.scrollHeight));
    await page.waitForFunction(() => document.querySelectorAll('.task-record').length === 27);
    const name = `${cfg.width}-${cfg.theme}-${cfg.density}-${cfg.locale}`;
    await page.locator('.toolbox-tasks-page').evaluate((e) => (e.scrollTop = 0));
    await page.screenshot({ path: out + `/list-${name}.png` });
    const failedTab = page.getByRole('tab', { name: cfg.locale === 'zh-CN' ? '失败' : 'Failed', exact: true });
    await failedTab.click();
    await page.waitForFunction(() => document.querySelectorAll('.task-record').length === 2);
    await page.getByRole('button', { name: '阅读摘记 · 资料转笔记', exact: true }).click();
    await page.locator('.toolbox-task__context').waitFor();
    await page.screenshot({ path: out + `/detail-${name}.png` });
    const overflow = await page.locator('.toolbox-task__inner').evaluate((e) => e.scrollWidth > e.clientWidth + 1);
    assert(!overflow);
    results.push({ name, ...metrics });
    await ctx.close();
  }
  for (const state of ['empty', 'error']) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    page = await ctx.newPage();
    await page.goto(origin + `?view=tasks&taskFlow=1&tool=material_to_note&state=${state}`);
    await page.locator('.task-list-state').waitFor();
    await page.screenshot({ path: out + `/list-${state}.png` });
    assert.equal(await page.locator('.task-record').count(), 0);
    results.push(`List ${state} state`);
    await ctx.close();
  }
  console.log(JSON.stringify({ results, errors }));
  assert.deepEqual(errors, []);
} catch (e) {
  console.log(
    JSON.stringify({
      failed: e.message,
      results,
      errors,
      body: page
        ? await page
            .locator('body')
            .innerText()
            .catch(() => null)
        : null,
    }),
  );
  if (page) await page.screenshot({ path: out + '/acceptance-failure.png' }).catch(() => {});
  process.exitCode = 1;
} finally {
  await browser.close();
}
