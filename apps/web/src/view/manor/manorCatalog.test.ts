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
  expect(cards[0].dataset.imageStatus).toBeUndefined();
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
  expect(cards[1].dataset.imageStatus).toBeUndefined();
  expect(disconnect).toHaveBeenCalledOnce();
});

it('首次和重复打开都保留原卡面，不因缓存图片的异步 load 重播文字占位', () => {
  for (let visit = 0; visit < 2; visit++) {
    const { root, cards, enter, stop } = setup();
    expect(root.querySelector('[data-image-status]')).toBeNull();
    enter(0);
    expect(cards[0].getAttribute('aria-busy')).toBe('true');
    expect(cards[0].dataset.imageStatus).toBeUndefined();
    root.querySelector('image')!.dispatchEvent(new Event('load'));
    expect(cards[0].dataset.imageStatus).toBe('');
    stop();
  }
});

it('不支持 IntersectionObserver 时仍能显示图鉴全部图片', () => {
  const { root, stop } = setup(false);
  expect(root.querySelector('image')?.getAttribute('href')).toBe('fish.webp');
  expect(root.querySelector('img')?.getAttribute('src')).toBe('crop.webp');
  stop();
});

it.each(['clown', 'moonjelly', 'peachjelly'])('%s 未发现时消除半透明内部纹理，已发现时保留原画透明度', kind => {
  const fishSource = readFileSync(resolve(process.cwd(), 'public/manor/knowledge-garden-v19/fish-art.js'), 'utf8');
  const render = runInNewContext(`${fishSource};fishArt`) as (key: string, silhouette?: boolean) => string;
  // Evaluate the emitted SVG alpha pipeline against transparent background and
  // differently translucent body pixels, rather than assuming opaque artwork.
  const alpha = (markup: string, input: number) => {
    document.body.innerHTML = markup;
    return [...document.querySelector('filter')!.children].reduce((value, primitive) => {
      if (primitive.localName === 'feComponentTransfer') {
        const transfer = primitive.querySelector('feFuncA')!;
        return Math.min(1, Math.max(0, value * Number(transfer.getAttribute('slope') ?? 1) + Number(transfer.getAttribute('intercept') ?? 0)));
      }
      const matrix = primitive.getAttribute('values')!.split(/\s+/).map(Number);
      return Math.min(1, Math.max(0, value * matrix[18] + matrix[19]));
    }, input);
  };
  const missing = render(kind, true), discovered = render(kind);
  expect(alpha(missing, 0)).toBe(0);
  expect(alpha(missing, .08)).toBeCloseTo(alpha(missing, .8));
  expect(alpha(missing, .8)).toBeGreaterThan(0);
  expect(alpha(discovered, .08)).toBeLessThan(alpha(discovered, .8));
  expect(alpha(discovered, 0)).toBe(0);
});
