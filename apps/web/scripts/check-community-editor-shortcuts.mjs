import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';
const fixturePort = process.env.COMMUNITY_FIXTURE_PORT || '19095';
const b = await chromium.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
});
try {
  for (const theme of ['day', 'night']) {
    const p = await b.newPage({ viewport: { width: 1440, height: 1000 } });
    await p.goto(`http://localhost:5173/e2e/community-p2.html?fixturePort=${fixturePort}&account=root&theme=${theme}`);
    await p.getByRole('button', { name: '发布内容', exact: true }).click();
    await p.getByRole('tab', { name: 'Markdown', exact: true }).click();
    const source = p.locator('.writing-body .cm-content');
    await source.fill('正文 **加粗**');
    await source.press('End');
    await p.keyboard.type('123');
    await source.press('Meta+z');
    assert(!(await source.innerText()).includes('123'));
    await source.press('Meta+y');
    assert((await source.innerText()).includes('123'));
    await p.keyboard.press('Escape');
    assert.equal(await p.getByRole('button', { name: '退出发布', exact: true }).count(), 0);
    await p.locator('.b-drawer-header-actions').getByRole('button', { name: '预览', exact: true }).click();
    assert((await p.locator('.writing-preview strong').allTextContents()).some((t) => t.includes('加粗')));
    assert(!(await p.locator('.writing-preview').innerText()).includes('**'));
    await p.locator('.b-drawer-header-actions').getByRole('button', { name: '发布', exact: true }).click();
    await p.getByRole('button', { name: '确认发布', exact: true }).waitFor();
    assert.equal(await p.getByRole('button', { name: '提交审核', exact: true }).count(), 0);
    await p.keyboard.press('Escape');
    await p.locator('.community-publish-confirm').waitFor({ state: 'hidden' });
    await p.locator('.b-drawer-header .b-drawer-close').click();
    await p.getByRole('button', { name: '退出发布', exact: true }).waitFor();
    await p.keyboard.press('Escape');
    await p.getByRole('button', { name: '退出发布', exact: true }).waitFor({ state: 'hidden' });
    assert(await p.locator('.community-writing').isVisible());
    console.log('PASS MD undo/redo/rendered preview/root confirmation/Escape', theme);
    await p.close();
  }
} finally {
  await b.close();
}
