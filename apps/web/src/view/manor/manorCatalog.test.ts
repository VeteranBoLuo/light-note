import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import { afterEach, expect, it, vi } from 'vitest';

const source = readFileSync(resolve(process.cwd(), 'public/manor/knowledge-garden-v19/farm-art.js'), 'utf8');
function setup(intersection = true) {
  let enter!: (entries: object[]) => void;
  const observe = vi.fn(), unobserve = vi.fn(), disconnect = vi.fn();
  class Observer {
    constructor(callback: typeof enter) { enter = callback; }
    observe = observe; unobserve = unobserve; disconnect = disconnect;
  }
  const module = { exports: {} as { deferCatalogImages: (markup: string) => string; mountCatalogImages: (root: Element) => () => void } };
  runInNewContext(source, { module, IntersectionObserver: intersection ? Observer : undefined });
  const art = module.exports;
  document.body.innerHTML = art.deferCatalogImages('<div class="dialog-body"><button class="atlas-card" aria-label="小鱼"><svg><image href="fish.webp" filter="url(#alpha)" /></svg></button><button class="atlas-card"><img src="crop.webp"></button></div>');
  const root = document.querySelector('.dialog-body')!, cards = [...root.querySelectorAll('button')];
  const stop = art.mountCatalogImages(root);
  return { root, cards, stop, disconnect, enter: (index: number) => enter([{ target: cards[index], isIntersecting: true }]) };
}
afterEach(() => { document.body.innerHTML = ''; });

it('SVG 与作物只在接近视口时挂载原画，加载中仍可点击，抠图滤镜保留', () => {
  const { root, cards, enter, stop } = setup();
  const open = vi.fn(); cards[0].addEventListener('click', open);
  expect(root.querySelector('image')?.hasAttribute('href')).toBe(false);
  expect(root.querySelector('img')?.hasAttribute('src')).toBe(false);
  cards[0].click(); expect(open).toHaveBeenCalledOnce();
  enter(0);
  const image = root.querySelector('image')!;
  expect(image.getAttribute('href')).toBe('fish.webp');
  expect(image.getAttribute('filter')).toBe('url(#alpha)');
  expect(root.querySelector('img')?.hasAttribute('src')).toBe(false);
  image.dispatchEvent(new Event('load'));
  expect(cards[0].getAttribute('aria-busy')).toBeNull();
  expect(cards[0].dataset.imageStatus).toBe('');
  stop();
});

it('单张图片失败保留可点击的占位，关闭面板释放观察和图片监听', () => {
  const { root, cards, enter, stop, disconnect } = setup();
  enter(0); root.querySelector('image')!.dispatchEvent(new Event('error'));
  expect(cards[0].dataset.imageStatus).toBe('图片暂未加载');
  expect(cards[0].disabled).toBe(false);
  enter(1); stop();
  root.querySelector('img')!.dispatchEvent(new Event('load'));
  expect(cards[1].dataset.imageStatus).toBe('加载图片…');
  expect(disconnect).toHaveBeenCalledOnce();
});

it('不支持 IntersectionObserver 时仍能显示图鉴全部图片', () => {
  const { root, stop } = setup(false);
  expect(root.querySelector('image')?.getAttribute('href')).toBe('fish.webp');
  expect(root.querySelector('img')?.getAttribute('src')).toBe('crop.webp');
  stop();
});
