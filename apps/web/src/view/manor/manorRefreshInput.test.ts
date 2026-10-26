import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const source = readFileSync(resolve(process.cwd(), 'public/manor/manor-live.js'), 'utf8');
let gate: { waitForRelease: () => Promise<void>; destroy: () => void };
beforeEach(() => {
  vi.useFakeTimers();
  const module = { exports: {} as { createManorRefreshInput: (doc: Document) => typeof gate } };
  runInNewContext(source, { module, URLSearchParams, location: { search: '' }, document: { currentScript: { dataset: {} } }, setTimeout, clearTimeout });
  gate = module.exports.createManorRefreshInput(document);
});
afterEach(() => { gate.destroy(); vi.useRealTimers(); document.body.innerHTML = ''; });
const pointer = (type: string, id = 1) => {
  const e = new Event(type, { bubbles: true }); Object.defineProperty(e, 'pointerId', { value: id }); document.dispatchEvent(e);
};

it('获得焦点后的存档响应不会在按下和点击之间替换菜单', async () => {
  const button = document.createElement('button'), open = vi.fn();
  button.addEventListener('click', open); document.body.append(button);
  pointer('pointerdown');
  const repaint = gate.waitForRelease().then(() => button.replaceWith(document.createElement('button')));
  await Promise.resolve();
  pointer('pointerup');
  let lateReplyApplied = false;
  const lateReply = gate.waitForRelease().then(() => { lateReplyApplied = true; });
  await Promise.resolve(); expect(lateReplyApplied).toBe(false);
  expect(button.isConnected).toBe(true);
  button.click();
  expect(open).toHaveBeenCalledOnce();
  await vi.runAllTimersAsync(); await repaint; await lateReply;
  expect(button.isConnected).toBe(false);
});

it('键盘松开后的点击也能先完成，然后才更新菜单', async () => {
  document.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', code: 'Space' }));
  let painted = false;
  const repaint = gate.waitForRelease().then(() => { painted = true; });
  document.dispatchEvent(new KeyboardEvent('keyup', { key: ' ', code: 'Space' }));
  await Promise.resolve(); expect(painted).toBe(false);
  await vi.runAllTimersAsync(); await repaint; expect(painted).toBe(true);
});

it('多指释放、取消触摸或失去窗口焦点后不会留下刷新锁', async () => {
  pointer('pointerdown', 1); pointer('pointerdown', 2);
  let painted = false;
  const repaint = gate.waitForRelease().then(() => { painted = true; });
  pointer('pointerup', 1); await vi.runAllTimersAsync(); expect(painted).toBe(false);
  pointer('pointercancel', 2); await vi.runAllTimersAsync(); await repaint; expect(painted).toBe(true);
  pointer('pointerdown');
  const afterBlur = gate.waitForRelease();
  window.dispatchEvent(new Event('blur'));
  await vi.runAllTimersAsync(); await afterBlur;
  await gate.waitForRelease();
});
