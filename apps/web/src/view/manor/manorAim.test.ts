import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import { afterEach, expect, it, vi } from 'vitest';

const source = readFileSync(resolve(process.cwd(), 'public/manor/knowledge-garden-v19/garden-courtyard.js'), 'utf8');
function setup() {
  const module = { exports: {} as { bindAim: (hit: HTMLElement, canAim: () => boolean, move: (event: MouseEvent) => void) => () => void } };
  runInNewContext(source, { module });
  const hit = document.createElement('button');document.body.append(hit);
  let captured: number | null = null;
  hit.setPointerCapture = vi.fn(id => { captured = id; });
  hit.hasPointerCapture = id => captured === id;
  hit.releasePointerCapture = vi.fn(() => { captured = null; });
  const send = (type: string, x: number, id = 1, pointerType = 'touch', primary = true) => {
    const event = new MouseEvent(type, { clientX: x, clientY: x + 1, bubbles: true, cancelable: true });
    Object.defineProperties(event, { pointerId: { value: id }, pointerType: { value: pointerType }, isPrimary: { value: primary } });
    hit.dispatchEvent(event);
  };
  return { hit, send, bind: module.exports.bindAim };
}
afterEach(() => { document.body.innerHTML = ''; });
it('按住触屏拖动持续跟随，抬手保留最终落点，第二根手指不抢占', () => {
  const { hit, send, bind } = setup(), points: number[] = [];
  bind(hit, () => true, event => points.push(event.clientX));
  send('pointermove', 5);send('pointerdown', 10);
  send('pointerdown', 80, 2, 'touch', false);send('pointermove', 90, 2, 'touch', false);
  send('pointermove', 30);send('pointerup', 40);send('pointermove', 60);
  expect(points).toEqual([10, 30, 40]);
  expect(hit.setPointerCapture).toHaveBeenCalledExactlyOnceWith(1);
  expect(hit.releasePointerCapture).toHaveBeenCalledExactlyOnceWith(1);
});
it('取消触摸、已抛竿和场景清理后不会继续移动鱼竿，鼠标悬停仍可瞄准', () => {
  const { hit, send, bind } = setup(), points: number[] = [];
  let idle = true;
  const stop = bind(hit, () => idle, event => points.push(event.clientX));
  send('pointerdown', 10);send('pointercancel', 20);send('pointermove', 30);
  idle = false;send('pointerdown', 40);send('pointermove', 50, 1, 'mouse');
  idle = true;send('pointermove', 60, 1, 'mouse');
  stop();send('pointerdown', 70);send('pointermove', 80, 1, 'mouse');
  expect(points).toEqual([10, 60]);
});
