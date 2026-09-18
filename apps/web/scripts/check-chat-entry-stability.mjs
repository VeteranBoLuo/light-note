import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright-core';
const browser = await chromium.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
});
const out = '/tmp/lightnote-chat-entry';
await mkdir(out, { recursive: true });
const errors = [];
const rect = async (p, s) =>
  p
    .locator(s)
    .first()
    .evaluate((e) => {
      const r = e.getBoundingClientRect();
      return { x: r.x, y: r.y, width: r.width, height: r.height };
    });
const same = (a, b, label) => {
  for (const k of ['x', 'y', 'width', 'height'])
    assert(Math.abs(a[k] - b[k]) < 1.1, `${label}.${k}: ${a[k]} -> ${b[k]}`);
};
try {
  for (const width of [1440, 1024, 390, 320])
    for (const theme of ['day', 'night']) {
      const p = await browser.newPage({ viewport: { width, height: 900 } });
      p.on('pageerror', (e) => errors.push(e.message));
      await p.goto(
        `http://localhost:5173/e2e/community-p2.html?account=root&chatDelay=700&theme=${theme}${width < 768 ? '&renderProfile=mobile' : ''}`,
      );
      await p.locator('.feed-post').first().waitFor();
      await p.evaluate(() => window.communityFixture.router.push('/community/chat'));
      await p.locator('.community-chat-bootstrap').waitFor();
      const first = {
        header: await rect(p, '.community-chat-bootstrap__header'),
        composer: await rect(p, '.community-chat-bootstrap__composer'),
        bubble: await rect(p, '.community-message-skeleton span'),
      };
      await p.screenshot({ path: `${out}/${width}-${theme}-directory.png` });
      await p.locator('.community-workspace .community-message-skeleton').waitFor();
      same(first.header, await rect(p, '.community-conversation-header'), 'header');
      same(first.composer, await rect(p, '.community-composer'), 'composer');
      same(first.bubble, await rect(p, '.community-message-skeleton span'), 'skeleton');
      await p.screenshot({ path: `${out}/${width}-${theme}-messages.png` });
      await p.locator('.community-message-skeleton').waitFor({ state: 'hidden' });
      same(first.header, await rect(p, '.community-conversation-header'), 'loaded header');
      same(first.composer, await rect(p, '.community-composer'), 'loaded composer');
      // Late root-only presence must not resize the already visible title row.
      await p.locator('.community-conversation-header__title-line').evaluate((e) => {
        const b = document.createElement('button');
        b.className = 'b_btn community-conversation-header__online';
        b.textContent = '在线人数 1';
        for (const name of e.getAttributeNames().filter(n => n.startsWith('data-v-'))) b.setAttribute(name, '');
        e.append(b);
      });
      same(first.header, await rect(p, '.community-conversation-header'), 'presence header');
      same(first.composer, await rect(p, '.community-composer'), 'presence composer');
      assert.equal(await p.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
      await p.screenshot({ path: `${out}/${width}-${theme}-loaded.png` });
      await p.close();
    }
  for (const flag of ['closed', 'failfeed']) {
    const p = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await p.goto(`http://localhost:5173/e2e/community-p2.html?account=root&chatDelay=700&${flag}`);
    await p.waitForFunction(() => window.communityFixture?.router);
    await p.waitForFunction(() => window.communityFixture.calls.some(c => c.url.endsWith('/feed/capabilities')));
    await p.evaluate(() => window.communityFixture.router.push('/community/chat'));
    await p.locator('.community-chat-bootstrap').waitFor();
    const before = await rect(p, '.community-chat-bootstrap__header');
    await p.locator('.community-workspace').waitFor();
    same(before, await rect(p, '.community-conversation-header'), flag + ' header');
    await p.locator('.community-message-skeleton').waitFor({ state: 'hidden' });
    await p.close();
  }
  assert.deepEqual(errors, []);
  console.log(
    'PASS: header, composer and both loading skeleton geometries stable in 8 viewport/theme combinations, including late online presence',
  );
} finally {
  await browser.close();
}
