// Uses the same disposable MySQL/REST/WebSocket fixture as check-chat-latency.mjs.
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { mkdir, writeFile } from 'node:fs/promises';

const origin = 'http://127.0.0.1:5196';
const api = 'http://127.0.0.1:19096';
const output = '/tmp/lightnote-chat-read-boundaries';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const results = [];
function deferred() {
  let resolve;
  const promise = new Promise((r) => {
    resolve = r;
  });
  return { promise, resolve };
}
async function eventually(test) {
  const start = Date.now();
  while (!test()) {
    assert(Date.now() - start < 6000, 'Expected browser read transition did not occur');
    await new Promise((r) => setTimeout(r, 25));
  }
}
async function sendMessage(content) {
  const response = await fetch(`${api}/api/community-chat/rooms/general/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: 'sid=a' },
    body: JSON.stringify({ clientRequestId: crypto.randomUUID(), content }),
    signal: AbortSignal.timeout(5000),
  });
  const result = await response.json();
  assert.equal(result.status, 200);
  return result.data.message.publicId;
}
try {
  for (const mobile of [false, true])
    for (const theme of ['day', 'night']) {
      const context = await browser.newContext({
        viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 900 },
      });
      const page = await context.newPage(),
        errors = [],
        held = [];
      page.on('pageerror', (e) => errors.push(e.message));
      try {
        await page.goto(
          `${origin}/e2e/chat-latency.html?account=b&theme=${theme}${mobile ? '&renderProfile=mobile' : ''}`,
          { waitUntil: 'networkidle' },
        );
        await page.waitForFunction(() => window.chatLatency?.events.some((e) => e.type === 'room.subscribed'));
        await page.locator('[data-message-public-id]').last().waitFor();
        await page.waitForTimeout(700);
        const writes = [];
        let holding = true;
        const holdReads = async (route) => {
          if (route.request().method() !== 'PUT') return route.continue();
          const marker = route.request().postDataJSON().lastMessagePublicId;
          const who = /\bsid=([ab])/.exec((await route.request().allHeaders()).cookie || '')?.[1];
          writes.push({ marker, who });
          if (!holding) return route.continue();
          const response = await route.fetch(),
            gate = deferred();
          held.push({ marker, who, release: gate.resolve });
          await gate.promise;
          try {
            await route.fulfill({ response });
          } catch {
            /* Canceled old sessions have no recipient. */
          }
        };
        await page.route('**/rooms/general/read', holdReads);
        const tag = `BOUNDARY-${mobile}-${theme}-${Date.now()}`;
        const first = await sendMessage(`${tag}-one`);
        await page.getByText(`${tag}-one`, { exact: true }).waitFor();
        await eventually(() => held.some((r) => r.marker === first));
        const start = Date.now(),
          second = await sendMessage(`${tag}-two`);
        await page.getByText(`${tag}-two`, { exact: true }).waitFor({ timeout: 2000 });
        const displayWhileReadPendingMs = Date.now() - start;
        await eventually(() => held.some((r) => r.marker === second));
        await page.locator('.community-message-list').dispatchEvent('scroll');
        await page.waitForTimeout(220);
        assert.equal(
          writes.filter((r) => r.marker === second).length,
          1,
          'Repeated scroll duplicated a pending cursor',
        );
        holding = false;
        held.find((r) => r.marker === second).release();
        await page.waitForTimeout(80);
        held.find((r) => r.marker === first).release();
        await page.waitForTimeout(80);
        const afterAck = writes.length;
        await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
        await page.waitForTimeout(180);
        assert.equal(writes.length, afterAck, 'A late old response replaced the latest acknowledgement');
        await page.unroute('**/rooms/general/read', holdReads);

        let attempts = 0;
        const failOnce = async (route) => {
          if (route.request().method() !== 'PUT') return route.continue();
          attempts++;
          if (attempts === 1)
            return route.fulfill({
              status: 503,
              contentType: 'application/json',
              headers: { 'access-control-allow-origin': origin, 'access-control-allow-credentials': 'true' },
              body: JSON.stringify({ status: 503, data: null }),
            });
          return route.continue();
        };
        await page.route('**/rooms/general/read', failOnce);
        const third = await sendMessage(`${tag}-retry`);
        await page.getByText(`${tag}-retry`, { exact: true }).waitFor();
        await eventually(() => attempts === 1);
        await page.waitForTimeout(100);
        const retried = page.waitForResponse(
          (r) => r.request().method() === 'PUT' && r.url().endsWith('/read') && r.status() === 200,
        );
        await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
        await retried;
        await page.waitForTimeout(100);
        assert.equal(attempts, 2, 'A failed cursor must retry once through the ordinary foreground path');
        await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
        await page.waitForTimeout(100);
        assert.equal(attempts, 2, 'A successful retry must be remembered');
        await page.unroute('**/rooms/general/read', failOnce);

        holding = true;
        await page.route('**/rooms/general/read', holdReads);
        const fourth = await sendMessage(`${tag}-switch`);
        await page.getByText(`${tag}-switch`, { exact: true }).waitFor();
        await eventually(() => held.some((r) => r.marker === fourth));
        holding = false;
        await page.evaluate(() => window.chatLatency.switchAccount('a'));
        await page.waitForFunction(
          (id) => document.querySelector(`[data-message-public-id="${id}"]`)?.classList.contains('is-own'),
          fourth,
        );
        await page.evaluate(() => window.chatLatency.switchAccount('b'));
        await page.waitForFunction((id) => {
          const row = document.querySelector(`[data-message-public-id="${id}"]`);
          return row && !row.classList.contains('is-own');
        }, fourth);
        await eventually(() => writes.filter((r) => r.marker === fourth && r.who === 'b').length === 2);
        held.find((r) => r.marker === fourth).release();
        await page.waitForTimeout(150);
        const afterSwitch = writes.length;
        await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
        await page.waitForTimeout(180);
        assert.equal(writes.length, afterSwitch, 'An old account response corrupted the new session cache');
        assert.deepEqual(errors, []);
        await page.screenshot({ path: `${output}/${mobile ? 'mobile' : 'desktop'}-${theme}.png` });
        results.push({
          mobile,
          theme,
          displayWhileReadPendingMs,
          retryAttempts: attempts,
          distinctCursors: [first, second, third, fourth].length,
        });
      } finally {
        for (const r of held) r.release();
        await context.close();
      }
    }
  await writeFile(`${output}/results.json`, JSON.stringify(results, null, 2));
  console.log(JSON.stringify(results));
} finally {
  await browser.close();
}
