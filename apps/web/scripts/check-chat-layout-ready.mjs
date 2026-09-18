import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
const browser = await chromium.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
});
try {
  for (const width of [1440, 1024, 390, 320])
    for (const theme of ['day', 'night'])
      for (const failFirstPin of [false, true]) {
        const page = await browser.newPage({ viewport: { width, height: 900 } });
        await page.route('**/src/e2e/communityP2Harness.ts*', async (route) => {
          const response = await route.fetch();
          let body = (await response.text()).replace('/pinned-message', '/pin');
          body = body.replace(
            'data = { message: null };',
            `{ const sequence = calls.filter(c => c.url.endsWith("/pin")).length; await new Promise(r => setTimeout(r, sequence === 1 ? 50 : 900)); if (${failFirstPin} && sequence === 1) throw new Error("isolated initial pin failure"); data = { message: messages[0] }; }`,
          );
          assert(body.includes('message: messages[0]'));
          await route.fulfill({ response, body });
        });
        await page.goto(
          `http://localhost:5173/e2e/community-p2.html?account=b&chatDelay=700&theme=${theme}${width < 768 ? '&renderProfile=mobile' : ''}`,
        );
        await page.waitForFunction(() => window.communityFixture?.router);
        await page.evaluate(() => window.communityFixture.router.push('/community/chat'));
        await page.locator('.community-workspace .community-message-skeleton').waitFor();
        const result = await page.evaluate(async () => {
          const root = document.querySelector('.community-workspace');
          const vm = root.__vueParentComponent;
          const state = vm.setupState;
          if (typeof state.handleRealtimeSynchronized !== 'function') throw Error('workspace synchronization missing');
          void state.handleRealtimeSynchronized();
          const frames = [];
          await new Promise((resolve) => {
            const start = performance.now();
            const capture = () => {
              const loading = !!root.querySelector('.community-message-skeleton');
              const pin = root.querySelector('.community-pinned-message');
              const list = root.querySelector('.community-message-list');
              frames.push({
                loading,
                pinned: !!pin,
                top: list.getBoundingClientRect().top,
                bottom: list.scrollHeight - list.clientHeight - list.scrollTop,
              });
              if (performance.now() - start < 2100) requestAnimationFrame(capture);
              else resolve();
            };
            requestAnimationFrame(capture);
          });
          return frames;
        });
        const loaded = result.filter((f) => !f.loading);
        assert(loaded.length > 0);
        assert(
          loaded.every((f) => f.pinned),
          'A loaded frame is missing the pinned banner',
        );
        assert(
          loaded.every((f) => Math.abs(f.top - loaded[0].top) < 1),
          'message viewport moved',
        );
        assert(
          loaded.every((f) => f.bottom < 2),
          'message list left bottom',
        );
        await page.screenshot({ path: `/tmp/chat-live-${width}-${theme}.png` });
        console.log(width, theme, failFirstPin, `${loaded.length} loaded frames stable`);
        await page.close();
      }
} finally {
  await browser.close();
}
