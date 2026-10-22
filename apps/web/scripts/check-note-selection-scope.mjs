/** Real note library and directory tree backed by an in-memory fixture. */
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
const origin = process.env.RANGE_TEST_ORIGIN || 'http://localhost:5173';
assert(['localhost', '127.0.0.1'].includes(new URL(origin).hostname));
const output = join(tmpdir(), 'lightnote-note-selection-scope');
await mkdir(output, { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
});
const profiles = [
  ...['day', 'night'].flatMap((theme) =>
    ['small', 'medium', 'large'].map((density) => ({ theme, density, width: 1440 })),
  ),
  ...['day', 'night'].map((theme) => ({ theme, density: 'medium', width: 1440, list: true })),
  ...['day', 'night'].map((theme) => ({ theme, density: 'medium', width: 390, mobile: true })),
  { theme: 'day', density: 'medium', width: 1440, english: true },
];
const report = [];
try {
  for (const profile of profiles) {
    const name = `${profile.mobile ? 'mobile' : profile.list ? 'list' : 'card'}-${profile.theme}-${profile.density}${profile.english ? '-en' : ''}`;
    if (process.env.NOTE_SCOPE_FILTER && !name.includes(process.env.NOTE_SCOPE_FILTER)) continue;
    const page = await browser.newPage({
      viewport: { width: profile.width, height: 900 },
      isMobile: !!profile.mobile,
      hasTouch: !!profile.mobile,
    });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.route('**/*', (route) =>
      new URL(route.request().url()).origin === origin ? route.continue() : route.abort(),
    );
    const rows = page.locator('.note-sort-item');
    const all = page.locator('.batch-action-select-all [role=checkbox]');
    const ids = () =>
      page.evaluate(async () =>
        [...(await import('/src/store/resourceSelection.ts')).useResourceSelectionStore().items]
          .map((item) => item.id)
          .sort(),
      );
    const check = async (expected) => assert.deepEqual(await ids(), expected.map(String).sort(), name);
    const tooltip = async (trigger, expected, filename) => {
      const before = await ids();
      await trigger.hover();
      const popup = page.locator('.b-tooltip-popup:visible').filter({ hasText: expected });
      await popup.waitFor();
      assert.equal(await popup.innerText(), expected);
      assert.deepEqual(await ids(), before, 'Showing a hint must not change selection');
      const bounds = await popup.boundingBox();
      assert(
        bounds.x >= 0 && bounds.y >= 0 && bounds.x + bounds.width <= profile.width && bounds.y + bounds.height <= 900,
        'Tooltip stays inside the viewport',
      );
      await page.screenshot({ path: join(output, `${name}-${filename}.png`) });
      await page.mouse.move(0, 0);
      await popup.waitFor({ state: 'hidden' });
    };
    const navigate = async (query) =>
      page.evaluate(async (query) => {
        const { default: router } = await import('/src/router/index.ts');
        await router.push({ path: '/noteLibrary', query });
      }, query);
    const ready = async (expected) => {
      await page.waitForFunction((expected) => {
        const rows = [...document.querySelectorAll('.note-sort-item')];
        return (
          rows.length === expected.length &&
          rows
            .map((row) => row.dataset.rangeSelectionKey)
            .sort()
            .join(',') === expected.sort().join(',')
        );
      }, expected.map(String));
      if (expected.length)
        await page.waitForFunction(
          () =>
            document.querySelector('.batch-action-select-all [role=checkbox]')?.getAttribute('aria-disabled') !==
            'true',
        );
    };
    try {
      await page.goto(
        `${origin}/e2e/batch-entry.html?module=notes&tree&noteScope&theme=${profile.theme}${profile.mobile ? '&renderProfile=mobile' : ''}${profile.english ? '&lang=en' : ''}`,
      );
      await rows.first().waitFor();
      if (profile.list) await page.getByRole('button', { name: '列表', exact: true }).click();
      if (profile.mobile) {
        await page.locator('.mobile-top-bar').getByRole('button', { name: '更多', exact: true }).click();
        await page.getByRole('menuitem', { name: '批量操作', exact: true }).click();
      } else await page.locator('.note-batch-toggle').click();
      await all.waitFor();
      await page.evaluate(
        async (density) => (await import('/src/composables/useUiDensity.ts')).applyUiDensity(density, false),
        profile.density,
      );
      if (!profile.mobile) {
        await page.locator('.note-tree-row[data-note-tree-node-id="1"] .note-tree-toggle').click();
        await page.locator('.note-tree-row[data-note-tree-node-id="3"]').waitFor();
        await page.locator('.note-tree-row[data-note-tree-node-id="3"] .note-tree-toggle').click();
        await page.locator('.note-tree-row[data-note-tree-node-id="7"]').waitFor();
        assert.equal(await page.locator('.note-library-sidebar [role=checkbox]').count(), 6);
        assert.equal(await page.locator('.note-library-sidebar [data-range-selection-item]').count(), 6);
        await page.locator('.note-tree-row[data-note-tree-node-id="1"]').click({ button: 'right' });
        await page
          .getByRole('menuitem', { name: profile.english ? 'Browse child pages' : '浏览子页面', exact: true })
          .click();
      } else await navigate({ parent: '1' });
      await ready(['3', '4']);
      await check([]);
      if (!profile.mobile)
        await tooltip(
          all,
          profile.english
            ? 'Select the loaded notes in the current list, keeping selections from other directories.'
            : '全选当前列表中已加载的笔记，保留其他目录的选择。',
          'select-all-hint',
        );
      const treeBox = (id) => page.locator(`.note-tree-row[data-note-tree-node-id="${id}"]`).getByRole('checkbox');
      if (!profile.mobile) {
        await treeBox('1').click();
        await check(['1']); // A parent checkbox selects itself, never its children.
        await all.click();
        await check(['1', '3', '4']);
        await all.click();
        await check(['1']);
        await treeBox('1').click();
        await check([]);
      }
      await all.click();
      await check(['3', '4']);
      await page.mouse.move(0, 0);
      await page.waitForTimeout(250);
      await page.screenshot({ path: join(output, `${name}-directory-a.png`) });
      if (!profile.mobile) {
        await tooltip(
          all,
          profile.english
            ? 'Deselect the loaded notes in the current list, keeping selections from other directories.'
            : '取消当前列表中已加载笔记的选择，保留其他目录的选择。',
          'deselect-hint',
        );
        assert.equal(await treeBox('3').getAttribute('aria-checked'), 'true');
        await treeBox('3').click();
        await check(['4']);
        assert.equal(await rows.first().getByRole('checkbox').getAttribute('aria-checked'), 'false');
        await rows.first().getByRole('checkbox').click();
        assert.equal(await treeBox('3').getAttribute('aria-checked'), 'true');
        await treeBox('1').click();
        await treeBox('2').click({ modifiers: ['Shift'] });
        await check(['1', '2', '3', '4', '7']); // Hidden children 5/6 stay out of the tree range.
        await all.click();
        await check(['1', '2', '7']);
        await page.locator('.resource-batch-action-bar__clear').click();
        await all.click();
        await check(['3', '4']);
      }

      await navigate({ parent: '2' });
      await ready(['5', '6']);
      await check(['3', '4']);
      await all.click();
      await check(['3', '4', '5', '6']);
      await all.click();
      await check(['3', '4']);
      await navigate({ parent: '1' });
      await ready(['3', '4']);
      assert.equal(await rows.getByRole('checkbox', { checked: true }).count(), 2);
      await all.click();
      await check([]);
      const first = rows.first().getByRole('checkbox').first();
      const last = rows.last().getByRole('checkbox').first();
      if (profile.mobile) {
        await page.locator('.range-selection-toggle').click();
        await first.tap();
        await check([]);
        await last.tap();
      } else {
        await first.click();
        await last.click({ modifiers: ['Shift'] });
      }
      await check(['3', '4']);
      const search = page.locator('.note-search input');
      // Exercise directory-filter boundaries in the desktop list controls.
      if (!profile.mobile) {
        await search.fill('3');
        await ready(['3']);
        await all.click();
        await check(['4']);
        await all.click();
        await check(['3', '4']);
        await search.fill('no-results');
        await ready([]);
        assert.equal(await all.getAttribute('aria-disabled'), 'true');
        await check(['3', '4']);
        await search.fill('');
        await ready(['3', '4']);
        // Opening another page from the tree keeps the original scope selection; hidden list cannot be selected.
        await page
          .locator('.note-tree-row[data-note-tree-node-id="7"] .note-tree-title')
          .click({ modifiers: ['Shift'] });
        const preview = page.locator('.note-readonly-preview');
        await preview.waitFor();
        await ready([]);
        assert.equal(await all.count(), 0, 'Preview hides the list select-all checkbox');
        await check(['3', '4']);
        const current = preview.getByRole('checkbox');
        await current.click();
        await check(['3', '4', '7']);
        assert.equal(await treeBox('7').getAttribute('aria-checked'), 'true');
        await treeBox('7').click();
        assert.equal(await current.getAttribute('aria-checked'), 'false');
        await check(['3', '4']);
        await treeBox('1').click();
        await treeBox('2').click({ modifiers: ['Shift'] });
        await check(['1', '2', '3', '4', '7']);
        assert.equal(await all.count(), 0);
        assert.equal(await current.getAttribute('aria-checked'), 'true');
        await page.mouse.move(0, 0);
        await page.screenshot({ path: join(output, `${name}-preview.png`) });
        const help = page.locator('.batch-action-preview-help');
        await tooltip(
          help,
          profile.english
            ? 'While previewing, select notes in the left tree or use “Select this note” at the top right. Return to the list to select all notes in the current list.'
            : '正文预览中，可在左侧目录或右上角“选择此篇”勾选笔记；返回列表后，可全选当前列表。',
          'preview-hint',
        );
        const selectedBeforeHelp = await ids();
        await help.click();
        assert.deepEqual(await ids(), selectedBeforeHelp);
        assert.equal(await all.count(), 0);

        await navigate({ parent: '1' });
        await ready(['3', '4']);
        assert.equal(await all.count(), 1);
        await page.locator('.resource-batch-action-bar__clear').click();
        await all.click();
        await check(['3', '4']);
      }
      await page.screenshot({ path: join(output, `${name}-selected.png`) });
      assert.deepEqual(errors, [], name);
      report.push({ name, ok: true });
      console.log('PASS', name);
    } catch (error) {
      await page.screenshot({ path: join(output, `${name}-failure.png`) });
      await writeFile(
        join(output, `${name}-failure.txt`),
        `${error.stack}\n${errors.join('\n')}\n${await page.locator('body').innerText()}`,
      );
      throw error;
    } finally {
      await page.close();
    }
  }
} finally {
  await writeFile(join(output, 'report.json'), JSON.stringify(report, null, 2));
  await browser.close();
}
console.log(`Note scope screenshots: ${output}`);
