import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
});
const origin = process.env.LIGHTNOTE_WEB_ORIGIN || 'http://localhost:5173';
try {
  for (const width of [1440, 390, 320])
    for (const theme of ['day', 'night']) {
      const page = await browser.newPage({
        viewport: { width, height: width === 390 ? 640 : width === 1440 ? 720 : 900 },
      });
      page.setDefaultTimeout(10000);
      await page.goto(
        `${origin}/e2e/user-activity.html?capture=off&theme=${theme}${width < 768 ? '&renderProfile=mobile' : ''}`,
      );
      await page.getByRole('button', { name: '查看活跃用户', exact: true }).click();
      await page.locator('.activity-trend__hit').last().waitFor();
      await page.locator('.activity-trend__hit').nth(2).click();
      await page.waitForTimeout(200);
      assert.equal(await page.locator('.activity-trend__hit').count(), 7);
      await page.getByRole('tab', { name: '近 30 天', exact: true }).click();
      await page.waitForTimeout(250);
      assert.equal(await page.locator('.activity-trend__hit').count(), 30);
      await page.locator('.activity-trend svg').focus();
      await page.keyboard.press('ArrowLeft');
      await page.waitForTimeout(200);
      assert.ok((await page.locator('.activity-drawer__list').boundingBox()).height >= 240);
      assert.ok((await page.locator('.b-virtual-list__item').first().boundingBox()).height < 100);
      await page.getByRole('tab', { name: '近 90 天', exact: true }).click();
      await page.waitForFunction(() => document.querySelectorAll('.activity-trend__hit').length === 90);
      await page.getByRole('tab', { name: '近 30 天', exact: true }).click();
      await page.waitForFunction(() => document.querySelectorAll('.activity-trend__hit').length === 30);
      await page.locator('.b-datetime-trigger').click();
      await page.locator('.b-datetime-panel').waitFor();
      await page.getByRole('button', { name: '取消', exact: true }).click();
      await page.locator('.b-datetime-panel').waitFor({ state: 'hidden' });
      await page.screenshot({ path: `/tmp/activity-history-${width}-${theme}.png` });
      const list = await page.locator('.activity-drawer__list').boundingBox();
      console.log(JSON.stringify({ width, theme, listHeight: list?.height }));
      await page.close();
    }
  for (const state of ['empty', 'error', 'loading', 'partial']) {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    page.setDefaultTimeout(10000);
    await page.goto(`${origin}/e2e/user-activity.html?capture=off&state=${state}&renderProfile=mobile`);
    await page.getByRole('button', { name: '查看活跃用户', exact: true }).click();
    if (state === 'loading') await page.getByText('正在加载活跃用户', { exact: true }).waitFor();
    else if (state === 'error') {
      await page.getByText('活跃用户加载失败，请重试或刷新', { exact: true }).waitFor();
      await page.evaluate(() => {
        window.__activityAcceptance.state = 'default';
      });
      await page.getByRole('button', { name: '重试', exact: true }).click();
      await page.locator('.activity-trend__hit').last().waitFor();
    } else if (state === 'empty') await page.getByText('当天没有记录到真实使用的用户', { exact: true }).waitFor();
    else await page.getByText('新口径启用当天，数据尚不完整', { exact: true }).waitFor();
    await page.waitForTimeout(300);
    await page.screenshot({ path: `/tmp/activity-history-${state}.png` });
    await page.close();
  }
  const page = await browser.newPage({ viewport: { width: 320, height: 844 } });
  await page.goto(`${origin}/e2e/user-activity.html?capture=off&locale=en-US&theme=night&renderProfile=mobile`);
  await page.getByRole('button', { name: 'View active users', exact: true }).click();
  await page.locator('.activity-trend__hit').last().waitFor();
  await page.screenshot({ path: '/tmp/activity-history-english.png' });
  await page.close();
} finally {
  await browser.close();
}
