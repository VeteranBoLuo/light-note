import { afterEach, expect, it, vi } from 'vitest';
import {
  clearRevealedHover,
  isRevealedHoverBlocked,
  prepareRevealedHover,
  registerHoverTrigger,
} from './revealedHover';

const cleanups: (() => void)[] = [];
const originalHitTest = document.elementFromPoint;
afterEach(() => {
  cleanups
    .splice(0)
    .reverse()
    .forEach((cleanup) => cleanup());
  document.elementFromPoint = originalHitTest;
  document.body.replaceChildren();
  vi.useRealTimers();
});
function setup() {
  const overlay = document.createElement('div');
  const trigger = document.createElement('button');
  const other = document.createElement('button');
  document.body.append(overlay, trigger, other);
  for (const node of [trigger, other]) {
    cleanups.push(registerHoverTrigger(node));
    node.getBoundingClientRect = () => ({ left: 10, top: 10, right: 50, bottom: 50 }) as DOMRect;
  }
  const hit = vi.fn().mockReturnValue(overlay);
  document.elementFromPoint = hit;
  return { overlay, trigger, other, hit };
}
function pointer(x = 20, y = 20, type = 'mouse') {
  const event = new MouseEvent('pointermove', { clientX: x, clientY: y, bubbles: true });
  Object.defineProperty(event, 'pointerType', { value: type });
  document.dispatchEvent(event);
}
it('blocks the revealed trigger regardless of elapsed time, not other triggers', () => {
  vi.useFakeTimers();
  const { overlay, trigger, other, hit } = setup();
  pointer();
  const reveal = prepareRevealedHover(overlay);
  overlay.remove();
  hit.mockReturnValue(trigger);
  reveal?.();
  vi.advanceTimersByTime(60_000);
  expect(isRevealedHoverBlocked(trigger)).toBe(true);
  expect(isRevealedHoverBlocked(other)).toBe(false);
  clearRevealedHover(trigger);
  expect(isRevealedHoverBlocked(trigger)).toBe(false);
});
it('ignores pointers outside the closing drawer and touch input', () => {
  const { overlay, trigger, hit } = setup();
  pointer();
  hit.mockReturnValue(trigger);
  expect(prepareRevealedHover(overlay)).toBeUndefined();
  hit.mockReturnValue(overlay);
  pointer(20, 20, 'touch');
  expect(prepareRevealedHover(overlay)).toBeUndefined();
});
it('does not block a new pointer position or an unregistered click trigger', () => {
  const { overlay, trigger, hit } = setup();
  pointer();
  const reveal = prepareRevealedHover(overlay);
  pointer(25, 25);
  hit.mockReturnValue(trigger);
  reveal?.();
  expect(isRevealedHoverBlocked(trigger)).toBe(false);
  hit.mockReturnValue(overlay);
  const revealClick = prepareRevealedHover(overlay);
  const clickTrigger = document.createElement('button');
  hit.mockReturnValue(clickTrigger);
  revealClick?.();
  expect(isRevealedHoverBlocked(clickTrigger)).toBe(false);
});
it('moving within the revealed trigger stays blocked; leaving or losing the pointer clears it', () => {
  const { overlay, trigger, hit } = setup();
  pointer();
  const reveal = prepareRevealedHover(overlay);
  hit.mockReturnValue(trigger);
  reveal?.();
  pointer(25, 25);
  expect(isRevealedHoverBlocked(trigger)).toBe(true);
  pointer(80, 80);
  expect(isRevealedHoverBlocked(trigger)).toBe(false);
  hit.mockReturnValue(overlay);
  pointer();
  const again = prepareRevealedHover(overlay);
  hit.mockReturnValue(trigger);
  again?.();
  window.dispatchEvent(new Event('blur'));
  expect(isRevealedHoverBlocked(trigger)).toBe(false);
});
it('cleanup removes pending suppression and pointer subscriptions', () => {
  const { overlay, trigger, hit } = setup();
  pointer();
  const reveal = prepareRevealedHover(overlay);
  hit.mockReturnValue(trigger);
  reveal?.();
  cleanups.splice(0).forEach((cleanup) => cleanup());
  expect(isRevealedHoverBlocked(trigger)).toBe(false);
  hit.mockReturnValue(overlay);
  pointer();
  expect(prepareRevealedHover(overlay)).toBeUndefined();
});
