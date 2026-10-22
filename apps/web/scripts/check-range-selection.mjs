/** Real resource/task screens; every fixture uses an in-memory API adapter. */
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const origin = process.env.RANGE_TEST_ORIGIN || 'http://localhost:5173';
assert(['localhost', '127.0.0.1'].includes(new URL(origin).hostname));
const output = join(tmpdir(), 'lightnote-shared-range-selection');
await mkdir(output, { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
});
const cases = [
  {
    name: 'bookmarks',
    file: 'batch-entry',
    params: { module: 'bookmarks' },
    module: 'bookmarks',
    row: '.bookmark-card-wrap',
    body: '[data-range-select]',
  },
  {
    name: 'bookmark-manage',
    file: 'batch-entry',
    params: { module: 'bookmarks' },
    module: 'bookmarks',
    row: '.bookmark-card',
    manage: true,
  },
  {
    name: 'bookmark-mobile',
    file: 'batch-entry',
    params: { module: 'bookmark-mobile' },
    module: 'bookmarks',
    row: '.list-item[data-range-selection-item]',
    body: '.mobile-list-row',
    mobileOnly: true,
  },
  {
    name: 'bookmark-table',
    file: 'batch-entry',
    params: { module: 'bookmarks' },
    module: 'bookmarks',
    row: '.table-row',
    manage: true,
    table: true,
  },
  {
    name: 'notes',
    file: 'batch-entry',
    params: { module: 'notes' },
    module: 'notes',
    row: '.note-sort-item',
    body: '[data-range-select]',
  },
  {
    name: 'notes-list',
    file: 'batch-entry',
    params: { module: 'notes' },
    module: 'notes',
    row: '.note-sort-item',
    body: '[data-range-select]',
    list: true,
  },
  {
    name: 'notes-with-tree',
    file: 'batch-entry',
    params: { module: 'notes', tree: '' },
    module: 'notes',
    row: '.note-sort-item',
    body: '[data-range-select]',
  },
  {
    name: 'note-tree',
    file: 'batch-entry',
    params: { module: 'notes', tree: '' },
    module: 'notes',
    row: '.note-tree-row',
    desktopOnly: true,
  },
  {
    name: 'suggestions',
    file: 'organize-outcomes',
    params: { volume: '' },
    row: '.group-priority .workspace-resource[data-range-selection-item]',
    size: 2,
    suggestions: true,
  },
  {
    name: 'search',
    file: 'search-todos',
    params: { groups: '' },
    module: 'search',
    row: '.resource-result-entry[data-range-selection-item]',
    body: '.result-click-area',
  },
  {
    name: 'untagged',
    file: 'organize-lists',
    params: { issue: 'untagged' },
    row: '.organize-resource-row',
    body: '.organize-resource-row__body',
  },
  {
    name: 'todos',
    file: 'range-selection',
    params: { module: 'todo' },
    row: '.todo-item',
    body: '.todo-item__selection-title',
    size: 5,
  },
  {
    name: 'inbox',
    file: 'range-selection',
    params: { module: 'inbox' },
    row: '.resource-inbox-entry',
    body: '.inbox-item__body',
  },
  {
    name: 'tag-icons',
    file: 'organize-tag-icons',
    params: {},
    row: '.workspace-resource[data-range-selection-item]',
    size: 2,
    icon: true,
  },
];
const profiles = [
  { width: 1440, theme: 'day', density: 'small' },
  { width: 1440, theme: 'night', density: 'large' },
  { width: 390, theme: 'day', mobile: true },
  { width: 390, theme: 'night', mobile: true },
];
const report = [];
async function enter(page, test, profile) {
  if (test.module) {
    if (test.list) await page.getByRole('button', { name: '列表', exact: true }).click();
    if (test.manage) {
      if (profile.mobile) return false; // Separate PhoneListMg fixture below.
      await page.locator('.bookmark-batch-toggle').click();
      await page.locator('.bookmark-card').first().waitFor();
      if (test.table) await page.locator('.view-toggle-btn').nth(1).click();
    }
    // Enable the original shared selection session; subsequent clicks are real user gestures.
    await page.evaluate(async (owner) => {
      const { useResourceSelectionStore } = await import('/src/store/resourceSelection.ts');
      const { useUserStore } = await import('/src/store/index.ts');
      const { buildNoteDetailRequestScope } = await import('/src/api/noteDetailPrefetch.ts');
      const selection = useResourceSelectionStore();
      selection.start(owner, buildNoteDetailRequestScope(useUserStore()));
      window.rangeSelectionSession = selection;
    }, test.module);
  } else if (test.name === 'todos' || test.name === 'inbox') {
    if (profile.mobile || test.name === 'inbox') {
      const menu = page.locator(
        test.name === 'inbox' ? '.resource-center-topbar__menu' : '.mobile-top-bar__action--auxiliary',
      );
      if (await menu.count()) {
        await menu.click();
        await page.getByRole('menuitem', { name: /批量/ }).click();
      }
    } else
      await page
        .getByRole('button', { name: test.icon || test.suggestions ? '批量应用' : '批量操作', exact: true })
        .click();
  } else
    await page
      .getByRole('button', { name: test.icon || test.suggestions ? '批量应用' : '批量操作', exact: true })
      .click();
  if (test.suggestions)
    await page
      .locator(
        profile.mobile ? '.resource-batch-action-bar--mobile [role=checkbox]' : '.batch-selection-info [role=checkbox]',
      )
      .click();
  return true;
}
async function checkCount(page, test, count) {
  if (test.module) await page.waitForFunction((count) => window.rangeSelectionSession.items.length === count, count);
  else if (test.suggestions)
    await page
      .getByRole('button', { name: `应用所选 ${count} 项`, exact: true })
      .first()
      .waitFor();
  else if (test.name === 'inbox')
    await page.waitForFunction((count) => window.rangeFixture.inbox.selectedKeys.length === count, count);
  else
    await page
      .getByText(new RegExp(`已选(?:择)?\\s*${count}\\s*(?:项|个)`))
      .first()
      .waitFor();
}
try {
  for (const test of cases.slice(
    process.env.RANGE_TEST_FROM ? cases.findIndex((test) => test.name === process.env.RANGE_TEST_FROM) : 0,
  ))
    for (const profile of profiles) {
      if (process.env.RANGE_TEST_CASE && test.name !== process.env.RANGE_TEST_CASE) continue;
      if (
        (test.manage && profile.mobile) ||
        (test.mobileOnly && !profile.mobile) ||
        (test.desktopOnly && profile.mobile)
      )
        continue;
      const name = `${test.name}-${profile.width}-${profile.theme}-${profile.density || 'standard'}`;
      const page = await browser.newPage({
        viewport: { width: profile.width, height: 844 },
        isMobile: !!profile.mobile,
        hasTouch: !!profile.mobile,
      });
      const errors = [];
      page.on('pageerror', (error) => errors.push(error.message));
      page.on('console', (message) => {
        if (message.type() === 'warning' && /non-element root|directive.*root/i.test(message.text()))
          errors.push(message.text());
      });
      await page.route('**/*', (route) =>
        new URL(route.request().url()).origin === origin ? route.continue() : route.abort(),
      );
      const url = new URL(`/e2e/${test.file}.html`, origin);
      for (const [key, value] of Object.entries({
        ...test.params,
        theme: profile.theme,
        density: profile.density || 'medium',
        renderProfile: profile.mobile ? 'mobile' : '',
      }))
        url.searchParams.set(key, value);
      try {
        await page.goto(url.href);
        await page.waitForTimeout(500);
        await page.evaluate(
          async (density) =>
            (await import('/src/composables/useUiDensity.ts')).applyUiDensity(density, innerWidth < 768),
          profile.density,
        );
        if (!(await enter(page, test, profile))) continue;
        const rows = page.locator(`${test.row}.range-selection-active`);
        await rows.first().waitFor();
        const keys = await rows.evaluateAll((elements) =>
          elements.map((element) => ({
            key: element.dataset.rangeSelectionKey,
            group: element.dataset.rangeSelectionGroup,
          })),
        );
        const group = keys[0].group,
          ordered = keys.filter((key) => key.group === group);
        const count = test.size || Math.min(7, ordered.length);
        assert(count >= 2, `${name}: no selectable rows`);
        const row = (index) =>
          page
            .locator(`[data-range-selection-key="${ordered[index].key}"][data-range-selection-group="${group}"]`)
            .filter({ visible: true });
        const pick = async (index, shift = false, body = false) => {
          const target = test.icon
            ? row(index).locator('header').first()
            : body && test.body && !(test.name === 'inbox' && !profile.mobile)
              ? row(index).locator(test.body).first()
              : row(index).getByRole('checkbox').first();
          await target.scrollIntoViewIfNeeded();
          if (profile.mobile) await target.tap();
          else await target.click({ modifiers: shift ? ['Shift'] : [] });
        };
        if (!test.icon && !test.suggestions) {
          await pick(0, false, true);
          await checkCount(page, test, 1);
        }
        if (profile.mobile) {
          await page.locator('.range-selection-toggle').click();
          await pick(test.icon || test.suggestions ? 0 : 2, false, !test.icon);
          if (!test.icon && !test.suggestions) await checkCount(page, test, 1);
          await page.locator('.range-selection-anchor').waitFor();
          await page.screenshot({ path: join(output, `${name}-start.png`) });
          if (test.name === 'search' || test.name === 'todos') {
            const other = keys.find((key) => key.group !== group);
            assert(other, `${name}: missing second group`);
            const otherCheckbox = page
              .locator(`[data-range-selection-key="${other.key}"][data-range-selection-group="${other.group}"]`)
              .getByRole('checkbox')
              .first();
            await otherCheckbox.scrollIntoViewIfNeeded();
            await otherCheckbox.tap();
            await page.getByText('请在起点所在分组内选择终点', { exact: true }).waitFor();
            await checkCount(page, test, 1);
          }

          await pick(count - 1, false, !test.icon);
          await page.waitForFunction(
            () => document.querySelector('.range-selection-toggle')?.getAttribute('aria-pressed') === 'false',
          );
        } else {
          if (!test.icon && !test.suggestions) await pick(2, false, true);
          else await pick(0);
          await pick(count - 1, true, !test.icon);
        }
        await checkCount(page, test, test.icon || test.suggestions ? 2 : count - 1);
        assert.equal(await page.evaluate(() => getSelection()?.toString() || ''), '', `${name}: browser selected text`);
        if (profile.mobile && test.name !== 'inbox') {
          const selector =
            test.name === 'bookmark-mobile'
              ? '.list-body'
              : test.name === 'search'
                ? '.result-scroll-area'
                : test.name === 'untagged'
                  ? '.organize-issue-view'
                  : test.name === 'todos'
                    ? '.inbox-scroll'
                    : test.icon || test.suggestions
                      ? '.organize-suggestion-workspace'
                      : '[data-mobile-resource-scroll]';
          const scrollOwner = page.locator(selector).filter({ visible: true }).first();
          for (let index = 0; index < (test.name === 'untagged' ? 30 : 2); index++) {
            await scrollOwner.evaluate((element) => {
              element.scrollTop = element.scrollHeight;
            });
            await page.waitForTimeout(80);
            if (
              test.name === 'untagged' &&
              (await page.evaluate(() => !window.organizeFixture.store.lists.untagged.hasMore))
            )
              break;
          }
          await scrollOwner.evaluate((element) => {
            element.scrollTop = element.scrollHeight;
          });
          await page.waitForTimeout(100);
          const last = await page.locator(`${test.row}.range-selection-active`).last().boundingBox();
          const bar = await page.locator('.resource-batch-action-bar--mobile').boundingBox();
          assert(last && bar && last.y + last.height <= bar.y + 1, `${name}: last row hidden behind the toolbar`);
        }
        assert.deepEqual(errors, [], name);
        await page.screenshot({ path: join(output, `${name}-complete.png`) });
        if (test.name === 'search' && !profile.mobile) {
          await page.evaluate(() => window.rangeSelectionSession.clear());
          await page.getByRole('button', { name: '全部匹配结果', exact: true }).click();
          await page.waitForFunction(() => !!window.rangeSelectionSession.query);
          await page.locator('.resource-result-entry[data-search-resource-key]').first().getByRole('checkbox').click();
          await page.waitForFunction(() => window.rangeSelectionSession.query.excludedItems.length === 1);
        }
        report.push({ name, ok: true });
        console.log('PASS', name);
      } catch (error) {
        await page.screenshot({ path: join(output, `${name}-failure.png`) });
        await writeFile(
          join(output, `${name}-failure.txt`),
          `${error.stack}\n${errors.join('\n')}\n${await page.locator('body').innerText()}`,
        );
        throw new Error(`${name}: ${error.message}`);
      } finally {
        await page.close();
      }
    }
} finally {
  await writeFile(join(output, 'report.json'), JSON.stringify(report, null, 2));
  await browser.close();
}
console.log(`Range selection screenshots: ${output}`);
