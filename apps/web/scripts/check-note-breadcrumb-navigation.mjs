/** Note breadcrumb scopes and preferences, using the real UI with an in-memory fixture. */
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
const origin = process.env.RANGE_TEST_ORIGIN || 'http://localhost:5173';
assert(['localhost', '127.0.0.1'].includes(new URL(origin).hostname));
const output = join(tmpdir(), 'lightnote-note-breadcrumb-navigation');
await mkdir(output, { recursive: true });
const profiles = [
  ...['day', 'night'].flatMap((theme) =>
    ['children', 'preview'].flatMap((parentMode) =>
      ['card', 'list'].map((view) => ({ theme, parentMode, view, density: 'medium' })),
    ),
  ),
  ...['children', 'preview'].map((parentMode) => ({
    theme: 'day',
    parentMode,
    view: 'card',
    density: 'medium',
    directEdit: true,
  })),
  { theme: 'day', parentMode: 'children', view: 'card', density: 'small' },
  { theme: 'night', parentMode: 'preview', view: 'list', density: 'large' },
  { theme: 'day', parentMode: 'preview', view: 'card', density: 'medium', english: true },
];
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
});
const report = [];
try {
  for (const profile of profiles) {
    const name = `${profile.parentMode}-${profile.view}-${profile.theme}-${profile.density}${profile.directEdit ? '-direct-edit' : ''}${profile.english ? '-en' : ''}`;
    if (process.env.NOTE_NAV_FILTER && !name.includes(process.env.NOTE_NAV_FILTER)) continue;
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    page.setDefaultTimeout(20000);
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.route('**/*', (route) =>
      new URL(route.request().url()).origin === origin ? route.continue() : route.abort(),
    );
    const rows = page.locator('.note-sort-item');
    const preview = page.locator('.note-readonly-preview');
    const nav = (query) =>
      page.evaluate(
        async (query) => window.batchEntryFixture.router.push({ path: '/noteLibrary', query }),
        query,
      );
    const waitRoute = (parent, body) =>
      page.waitForFunction(
        async ({ parent, body }) => {
          const route = window.batchEntryFixture?.router.currentRoute.value;
          return (
            route?.path === '/noteLibrary' &&
            (route.query.parent || '') === parent &&
            (route.query.preview || '') === body
          );
        },
        { parent, body },
      );
    const waitList = async (parent, count) => {
      await waitRoute(parent, '');
      await page.waitForFunction(
        (count) =>
          document.querySelectorAll('.note-sort-item').length === count &&
          !document.querySelector('.note-readonly-preview'),
        count,
      );
    };
    const waitPreview = async (parent, id) => {
      await waitRoute(parent, id);
      await preview.getByRole('heading', { name: `设计资料 ${id}`, exact: true }).waitFor();
    };
    const parentCrumb = (id) =>
      preview
        .locator('.note-readonly-preview__breadcrumb')
        .getByRole('button', { name: `设计资料 ${id}`, exact: true });
    const selected = () =>
      page.evaluate(async () =>
        (await import('/src/store/resourceSelection.ts'))
          .useResourceSelectionStore()
          .items.map((item) => item.id)
          .sort(),
      );
    const assertSelection = async () => {
      assert.deepEqual(await selected(), ['7', '8'], name);
      assert.equal(await page.locator('.resource-batch-action-bar').count(), 1, 'Keep batch mode');
      assert.equal(
        await page.evaluate(async () => (await import('/src/store/index.ts')).useUserStore().preferences.noteViewMode),
        profile.view,
      );
    };
    try {
      await page.goto(
        `${origin}/e2e/batch-entry.html?module=notes&tree&noteScope&noteNavigation&parentMode=${profile.parentMode}&view=${profile.view}&theme=${profile.theme}${profile.directEdit ? '&directEdit' : ''}${profile.english ? '&lang=en' : ''}`,
      );
      await waitList('', 26);
      await page.evaluate(
        async (density) => (await import('/src/composables/useUiDensity.ts')).applyUiDensity(density, false),
        profile.density,
      );
      // Ordinary parent clicks and breadcrumb clicks must resolve the same preference.
      await page.locator('.note-tree-row[data-note-tree-node-id="1"] .note-tree-title').click();
      if (profile.parentMode === 'children') await waitList('1', 2);
      else await waitPreview('', '1');
      if (profile.parentMode === 'children') await page.locator('.note-directory-breadcrumbs button').first().click();
      else await preview.locator('.note-readonly-preview__crumb').first().click();
      await waitList('', 26);
      if (!profile.directEdit) {
        // Both card and list items expose the title; scope by the stable note identity.
        const title = page.locator('.note-sort-item[data-note-sort-id="26"] .note-title');
        await title.scrollIntoViewIfNeeded();
        // Capture the user's actual click position: Playwright may scroll again to make a hover-shifted title actionable.
        await title.evaluate((element) =>
          element.addEventListener(
            'click',
            () => {
              window.__noteNavClickScroll = document.querySelector(
                '.note-main-panel [data-mobile-resource-scroll]',
              ).scrollTop;
            },
            { capture: true, once: true },
          ),
        );
        await title.click();
        const scroll = await page.evaluate(() => window.__noteNavClickScroll);
        assert(scroll > 0, 'Fixture has a scroll position to preserve');
        await waitPreview('', '26');
        await parentCrumb('3').click();
        if (profile.parentMode === 'children') await waitList('3', 2);
        else await waitPreview('', '3');
        await page.evaluate(async () => window.batchEntryFixture.router.back());
        await waitPreview('', '26');
        await page.evaluate(async () => window.batchEntryFixture.router.back());
        await waitList('', 26);
        await page
          .waitForFunction(
            (expected) =>
              Math.abs(document.querySelector('.note-main-panel [data-mobile-resource-scroll]').scrollTop - expected) <
              1,
            scroll,
          )
          .catch(async (error) => {
            const actual = await page
              .locator('.note-main-panel [data-mobile-resource-scroll]')
              .evaluate((element) => ({ top: element.scrollTop, max: element.scrollHeight - element.clientHeight }));
            throw new Error(`${error.message}: expected scroll ${scroll}, actual ${JSON.stringify(actual)}`);
          });
        await page.evaluate(async () => window.batchEntryFixture.router.forward());
        await waitPreview('', '26');
        await nav({});
        await waitList('', 26);
      }
      await page.locator('.note-batch-toggle').click();
      await nav({ parent: '1', preview: '7' });
      await waitPreview('1', '7');
      const treeBox = (id) => page.locator(`.note-tree-row[data-note-tree-node-id="${id}"]`).getByRole('checkbox');
      await treeBox('7').click();
      await treeBox('8').click();
      await assertSelection();
      await preview.locator('.note-readonly-preview__crumb').first().click();
      await waitList('', 26);
      await assertSelection();
      await nav({ parent: '1', preview: '7' });
      await waitPreview('1', '7');
      await page.locator('.resource-page-title-action').click();
      await waitList('', 26);
      await assertSelection();
      await nav({ parent: '1', preview: '7' });
      await waitPreview('1', '7');
      await parentCrumb('3').click();
      if (profile.parentMode === 'children') await waitList('3', 2);
      else await waitPreview('1', '3');
      await assertSelection();
      await page.screenshot({ path: join(output, `${name}-parent.png`) });
      await nav({ parent: '1', preview: '7' });
      await waitPreview('1', '7');
      await parentCrumb('1').click();
      if (profile.parentMode === 'children') await waitList('1', 2);
      else await waitPreview('1', '1');
      await assertSelection();
      // Directory-list ancestors use the same opener, including preview mode.
      await nav({ parent: '3' });
      await waitList('3', 2);
      await page
        .locator('.note-directory-breadcrumbs')
        .getByRole('button', { name: '设计资料 1', exact: true })
        .click();
      if (profile.parentMode === 'children') await waitList('1', 2);
      else await waitPreview('3', '1');
      await assertSelection();
      // Explicit body/edit actions are independent of parent opening preferences.
      await nav({ parent: '3' });
      await waitList('3', 2);
      await page.getByRole('button', { name: profile.english ? 'Open page body' : '打开正文', exact: true }).click();
      await waitPreview('3', '3');
      await assertSelection();
      await page.screenshot({ path: join(output, `${name}-explicit-body.png`) });
      await preview.getByRole('button', { name: profile.english ? 'Edit' : '编辑', exact: true }).click();
      await page.waitForFunction(
        async () => window.batchEntryFixture.router.currentRoute.value.path === '/noteLibrary/3',
      );
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
console.log(`Breadcrumb screenshots: ${output}`);
