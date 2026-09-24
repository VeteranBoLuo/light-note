// Isolated local fixture; no user data or database writes.
import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const origin = process.env.BOARD_TEST_ORIGIN || 'http://localhost:5173';
assert(['localhost', '127.0.0.1'].includes(new URL(origin).hostname));
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  for (const width of [320, 390, 834, 1440]) {
    for (const theme of ['day', 'night']) {
      const page = await browser.newPage({ viewport: { width, height: 1000 }, reducedMotion: 'reduce' });
      const errors = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await page.goto(
        `${origin}/e2e/toolbox-workspace.html?view=detail&kind=learning&theme=${theme}&locale=${theme === 'night' ? 'en-US' : 'zh-CN'}${width < 768 ? '&renderProfile=mobile' : ''}`,
      );
      await page.locator('.workspace-summary').waitFor();
      await page.waitForTimeout(400);
      if (width < 768) {
        const topBar = await page.evaluate(() => {
          const back = document.querySelector('.project-breadcrumb > button:last-of-type');
          const controls = [...document.querySelectorAll('.project-mobile-controls button')];
          return {
            font: parseFloat(getComputedStyle(document.querySelector('.project-breadcrumb__mobile-title')).fontSize),
            heights: [back, ...controls].map((n) => n.getBoundingClientRect().height),
          };
        });
        assert(topBar.font >= 18, 'mobile project back label is too small');
        assert(
          topBar.heights.every((height) => height >= 44),
          'mobile top bar touch target is too small',
        );
      }
      const nav = page.locator('.project-section-navigation');
      if (width >= 1200) {
        await nav.locator(':scope > button').nth(2).click();
      } else {
        assert.equal(await nav.isVisible(), false);
        await page.locator('.project-directory-trigger').click();
        await page.getByRole('menuitem').nth(2).click();
        await page.getByRole('menu').waitFor({ state: 'detached' });
      }
      await page.waitForTimeout(350);
      const position = await page.evaluate(() => {
        const head = document.querySelector('.workspace-detail-head').getBoundingClientRect();
        const board = document.querySelector('.workspace-board-section').getBoundingClientRect();
        const root = document.querySelector('.knowledge-workspace');
        return {
          headTop: head.top,
          headBottom: head.bottom,
          boardTop: board.top,
          overflow: root.scrollWidth > root.clientWidth + 1,
        };
      });
      assert(position.headTop >= -1, JSON.stringify(position));
      assert(position.boardTop >= position.headBottom - 1, 'header hides selected section');
      assert.equal(await nav.locator(':scope > button').nth(2).getAttribute('aria-current'), 'location');
      assert(!position.overflow, 'horizontal overflow');
      await page.screenshot({ path: join(tmpdir(), `project-chrome-${width}-${theme}.png`) });
      const settings = page.locator(
        width >= 1200 ? '.project-settings-desktop' : '.project-mobile-controls .project-settings-trigger',
      );
      await settings.click();
      await page.locator('.workspace-settings-form').waitFor();
      await page.keyboard.press('Escape');
      await page.locator('.workspace-settings-form').waitFor({ state: 'detached' });
      if (width < 768) {
        await page.evaluate(async () => {
          const { getMobilePageBack } = await import('/src/composables/useMobileTopBar.ts');
          getMobilePageBack('toolboxWorkbench')?.();
        });
      } else {
        await page.locator('.project-breadcrumb > button').last().click();
      }
      await page.locator('.workspace-list-section').waitFor();
      assert.deepEqual(errors, []);
      if (width < 768) {
        const title = await page.evaluate(async () => {
          const { getMobileTopBarBinding } = await import('/src/composables/useMobileTopBar.ts');
          const binding = getMobileTopBarBinding('toolboxWorkbench');
          const title = binding.title();
          binding.onBack();
          return title;
        });
        assert.equal(title, theme === 'night' ? 'Knowledge Workshop' : '知识工坊');
        await page.locator('.toolbox-home').waitFor();
      }
      // The explicit workshop destination must not reuse the one-level project back action.
      await page.reload();
      await page.locator('.workspace-summary').waitFor();
      await page.waitForTimeout(400);
      if (width < 768) {
        await page.locator('.project-mobile-controls .project-settings-trigger').click();
        await page
          .getByRole('button', { name: theme === 'night' ? 'Back to Knowledge Workshop' : '返回知识工坊', exact: true })
          .click();
      } else {
        await page.locator('.project-breadcrumb__workshop').click();
      }
      await page.locator('.toolbox-home').waitFor();
      assert.equal(await page.locator('.workspace-list-section').count(), 0);
      assert.deepEqual(errors, []);
      console.log(width, theme, 'directory / positioning / settings / project return / workshop home passed');
      await page.close();
    }
  }
  // The rail must stay put even at the end of a short page or in a short window.
  for (const height of [600, 1000]) {
    const page = await browser.newPage({ viewport: { width: 1440, height }, reducedMotion: 'reduce' });
    await page.goto(`${origin}/e2e/toolbox-workspace.html?view=detail&sparse=1`);
    await page.locator('.workspace-summary').waitFor();
    await page.waitForTimeout(400);
    // Reserve space for the real application header, absent from this isolated fixture.
    await page.addStyleTag({ content: '.toolbox-workbench { height: calc(100vh - 80px); margin-top: 80px; }' });
    await page.waitForTimeout(100);
    const rail = page.locator('.project-section-navigation');
    const initial = await rail.evaluate((e) => e.getBoundingClientRect().top);
    await page.locator('.toolbox-workbench').evaluate((e) => {
      e.scrollTop = e.scrollHeight;
    });
    await page.waitForTimeout(100);
    assert(
      Math.abs((await rail.evaluate((e) => e.getBoundingClientRect().top)) - initial) <= 1,
      'rail moves at page bottom',
    );
    await rail.locator(':scope > button').first().click();
    await page.waitForTimeout(100);
    assert(
      Math.abs((await rail.evaluate((e) => e.getBoundingClientRect().top)) - initial) <= 1,
      'rail moves on section jump',
    );
    assert(await page.locator('.project-directory-back button').isVisible());
    await page.close();
    console.log(height, 'fixed rail / page bottom / overview jump passed');
  }
  // Select-all acts on visible resources and retains selections outside the filter.
  {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    await page.goto(`${origin}/e2e/toolbox-workspace.html?view=detail`);
    const all = page.locator('.project-resource-columns [role="checkbox"]');
    await all.waitFor();
    await all.click();
    assert.match(await page.locator('.project-resource-generate').innerText(), /6/);
    await page.locator('.project-resource-search input').fill('NotebookLM');
    await all.click();
    assert.match(await page.locator('.project-resource-generate').innerText(), /5/);
    await page.locator('.project-resource-search input').fill('');
    assert.equal(await all.getAttribute('aria-checked'), 'mixed');
    await all.click();
    assert.equal(await all.getAttribute('aria-checked'), 'true');
    await all.click();
    assert.equal(await page.locator('.project-resource-generate').isEnabled(), false);
    await page.close();
    console.log('resource select-all / filtered selection passed');
  }
  // Progressive disclosure must retain drafts, save once, and keep failures editable.
  for (const fail of [false, true]) {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
    await page.goto(
      `${origin}/e2e/toolbox-workspace.html?view=detail&sparse=1&renderProfile=mobile${fail ? '&sessionError=1' : ''}`,
    );
    await page.locator('.workspace-summary').waitFor();
    await page.waitForTimeout(400);
    assert.equal(await page.locator('.workspace-progress-form').count(), 0);
    const trigger = page.locator('[aria-controls="project-progress-editor"]');
    await trigger.click();
    const summary = page.locator('.workspace-progress-form__summary textarea');
    const next = page.locator('.workspace-progress-form__next input');
    await summary.fill('这次确认了资料的来源');
    await next.fill('继续对照回顾方式');
    await page.locator('.workspace-progress-section').getByRole('button', { name: '收起', exact: true }).click();
    assert.equal(await trigger.getAttribute('aria-expanded'), 'false');
    await trigger.click();
    assert.equal(await summary.inputValue(), '这次确认了资料的来源');
    assert.equal(await next.inputValue(), '继续对照回顾方式');
    await page.locator('.workspace-progress-form__submit').click();
    if (fail) {
      await page.waitForTimeout(500);
      assert.equal(await summary.inputValue(), '这次确认了资料的来源');
      assert.equal(await page.locator('.workspace-progress-form__submit').isEnabled(), true);
    } else {
      await page.locator('.workspace-progress-form').waitFor({ state: 'detached' });
      assert.equal(await page.locator('.workspace-timeline article').count(), 1);
      assert.match(await page.locator('.workspace-resume').innerText(), /继续对照回顾方式/);
      assert.match(await page.locator('.workspace-timeline').innerText(), /这次确认了资料的来源/);
    }
    console.log(
      'progress',
      fail ? 'failure retains draft' : 'collapse preserves draft / save updates timeline',
      'passed',
    );
    await page.close();
  }
} finally {
  await browser.close();
}
