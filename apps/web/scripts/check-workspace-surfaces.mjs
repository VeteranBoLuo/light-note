/** Browser regression for the real workspace routes. Requires local Web/API demo data.
 * Uses an isolated guest profile: no saved account, edits, AI calls or production URLs.
 * CHROME_PATH can select the locally installed browser; screenshots stay outside the repo.
 */
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright-core';
const origin = process.env.WORKSPACE_TEST_ORIGIN || 'http://localhost:5173';
assert(['localhost', '127.0.0.1'].includes(new URL(origin).hostname), 'Use a local preview');
const output = process.env.WORKSPACE_TEST_OUTPUT || join(tmpdir(), 'light-note-workspace-surfaces');
await mkdir(output, { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || (process.platform === 'darwin' ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' : undefined),
  headless: true,
});
const cases = [
  { name: 'bookmarks', stat: '.filter-all-count', statToken: '--workspace-purple-stat', path: '/home', canvas: '.bookmark-main-panel', content: '.card-body', nav: '.filter-all-entry.active' },
  { name: 'notes', stat: '.note-tree-root-count', statToken: '--workspace-note-stat', path: '/noteLibrary', canvas: '.note-workspace-shell', content: '.note-card', nav: '.note-tree-root.is-browse-scope' },
  { name: 'files', stat: '.cloud-folder-row--all .cloud-folder-row__count', statToken: '--workspace-file-stat', path: '/cloudSpace', lightCanvas: 'white', canvas: '.field-list', content: '.file-card, .field-item', nav: '.cloud-folder-row.is-current' },
  { name: 'todo', path: '/inbox?tab=todo', lightCanvas: 'white', canvas: '.inbox-content', content: '.todo-summary-card, .todo-item', nav: '.todo-workspace-sidebar button.active' },
  { name: 'tags', path: '/tag/surface-fixture', lightCanvas: 'white', canvas: '.tag-space-main', content: '.tag-profile-card', nav: '.tag-directory-row.is-active' },
  { name: 'resources', path: '/search', lightCanvas: 'white', canvas: '.result-panel', content: '.resource-result-entry:not(.is-inspected) .result-item:not(.result-item--selected)', nav: '.resource-scope-item.active' },
  { name: 'workshop', path: '/toolbox?view=catalog', lightCanvas: 'white', canvas: '.toolbox-group-filter', content: '.toolbox-card', nav: '.toolbox-group-filter .b-chip--selected' },
];
const failures = [], results = [];
function luminance(rgb) {
  const c = rgb.slice(0, 3).map(v => { v /= 255; return v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; });
  return c[0] * .2126 + c[1] * .7152 + c[2] * .0722;
}
function contrast(a, b) { const x = luminance(a), y = luminance(b); return (Math.max(x, y) + .05) / (Math.min(x, y) + .05); }
try {
  for (const viewport of [{ width: 1440, height: 1000 }, { width: 900, height: 1100 }, { width: 390, height: 844 }].filter(v => !process.env.WORKSPACE_TEST_WIDTH || v.width === Number(process.env.WORKSPACE_TEST_WIDTH))) {
    const context = await browser.newContext({ viewport, reducedMotion: 'reduce' });
    const page = await context.newPage();
    // TagSpace's independent API may be unavailable in a local server checkout.
    // Exercise the actual TagDetail component with explicit, non-personal contract fixtures.
    const tag = { id: 'surface-fixture', name: 'Surface review', description: 'Workspace visual fixture', iconUrl: '', sort: 0, createTime: null, lastActivityTime: null, counts: { bookmark: 1, note: 0, file: 0, total: 1 }, previewResources: [] };
    const fixture = async (route, data) => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ status: 200, data }) });
    await page.route('**/bookmark/getTagSpace', route => fixture(route, { tag, relatedTags: [] }));
    await page.route('**/bookmark/queryTagSpaces', route => fixture(route, { items: [tag], total: 1, page: 1, pageSize: 40, hasMore: false, filter: 'all', sort: 'default', keyword: '', includeEmpty: true, facets: { all: 1, bookmark: 1, note: 0, file: 0, empty: 0 }, overview: { tagTotal: 1, activeTagTotal: 1, emptyTagTotal: 0, covered: { bookmark: 1, note: 0, file: 0 } } }));
    await page.route('**/bookmark/queryTagSpaceResources', route => fixture(route, { items: [{ id: 'surface-resource', type: 'bookmark', title: 'Surface example', description: 'Non-personal browser fixture', url: 'https://example.com', iconUrl: '', fileType: '', fileSize: 0, folderName: '', createTime: null, updateTime: null, addedTime: null, tags: [] }], total: 1, page: 1, pageSize: 40, hasMore: false, keyword: '', type: 'all', sort: 'updated' }));

    for (const item of cases.filter(c => !process.env.WORKSPACE_TEST_MODULE || c.name === process.env.WORKSPACE_TEST_MODULE)) {
      const id = `${item.name}-${viewport.width}`;
      try {
        const url = new URL(item.path, origin);
        if (viewport.width < 1200) url.searchParams.set('renderProfile', 'mobile');
        await page.goto(url.toString());
        await page.mouse.move(0, 0);
        await page.locator(item.canvas).first().waitFor({ state: 'attached', timeout: 15000 });
        await page.locator(item.content).first().waitFor({ state: 'attached', timeout: 15000 });
        for (const theme of ['day', 'night']) {
          await page.evaluate(t => document.documentElement.setAttribute('data-theme', t), theme);
          // Existing controls animate colors; assert the settled surface, not an intermediate frame.
          await page.waitForTimeout(500);
          const checks = await page.evaluate(({ canvas, content, nav }) => {
            const read = (selector) => [...document.querySelectorAll(selector)].filter(e => e.getBoundingClientRect().width > 0).map(e => {
              const c = getComputedStyle(e);
              return { background: c.backgroundColor, image: c.backgroundImage, color: c.color, border: c.borderTopColor };
            });
            return { canvas: read(canvas), content: read(content), nav: read(nav) };
          }, item);
          const expected = theme === 'day' ? [item.lightCanvas === 'white' ? 'rgb(255, 255, 255)' : 'rgb(246, 247, 251)', 'rgb(255, 255, 255)'] : ['rgb(37, 39, 46)', 'rgb(46, 48, 56)'];
          for (const [role, color] of [['canvas', expected[0]], ['content', expected[1]]]) {
            assert(checks[role].length, `${id}: missing visible ${role}`);
            for (const c of checks[role]) {
              assert.equal(c.background, color, `${id}/${theme}/${role}`);
              assert.equal(c.image, 'none', `${id}/${theme}/${role}: tinted image`);
            }
          }
          for (const n of checks.nav) {
            const rgb = s => s.match(/[\d.]+/g).map(Number);
            assert(contrast(rgb(n.color), rgb(n.background)) >= 4.5, `${id}/${theme}: navigation contrast ${JSON.stringify(n)}`);
          }
          if (item.stat) {
            const borders = await page.evaluate(({ nav, statToken }) => {
              const probe = document.createElement('span');
              probe.style.color = 'var(' + statToken + ')';
              document.body.append(probe);
              const expected = getComputedStyle(probe).color;
              probe.remove();
              return [...document.querySelectorAll(nav)].filter(e => e.getBoundingClientRect().width > 0).map(e => ({ actual: getComputedStyle(e).borderTopColor, expected }));
            }, item);
            for (const border of borders) assert.equal(border.actual, border.expected, id + '/' + theme + '/stat-border');
            const stats = await page.evaluate(({ stat, statToken }) => {
              const probe = document.createElement('span');
              probe.style.color = 'var(' + statToken + ')';
              document.body.append(probe);
              const expected = getComputedStyle(probe).color;
              probe.remove();
              return [...document.querySelectorAll(stat)].filter(e => e.getBoundingClientRect().width > 0).map(e => ({ actual: getComputedStyle(e).color, expected }));
            }, item);
            for (const stat of stats) assert.equal(stat.actual, stat.expected, id + '/' + theme + '/stat');
          }
          await page.screenshot({ path: join(output, `${id}-${theme}.png`) });
          results.push({ id, theme, checks });
        }
      } catch (error) { failures.push(`${id}: ${error.message}`); console.error(failures.at(-1)); }
      console.log(id, failures.at(-1)?.startsWith(id + ':') ? 'FAIL' : 'PASS');
    }
    await context.close();
  }
} finally { await browser.close(); }
await writeFile(join(output, 'results.json'), JSON.stringify({ results, failures }, null, 2));
console.log(`Screenshots and computed colors: ${output}`);
if (failures.length) { console.error(failures.join('\n')); process.exitCode = 1; }
