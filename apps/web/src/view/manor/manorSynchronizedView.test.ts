import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import { afterEach, expect, it, vi } from 'vitest';

const ui = readFileSync(resolve(process.cwd(), 'public/manor/knowledge-garden-v19/garden-ui.js'), 'utf8');
const source = ui.slice(ui.indexOf('function refreshSynchronizedView()'), ui.indexOf('\nconst wait ='));
function setup(family: string, syncView = '', closeWhileRefreshing = false) {
  document.body.innerHTML = '<div id="modal"><section id="dialog"><div class="dialog-body"></div></section></div>';
  const dialog = document.querySelector<HTMLElement>('#dialog')!;
  dialog.dataset.family = family; dialog.dataset.syncView = syncView;
  dialog.querySelector('.dialog-body')!.scrollTop = 80;
  const close = vi.fn(() => { document.querySelector<HTMLElement>('#modal')!.hidden = true; });
  const render = vi.fn(() => {
    dialog.querySelector('.dialog-body')!.scrollTop = 0;
    if(closeWhileRefreshing)document.querySelector<HTMLElement>('#modal')!.hidden=true;
  });
  const toast = vi.fn();
  runInNewContext(`${source};refreshSynchronizedView();`, {
    $: (selector: string) => document.querySelector(selector),
    FarmUI: { refreshInventory: render, shopDialog: render }, dailyDialog: render,
    ledgerDialog: render, baitDialog: render, atlasDialog: render, closeDialog: close,
    GardenLive: { snapshot: { copy: { panelUpdated: '已更新' } } }, toast,
  });
  return { dialog, close, render, toast };
}
afterEach(() => { document.body.innerHTML = ''; });

it.each(['inventory-dialog', 'farm-shop-dialog', 'ledger-dialog', 'bait-dialog', 'atlas-dialog'])('%s 同步后重读资产并保留滚动位置', family => {
  const s = setup(family);
  expect(s.render).toHaveBeenCalledOnce(); expect(s.close).not.toHaveBeenCalled();
  expect(s.dialog.querySelector('.dialog-body')!.scrollTop).toBe(80);
});
it('任务进度独立刷新，不把稀有种子来源误当每日任务', () => {
  expect(setup('daily-dialog', 'daily').render).toHaveBeenCalledOnce();
  expect(setup('daily-dialog').render).not.toHaveBeenCalled();
});
it.each(['facility-build-dialog', 'purifier-upgrade-dialog', 'plot-dialog', 'purchase-dialog'])('%s 中的旧选择和确认关闭，不能静默沿用旧库存', family => {
  const s = setup(family);
  expect(s.close).toHaveBeenCalledOnce(); expect(s.render).not.toHaveBeenCalled();
  expect(s.toast).toHaveBeenCalledWith('已更新', { topCenter: true });
});
it('纯玩法帮助保持打开', () => {
  const s = setup('help-dialog');
  expect(s.close).not.toHaveBeenCalled(); expect(s.render).not.toHaveBeenCalled();
});
it('选种目标已被另一端种植时关闭旧面板并说明原因', () => {
  const s=setup('inventory-dialog','',true);
  expect(document.querySelector<HTMLElement>('#modal')!.hidden).toBe(true);
  expect(s.toast).toHaveBeenCalledWith('已更新',{topCenter:true});
});
