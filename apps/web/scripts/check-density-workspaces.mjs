import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { mkdir } from 'node:fs/promises';
const origin = process.env.LIGHTNOTE_WEB_ORIGIN || 'http://localhost:5173';
assert(['localhost', '127.0.0.1'].includes(new URL(origin).hostname));
const output = '/tmp/lightnote-density-workspaces';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
});
const cases = [
  ['notes', '/noteLibrary', '.note-workspace-shell'],
  ['bookmarks', '/home', '.bookmark-main-panel'],
  ['files', '/cloudSpace', '.field-list'],
  ['todo', '/inbox?tab=todo', '.inbox-content'],
  ['search', '/search', '.result-panel'],
  ['workbench', '/workbenches', '.workbenches-container, .mobile-today'],
  ['settings', '/settings', '.settings-page'],
  ['toolbox', '/toolbox?view=catalog', '.toolbox-group-filter'],
];
try {
  for (const width of [1440, 900, 390].filter(
    (width) => !process.env.DENSITY_WIDTHS || process.env.DENSITY_WIDTHS.split(',').includes(String(width)),
  )) {
    const context = await browser.newContext({ viewport: { width, height: 1000 }, reducedMotion: 'reduce' });
    const page = await context.newPage();
    for (const [name, path, selector] of cases.filter(
      ([name]) => !process.env.DENSITY_MODULES || process.env.DENSITY_MODULES.split(',').includes(name),
    )) {
      await page.goto(`${origin}${path}${path.includes('?') ? '&' : '?'}${width < 1200 ? 'renderProfile=mobile' : ''}`);
      await page.locator(selector).first().waitFor({ state: 'visible', timeout: 15000 });
      for (const theme of ['day', 'night']) {
        let standardRootDisplay;
        for (const density of ['medium', 'small', 'large']) {
          await page.evaluate(
            async ({ density, theme }) => {
              const { default: useUserStore } = await import('/src/store/useUser.ts');
              const user = useUserStore();
              user.preferences.uiScale = density;
              user.preferences.theme = theme;
            },
            { density, theme },
          );
          await page.waitForTimeout(350);
          const state = await page.evaluate(() => ({
            density: document.documentElement.dataset.density,
            zoom: getComputedStyle(document.documentElement).zoom,
            rootDisplay: getComputedStyle(document.documentElement).display,
            overflow: document.documentElement.scrollWidth - innerWidth,
          }));
          assert.equal(state.zoom, '1');
          if (density === 'medium') standardRootDisplay = state.rootDisplay;
          assert.equal(
            state.rootDisplay,
            standardRootDisplay,
            'Density must not apply component display rules to html',
          );
          assert.equal(
            state.density,
            width < 1200 ? 'standard' : { medium: 'standard', small: 'compact', large: 'comfortable' }[density],
            `${name} ${width}`,
          );
          assert.ok(state.overflow <= 2, `${name}/${width}/${density} page overflow ${state.overflow}`);
          if (density !== 'medium')
            await page.screenshot({ path: `${output}/${name}-${width}-${theme}-${density}.png` });
        }
      }
      console.log(`PASS ${name} ${width}: three densities, two themes`);
    }
    await context.close();
  }
} finally {
  await browser.close();
}
