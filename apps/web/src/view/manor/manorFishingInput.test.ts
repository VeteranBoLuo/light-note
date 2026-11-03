import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import { afterEach, expect, it, vi } from 'vitest';

const source = readFileSync(resolve(process.cwd(), 'public/manor/knowledge-garden-v19/fishing-input.js'), 'utf8');
afterEach(() => { document.body.innerHTML = ''; });
it('钓鱼输入保留收杆点击，同时让游戏返回按钮及其内部图标正常冒泡', () => {
  document.body.innerHTML = '<section><button data-action="exit"><span>返回</span></button><div class="water"></div></section>';
  const module = { exports: {} as { create: (doc: Document) => { start: Function; stop: Function } } };
  runInNewContext(source, { module });
  const input = module.exports.create(document), reel = vi.fn(), exit = vi.fn();
  const button = document.querySelector('button')!;
  button.addEventListener('click', exit);
  input.start({ target: document.querySelector('section'), canReel: () => true, onReel: reel });
  document.querySelector('span')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  expect(exit).toHaveBeenCalledTimes(1);
  expect(reel).not.toHaveBeenCalled();
  document.querySelector('.water')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  expect(reel).toHaveBeenCalledTimes(1);
  input.stop();
});

it('钓鱼时点到可操作的东西交给它处理，不算收竿；点空地照常收竿', () => {
  document.body.innerHTML = '<section><button data-action="plot"><span>地块</span></button><button data-action="cast">水面</button><div class="water"></div></section>';
  const module = { exports: {} as { create: (doc: Document) => { start: Function; stop: Function } } };
  runInNewContext(source, { module });
  const input = module.exports.create(document), reel = vi.fn(), plot = vi.fn();
  document.querySelector('[data-action="plot"]')!.addEventListener('click', plot);
  input.start({
    target: document.querySelector('section'), canReel: () => true, onReel: reel,
    passThrough: (el: Element) => { const b = el.closest('[data-action]') as HTMLElement | null; return !!b && b.dataset.action !== 'cast'; },
  });
  document.querySelector('span')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  expect(plot).toHaveBeenCalledTimes(1);
  expect(reel).not.toHaveBeenCalled();
  document.querySelector('.water')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  expect(reel).toHaveBeenCalledTimes(1);
  input.stop();
});
