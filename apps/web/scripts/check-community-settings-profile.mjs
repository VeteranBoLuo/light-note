import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright-core';
const browser = await chromium.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
});
const out = '/tmp/lightnote-community-settings-profile';
await mkdir(out, { recursive: true });
const errors = [];
try {
  for (const width of [1440, 1024, 390, 320])
    for (const theme of ['day', 'night']) {
      const p = await browser.newPage({ viewport: { width, height: 900 } });
      p.on('pageerror', (e) => errors.push(e.message));
      await p.goto(
        `http://localhost:5173/e2e/community-p2.html?account=b&theme=${theme}${width < 768 ? '&renderProfile=mobile' : ''}`,
      );
      await p.waitForFunction(() => window.communityFixture?.router);
      if (width >= 768) {
        await p.locator('.community-navigation-badge').waitFor();
        const badge = await p.locator('.community-navigation-badge').first().boundingBox();
        assert.equal(badge.height, 18);
        assert(badge.width >= 18);
      }
      await p.evaluate(() => window.communityFixture.router.push('/community/chat'));
      await p.locator('.community-conversation-header__settings').click();
      await p.waitForFunction(
        () => window.communityFixture.router.currentRoute.value.path === '/community/preferences',
      );
      await p.locator('.community-settings-panel').waitFor();
      assert.equal(await p.getByRole('dialog').count(), 0);
      await p.screenshot({ path: `${out}/${width}-${theme}-settings.png`, fullPage: true });
      await p.evaluate(() => window.communityFixture.router.push('/community/profile'));
      await p.locator('.bio-field textarea').waitFor();
      await p.locator('.profile-showcase .featured-choices').waitFor();
      assert.equal(await p.getByRole('button', { name: '保存社区资料', exact: true }).count(), 1);
      assert.equal(await p.getByRole('dialog').count(), 0);
      assert.equal(await p.locator('.profile-editor').evaluate((e) => e.scrollWidth > e.clientWidth + 1), false);
      assert.equal(await p.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
      await p.screenshot({ path: `${out}/${width}-${theme}-profile.png`, fullPage: true });
      if (width === 1440 && theme === 'day') {
        const input = p.locator('.bio-field textarea');
        await input.fill('👨‍👩‍👧‍👦'.repeat(60));
        assert.equal(await p.getByRole('button', { name: '保存社区资料', exact: true }).isDisabled(), false);
        await input.fill('😀'.repeat(61));
        assert.equal(await p.getByRole('button', { name: '保存社区资料', exact: true }).isDisabled(), true);
        await input.fill('本地验证简介');
        await p.evaluate(() => (window.communityFixture.control.failProfileSave = true));
        await p.getByRole('button', { name: '保存社区资料', exact: true }).click();
        await p.getByText('部分内容可能已保存', { exact: false }).waitFor();
        assert.equal(await input.inputValue(), '本地验证简介');
        await p.evaluate(() => (window.communityFixture.control.failProfileSave = false));
        await p.getByRole('button', { name: '保存社区资料', exact: true }).click();
        await p.waitForFunction(() => document.querySelector('.profile-editor footer button')?.disabled);
        await p.evaluate(() => window.communityFixture.router.push('/community/chat'));
        await p.evaluate(() => window.communityFixture.router.push('/community/profile'));
        await p.locator('.bio-field textarea').waitFor();
        assert.equal(await input.inputValue(), '本地验证简介');
        await p.locator('.featured-choices button').nth(1).click();
        await input.fill('部分保存后的简介');
        await p.route('**/api/community/profiles/options/me', (route) =>
          route.request().method() === 'PUT' ? route.abort() : route.continue(),
        );
        await p.getByRole('button', { name: '保存社区资料', exact: true }).click();
        await p.getByText('部分内容可能已保存', { exact: false }).waitFor();
        assert.equal(await input.inputValue(), '部分保存后的简介');
        const cardWrites = await p.evaluate(
          () => window.communityFixture.calls.filter((c) => c.url.endsWith('/profile/me') && c.method === 'put').length,
        );
        await p.unroute('**/api/community/profiles/options/me');
        await p.getByRole('button', { name: '保存社区资料', exact: true }).click();
        await p.waitForFunction(() => document.querySelector('.profile-editor footer button')?.disabled);
        assert.equal(
          await p.evaluate(
            () =>
              window.communityFixture.calls.filter((c) => c.url.endsWith('/profile/me') && c.method === 'put').length,
          ),
          cardWrites,
        );
      }
      await p.close();
    }
  for (const state of ['closed', 'failfeed', 'readonly', 'guest']) {
    const p = await browser.newPage({ viewport: { width: 390, height: 850 } });
    await p.goto(`http://localhost:5173/e2e/community-p2.html?account=b&renderProfile=mobile&${state}`);
    await p.waitForFunction(() => window.communityFixture?.router);
    await p.evaluate(() => window.communityFixture.router.push('/community/preferences'));
    await p.locator('.settings-content').waitFor();
    if (state !== 'guest') await p.locator('.community-notification-settings').waitFor();
    else assert.equal(await p.locator('.community-settings-panel').count(), 0);
    await p.close();
  }
  assert.deepEqual(errors, []);
  console.log(
    'PASS: 8 viewport/theme combinations; shared settings route, badge geometry, direct profile form, save failure/retry/persistence, no horizontal overflow',
  );
} finally {
  await browser.close();
}
