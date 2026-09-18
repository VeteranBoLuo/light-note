import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';
const fixturePort = process.env.COMMUNITY_FIXTURE_PORT || '19095';
const b = await chromium.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
});
try {
  for (const theme of ['day', 'night']) {
    const p = await b.newPage({ viewport: { width: 1470, height: 1000 } });
    await p.route('**/api/community/topics', async (r) => {
      const res = await r.fetch();
      const body = await res.json();
      if (Array.isArray(body.data)) body.data = body.data.slice(0, 6);
      await r.fulfill({ response: res, json: body });
    });
    await p.goto(`http://localhost:5173/e2e/community-p2.html?fixturePort=${fixturePort}&account=root&theme=${theme}`);
    const btn = p.locator('.context-topic').nth(2);
    await btn.waitFor();
    const box = await btn.boundingBox();
    await p.mouse.move(box.x + 10, box.y + 10);
    await p.mouse.down();
    const down = await btn.evaluate((e) => ({
      width: getComputedStyle(e).outlineWidth,
      style: getComputedStyle(e).outlineStyle,
      color: getComputedStyle(e).outlineColor,
    }));
    assert(down.style === 'none' || Number.parseInt(down.width) <= 1, JSON.stringify(down));
    await p.mouse.up();
    await p.waitForTimeout(400);
    await p.keyboard.press('Tab');
    const focused = p.locator('.context-topic:focus-visible');
    assert(await focused.count());
    const ring = await focused.evaluate((e) => ({
      width: getComputedStyle(e).outlineWidth,
      color: getComputedStyle(e).outlineColor,
    }));
    assert.equal(ring.width, '1px');
    assert.notEqual(ring.color, theme === 'day' ? 'rgb(22, 24, 36)' : 'rgb(242, 244, 247)');
    await p.screenshot({ path: `/tmp/community-focus-${theme}.png` });
    console.log('PASS pointer and keyboard focus', theme, down, ring);
    await p.close();
  }
} finally {
  await b.close();
}
