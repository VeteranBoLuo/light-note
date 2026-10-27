import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import { expect, it, vi } from 'vitest';

const source = readFileSync(resolve(process.cwd(), 'public/manor/knowledge-garden-v19/garden-ui.js'), 'utf8');
const exitFunctions = source.slice(source.indexOf('function confirmManorExit()'), source.indexOf('function positionFeedback()'));
it('浏览器与游戏内返回共用三秒确认窗口；超时重新提示，不会意外退出', async () => {
  let now = 1000;
  const toast = vi.fn(), exit = vi.fn(async () => {});
  const gate = runInNewContext(`let exitArmedUntil = 0; ${exitFunctions}; ({ confirmManorExit, requestManorExit })`, {
    Date: { now: () => now }, toast, GardenLive: { exit },
  });
  expect(gate.confirmManorExit()).toBe(false);
  expect(toast).toHaveBeenLastCalledWith('再次返回退出庄园', { topCenter: true, duration: 3000 });
  now += 1000;
  const button = { disabled: false, isConnected: true };
  gate.requestManorExit(button);
  expect(exit).toHaveBeenCalledTimes(1);
  expect(button.disabled).toBe(true);
  expect(gate.confirmManorExit()).toBe(false);
  now += 3001;
  expect(gate.confirmManorExit()).toBe(false);
  expect(exit).toHaveBeenCalledTimes(1);
});
