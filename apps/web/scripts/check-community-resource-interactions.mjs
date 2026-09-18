import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';
const b = await chromium.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
});
try {
  for (const width of [1440, 390])
    for (const theme of ['day', 'night']) {
      const p = await b.newPage({ viewport: { width, height: 650 } });
      p.setDefaultTimeout(15000);
      await p.goto(
        `http://localhost:5173/e2e/community-p2.html?account=a&theme=${theme}${width < 768 ? '&renderProfile=mobile' : ''}`,
      );
      await p.getByRole('button', { name: '发布内容', exact: true }).click();
      if (width < 768) await p.locator('.writing-mobile-dock button').first().click();
      const add = p.getByRole('button', { name: '分享我的资源', exact: true });
      for (const name of ['我的知识整理方法', 'MDN 网页开发文档']) {
        await add.click();
        await p
          .locator('.mask-container')
          .getByRole('button', { name: new RegExp(name) })
          .waitFor();
        assert.equal(await p.getByRole('button', { name: /含图片的旅行笔记/ }).count(), 0);
        await p
          .locator('.mask-container')
          .getByRole('button', { name: new RegExp(name) })
          .click();
        await p.getByRole('button', { name: '确认并添加', exact: true }).click();
      }
      for (let i = 0; i < 3; i++) {
        await add.click();
        const modal = p.locator('.mask-container');
        await modal.waitFor();
        await modal.getByRole('button', { name: '关闭', exact: true }).click();
        await modal.waitFor({ state: 'detached' });
        assert.equal(await add.isEnabled(), true);
      }
      await add.click();
      await p
        .locator('.mask-container')
        .getByRole('button', { name: /我的知识整理方法/ })
        .click();
      await p.getByRole('button', { name: '确认并添加', exact: true }).click();
      assert.equal(await add.isDisabled(), true);
      assert.equal(await p.locator('.publish-materials .resource-row').count(), 3);
      const scroll = p.locator(width < 768 ? '.b-drawer-body:has(.mobile-submit)' : '.writing-materials');
      await scroll.hover();
      await p.mouse.wheel(0, 4000);
      await p.waitForTimeout(400);
      const metrics = await scroll.evaluate((e) => ({
        top: e.scrollTop,
        height: e.clientHeight,
        total: e.scrollHeight,
      }));
      assert(metrics.total >= metrics.height, JSON.stringify(metrics));
      const last = p.locator('.publish-materials .resource-remove').last();
      const rect = await last.boundingBox();
      assert(rect.y >= 0 && rect.y + rect.height <= 650, JSON.stringify(rect));
      await p.screenshot({ path: `/tmp/redesign-resource-${width}-${theme}.png` });
      await last.click();
      assert.equal(await add.isEnabled(), true);
      while (await p.locator('.publish-materials .resource-remove').count())
        await p.locator('.publish-materials .resource-remove').last().click();
      console.log({ width, theme, metrics });
      await p.close();
    }
} finally {
  await b.close();
}
