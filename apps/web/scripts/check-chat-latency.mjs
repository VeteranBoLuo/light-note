import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { mkdir, writeFile } from 'node:fs/promises';

const origin = 'http://127.0.0.1:5196';
const control = 'http://127.0.0.1:19096';
const output = process.env.LIGHTNOTE_LATENCY_OUTPUT || '/tmp/lightnote-chat-latency-results';
const count = Number(process.env.LIGHTNOTE_LATENCY_SAMPLES || 10);
assert(Number.isInteger(count) && count >= 1 && count <= 20);
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const failures = [],
  results = [];
async function setupInstrumentation(page) {
  page.on('pageerror', (e) => {
    failures.push(e.message);
    console.error('PAGE_ERROR', e.message);
  });
  await page.addInitScript(() => {
    const now = () => performance.timeOrigin + performance.now();
    window.__latency = { calls: [], clickAt: 0, domAt: 0, visibleAt: 0, tag: '', publicId: '' };
    const originalOpen = XMLHttpRequest.prototype.open,
      originalSend = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.open = function (method, url, ...args) {
      this.__trace = { method, url: String(url) };
      return originalOpen.call(this, method, url, ...args);
    };
    XMLHttpRequest.prototype.send = function (body) {
      const record = { ...this.__trace, startAt: now() };
      try {
        record.content = JSON.parse(body)?.content;
      } catch {}
      window.__latency.calls.push(record);
      this.addEventListener('readystatechange', () => {
        if (this.readyState === 4) {
          record.endAt = now();
          record.status = this.status;
        }
      });
      return originalSend.call(this, body);
    };
    document.addEventListener(
      'click',
      (event) => {
        if (event.target.closest?.('.community-composer__send')) window.__latency.clickAt = now();
      },
      true,
    );
    let pending = false;
    const capture = () => {
      const state = window.__latency;
      if (!state.tag || state.visibleAt || pending) return;
      const row = [...document.querySelectorAll('[data-message-public-id]')].find((e) =>
        e.textContent.includes(state.tag),
      );
      if (!row) return;
      state.domAt ||= now();
      state.publicId = row.dataset.messagePublicId;
      pending = true;
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          pending = false;
          const r = row.getBoundingClientRect(),
            clip = row.closest('.community-message-list')?.getBoundingClientRect();
          if (
            row.isConnected &&
            r.width > 0 &&
            r.height > 0 &&
            r.top < Math.min(innerHeight, clip?.bottom ?? innerHeight) &&
            r.bottom > Math.max(0, clip?.top ?? 0) &&
            getComputedStyle(row).visibility !== 'hidden'
          )
            state.visibleAt = now();
        }),
      );
    };
    new MutationObserver(capture).observe(document, { childList: true, subtree: true });
    document.addEventListener('scroll', capture, true);
  });
}
const stats = async () => {
  const r = await fetch(control + '/fixture/stats');
  assert(r.ok);
  return r.json();
};
try {
  for (const profile of [
    { name: 'desktop-loopback', rttMs: 0, mobile: false },
    { name: 'desktop-rtt150', rttMs: 150, mobile: false },
    { name: 'mobile-rtt150', rttMs: 150, mobile: true },
  ]) {
    const change = await fetch(control + '/fixture/network', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rttMs: profile.rttMs }),
    });
    assert(change.ok);
    const contexts = await Promise.all([
      browser.newContext({ viewport: { width: 1440, height: 900 } }),
      browser.newContext({ viewport: profile.mobile ? { width: 390, height: 844 } : { width: 1440, height: 900 } }),
    ]);
    const [sender, receiver] = await Promise.all(contexts.map((c) => c.newPage()));
    await Promise.all([setupInstrumentation(sender), setupInstrumentation(receiver)]);
    for (const [page, account] of [
      [sender, 'a'],
      [receiver, 'b'],
    ]) {
      await page.goto(
        `${origin}/e2e/chat-latency.html?account=${account}${profile.mobile && account === 'b' ? '&renderProfile=mobile&theme=night' : ''}`,
        { waitUntil: 'networkidle', timeout: 120000 },
      );
      await page.locator('.community-message-skeleton').waitFor({ state: 'hidden' });
      await page.locator('[data-message-public-id]').first().waitFor();
      await page.waitForFunction(() => window.chatLatency?.events.some((e) => e.type === 'room.subscribed'));
      assert.equal(await page.evaluate(() => document.visibilityState), 'visible');
    }
    for (let i = -2; i < count; i++) {
      const tag = `LATENCY-${profile.name}-${Date.now()}-${i}`;
      await receiver.evaluate(
        (tag) => Object.assign(window.__latency, { tag, domAt: 0, visibleAt: 0, publicId: '' }),
        tag,
      );
      const baseline = (await stats()).records.length;
      const input = sender.locator('.community-composer textarea, .community-composer [contenteditable="true"]');
      await input.fill(tag);
      await sender.locator('.community-composer__send').click();
      await receiver.waitForFunction(() => window.__latency.visibleAt > 0, {}, { timeout: 15000 });
      await sender.waitForFunction((tag) => window.__latency.calls.some((c) => c.content === tag && c.endAt > 0), tag);
      await sender.waitForTimeout(650);
      const [sent, received, snapshot] = await Promise.all([
        sender.evaluate(
          (tag) => ({
            clickAt: window.__latency.clickAt,
            request: window.__latency.calls.find((c) => c.content === tag),
          }),
          tag,
        ),
        receiver.evaluate(() => ({ state: { ...window.__latency }, events: window.chatLatency.events.slice() })),
        stats(),
      ]);
      const id = received.state.publicId;
      const broadcast = snapshot.broadcasts.find((b) => b.id === id);
      const ws = received.events.find((e) => e.type === 'message.created' && e.id === id);
      assert(broadcast && ws, 'A genuine WebSocket event must precede the authoritative read');
      const read = received.state.calls.findLast(
        (c) =>
          c.method.toLowerCase() === 'get' &&
          new URL(c.url, origin).pathname.endsWith('/messages') &&
          c.startAt >= ws.at,
      );
      const write = snapshot.records.slice(baseline).find((r) => r.method === 'POST' && r.publicId === id);
      assert(read && write && sent.request.status === 200);
      const sample = {
        profile: profile.name,
        rttMs: profile.rttMs,
        clickToVisibleMs: received.state.visibleAt - sent.clickAt,
        clickToRequestMs: sent.request.startAt - sent.clickAt,
        sendHttpMs: sent.request.endAt - sent.request.startAt,
        writeServerMs: write.endAt - write.startAt,
        writeQueryMs: write.foregroundQueryMs,
        writeQueries: write.foregroundQueries,
        commitToBroadcastMs: broadcast.at - write.commitAt,
        wsToReadMs: read.startAt - ws.at,
        receiverReadMs: read.endAt - read.startAt,
        readToDomMs: received.state.domAt - read.endAt,
        domToVisibleMs: received.state.visibleAt - received.state.domAt,
        receiverReads: received.state.calls.filter(
          (c) =>
            c.method.toLowerCase() === 'get' &&
            new URL(c.url, origin).pathname.endsWith('/messages') &&
            c.startAt >= ws.at,
        ).length,
      };
      const activity = snapshot.records.slice(baseline);
      const measuredPreflights = snapshot.preflights.filter(
        (p) => p.at >= sent.clickAt && p.at <= received.state.visibleAt,
      );
      if (i >= 0)
        assert.equal(measuredPreflights.length, 0, 'Warm samples must not include fixture-only CORS round trips');
      sample.requests = activity.map((r) => ({
        who: r.who,
        method: r.method,
        path: r.path,
        queries: r.queries,
        serverMs: r.endAt - r.startAt,
        bytes: r.bytes,
      }));
      sample.totalQueries = activity.reduce((sum, r) => sum + r.queries, 0);
      if (i >= 0) {
        results.push(sample);
        console.log(JSON.stringify(sample));
      }
      await sender.waitForTimeout(200);
    }
    await receiver.screenshot({ path: `${output}/${profile.name}.png` });
    await Promise.all(contexts.map((c) => c.close()));
  }
  assert.deepEqual(failures, []);
  await writeFile(`${output}/samples.json`, JSON.stringify(results, null, 2));
  for (const name of [...new Set(results.map((r) => r.profile))]) {
    const rows = results.filter((r) => r.profile === name),
      sorted = rows.map((r) => r.clickToVisibleMs).sort((a, b) => a - b);
    console.log(
      JSON.stringify({
        profile: name,
        samples: rows.length,
        minMs: sorted[0],
        medianMs: (sorted[Math.floor((sorted.length - 1) / 2)] + sorted[Math.floor(sorted.length / 2)]) / 2,
        maxMs: sorted.at(-1),
      }),
    );
  }
} finally {
  await browser.close();
}
