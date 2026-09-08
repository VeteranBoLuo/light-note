// Uses the local in-memory fixture; does not access user data or a database.
import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';
const origin = process.env.BOARD_TEST_ORIGIN || 'http://localhost:5173';
assert(['localhost', '127.0.0.1'].includes(new URL(origin).hostname));
(async () => {
  const b = await chromium.launch({ channel: 'chrome', headless: true });
  for (const flag of ['itemMutation=error', 'boardConflict=1']) {
    const p = await b.newPage({ viewport: { width: 390, height: 1000 } });
    await p.goto(origin + '/e2e/toolbox-workspace.html?view=detail&kind=research&renderProfile=mobile&' + flag);
    await p.locator('.board-card').first().click();
    const field = p.locator('.board-editor-title input');
    await field.fill('Retained draft');
    await p.locator('.board-editor__footer').getByRole('button', { name: '保存', exact: true }).click();
    await p.locator('.board-editor [role=alert]').waitFor();
    if ((await field.inputValue()) !== 'Retained draft') throw Error('draft lost ' + flag);
    if (flag === 'boardConflict=1') {
      await p.locator('.board-editor__footer').getByRole('button', { name: '保存', exact: true }).click();
      await p.locator('.board-editor').waitFor({ state: 'detached' });
      await p.getByText('Retained draft', { exact: true }).waitFor();
    }
    console.log(flag, 'draft/retry passed');
    await p.close();
  }
  for (const [kind, restart] of [
    ['research', '继续探索'],
    ['learning', '重新学习'],
    ['writing', '继续展开'],
  ]) {
    for (const width of [390, 1440]) {
      const page = await b.newPage({ viewport: { width, height: 1000 } });
      await page.goto(
        origin +
          `/e2e/toolbox-workspace.html?view=detail&kind=${kind}&theme=${width === 390 ? 'night' : 'day'}${width === 390 ? '&renderProfile=mobile' : ''}`,
      );
      let card = page.locator('.board-card').first();
      const id = await card.getAttribute('data-item-id');
      await card.locator('.board-card__footer button').click();
      if (kind === 'learning') await page.locator('.bAlert').getByRole('button', { name: '确定', exact: true }).click();
      else await page.locator('.board-editor__footer').getByRole('button', { name: '保存', exact: true }).click();
      card = page.locator(`[data-item-id="${id}"]`);
      await page.locator(`[data-lane="knowledge"] [data-item-id="${id}"]`).waitFor();
      await card.locator('.board-card__menu').click();
      await page.getByRole('menuitem', { name: restart, exact: true }).click();
      await page
        .locator('.bAlert')
        .getByText(/重置为待开始/)
        .waitFor();
      await page.locator('.bAlert').getByRole('button', { name: '取消', exact: true }).click();
      await page.locator(`[data-lane="knowledge"] [data-item-id="${id}"]`).waitFor();
      await card.locator('.board-card__menu').click();
      await page.getByRole('menuitem', { name: restart, exact: true }).click();
      await page.locator('.bAlert').getByRole('button', { name: restart, exact: true }).click();
      await page.locator(`[data-lane="inbox"] [data-item-id="${id}"]`).waitFor();
      assert.equal(await page.locator('.project-board__toolbar [role="status"]').count(), 0);
      await page.getByRole('button', { name: '撤销上次操作', exact: true }).waitFor();
      console.log(kind, width, 'reverse conversion cancel/confirm/undo entry passed');
      await page.close();
    }
  }
  for (const theme of ['day', 'night'])
    for (const fail of [false, true]) {
      const page = await b.newPage({ viewport: { width: 1440, height: 1000 } });
      await page.goto(
        origin +
          `/e2e/toolbox-workspace.html?view=detail&kind=research&boardDelay=1&theme=${theme}${fail ? '&itemMutation=error' : ''}`,
      );
      const column = page.locator('.project-board__lane[data-lane="inbox"]');
      await column.scrollIntoViewIfNeeded();
      const before = await column.locator('.board-card').evaluateAll((nodes) => nodes.map((n) => n.dataset.itemId));
      const handle = await column.locator('.board-drag').first().boundingBox();
      const target = await column.locator('.board-card').nth(1).boundingBox();
      await page.mouse.move(handle.x + 10, handle.y + 10);
      await page.mouse.down();
      await page.mouse.move(target.x + 30, target.y + target.height - 5, { steps: 15 });
      await page.waitForTimeout(200);
      await page.mouse.up();
      const frames = await page.evaluate(
        () =>
          new Promise((resolve) => {
            const start = performance.now(),
              frames = [];
            function sample() {
              frames.push({
                time: performance.now() - start,
                ids: [...document.querySelectorAll('[data-lane="inbox"] .board-card')].map((n) => n.dataset.itemId),
              });
              if (performance.now() - start < 1150) requestAnimationFrame(sample);
              else resolve(frames);
            }
            requestAnimationFrame(sample);
          }),
      );
      const expected = [...before].reverse();
      for (const frame of frames.filter((f) => !fail || f.time < 600))
        assert.deepEqual(frame.ids, expected, `drop flicker ${theme} at ${frame.time}ms`);
      assert.deepEqual(frames.at(-1).ids, fail ? before : expected);
      // The pointer stays still after the drop: hover must follow geometry, not the old DOM position.
      const hover = await page.evaluate(
        ({ x, y }) => ({
          hit: document.elementFromPoint(x, y)?.closest('.board-card')?.getAttribute('data-item-id'),
          marked: [...document.querySelectorAll('.board-card.is-hovered')].map((n) => n.getAttribute('data-item-id')),
        }),
        { x: target.x + 30, y: target.y + target.height - 5 },
      );
      assert.deepEqual(hover.marked, hover.hit ? [hover.hit] : [], 'hover remained on the swapped card');
      const current = await column.locator('.board-card').first().boundingBox();
      await page.mouse.move(current.x + current.width / 2, current.y + 20);
      assert.equal(
        await column
          .locator('.board-card')
          .first()
          .evaluate((n) => n.classList.contains('is-hovered')),
        true,
      );
      await page.mouse.move(0, 0);
      assert.equal(await page.locator('.board-card.is-hovered').count(), 0);

      if (fail) await page.locator('.project-board > [role="alert"]').waitFor();
      console.log(theme, fail ? 'failed sort rollback passed' : 'delayed sort stays stable across frames');
      await page.close();
    }
  const p = await b.newPage({ viewport: { width: 390, height: 1000 }, hasTouch: true, isMobile: true });
  await p.goto(origin + '/e2e/toolbox-workspace.html?view=detail&kind=learning&renderProfile=mobile');
  const lane = p.locator('.project-board__lane');
  await lane.scrollIntoViewIfNeeded();
  let original = await lane.locator('.board-card strong').allTextContents();
  let h = await lane.locator('.board-drag').first().boundingBox(),
    target = await lane.locator('.board-card').nth(1).boundingBox();
  const c = await p.context().newCDPSession(p);
  const x = h.x + h.width / 2,
    y = h.y + h.height / 2;
  await c.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
  await p.waitForTimeout(350);
  for (let i = 1; i <= 15; i++) {
    await c.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x, y: y + ((target.y + target.height + 20 - y) * i) / 15 }],
    });
    await p.waitForTimeout(25);
  }
  await p.waitForTimeout(600);
  await c.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await p.waitForTimeout(500);
  if ((await lane.locator('.board-card strong').allTextContents())[0] === original[0])
    throw Error('touch reorder failed');
  console.log('mobile long press reorder passed');
  await b.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
