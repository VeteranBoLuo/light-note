import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { afterEach, expect, it, vi } from 'vitest';

const source = readFileSync(new URL('../../../public/manor/knowledge-garden-v19/fishing-input.js', import.meta.url), 'utf8');
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
