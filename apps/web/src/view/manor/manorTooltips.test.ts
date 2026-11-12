import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import { afterEach, describe, expect, it } from 'vitest';

const source = readFileSync(resolve(process.cwd(), 'public/manor/knowledge-garden-v19/garden-tooltips.js'), 'utf8');
const module = { exports: {} as { mount: (doc: Document) => { destroy: () => void } } };
runInNewContext(source, { module });
const tooltips = module.exports;

describe('庄园提示跟随焦点', () => {
  let destroy = () => {};
  afterEach(() => {
    destroy();
    document.body.innerHTML = '';
    document.documentElement.classList.remove('kbd-nav');
  });
  const setup = () => {
    document.body.innerHTML = '<main class="garden-play"><button title="背包（B）">背包</button></main>';
    destroy = tooltips.mount(document).destroy;
    const button = document.querySelector('button')!;
    // jsdom 不实现 :focus-visible，这里按浏览器的判定结果直接给出。
    button.matches = ((selector: string) => selector === ':focus-visible' || Element.prototype.matches.call(button, selector)) as typeof button.matches;
    button.getBoundingClientRect = () => ({ left: 10, top: 10, right: 46, bottom: 46, width: 36, height: 36, x: 10, y: 10, toJSON() {} }) as DOMRect;
    return button;
  };
  const tip = () => document.getElementById('gardenTooltip');

  it('Tab 键导航聚焦入口时显示提示', () => {
    const button = setup();
    document.documentElement.classList.add('kbd-nav');
    button.focus();
    expect(tip()?.hidden).toBe(false);
    expect(tip()?.textContent).toBe('背包（B）');
  });

  it('Esc 或快捷键关掉弹框、焦点还回入口时不挂提示', () => {
    const button = setup();
    button.focus();
    expect(tip() === null || tip()!.hidden).toBe(true);
  });
});
