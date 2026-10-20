// @vitest-environment jsdom
import { Marked } from 'marked';
import { describe, expect, it, vi } from 'vitest';
import { configureNoteMarkdownRenderer } from './markdownRenderer';
import { renderMarkdownScrollMap, SOURCE_ATTRIBUTE } from './markdownScrollMap';
import { findNoteAnchorTarget, handleNoteAnchorActivation } from './noteAnchors';

function content(html: string) {
  const root = document.createElement('article');
  root.innerHTML = html;
  return root;
}

describe('note anchors', () => {
  it('matches encoded Chinese TOC links to rendered headings and their source offsets without changing content', () => {
    const source = [
      '[第一部分 学习计划](#第一部分-学习计划)',
      '[3. 每天 30 分钟“复习”安排](#3-每天-30-分钟复习安排)',
      '[模块一：数列（基础/进阶）](#模块一数列基础进阶)',
      '',
      '# 第一部分 学习计划',
      '',
      '## 3. 每天 30 分钟“复习”安排',
      '',
      '## 模块一：数列（基础/进阶）',
    ].join('\n');
    const parser = configureNoteMarkdownRenderer(new Marked());
    const root = content(renderMarkdownScrollMap(source, parser, () => {}));
    const before = root.innerHTML;
    const headings = [...root.querySelectorAll('h1,h2')];
    const links = [...root.querySelectorAll('a')];
    for (const [index, link] of links.entries()) {
      const fragment = link.getAttribute('href')!.slice(1);
      const target = findNoteAnchorTarget(root, `#${encodeURIComponent(decodeURIComponent(fragment))}`);
      expect(target).toBe(headings[index]);
      expect(source.slice(Number(target!.getAttribute(SOURCE_ATTRIBUTE)))).toMatch(/^#{1,2} /u);
    }
    expect(root.innerHTML).toBe(before);
  });

  it('uses visible inline text, preserves Unicode, underscores and hyphens, and disambiguates repeated slugs', () => {
    const root = content(
      '<h2><em>Café</em> <code>API_v2</code></h2><h2>重复标题</h2><h2>重复标题</h2><h2>重复标题-1</h2><h2>重复标题</h2>',
    );
    const headings = [...root.querySelectorAll('h2')];
    for (const [index, slug] of ['café-api_v2', '重复标题', '重复标题-1', '重复标题-1-1', '重复标题-2'].entries()) {
      expect(findNoteAnchorTarget(root, `#${slug}`)).toBe(headings[index]);
    }
  });

  it('prefers authored ids and legacy names, with no selector interpretation or broad fuzzy matching', () => {
    const root = content(
      '<h2>学习计划</h2><p id="学习计划">自定义目标</p><a name="old:anchor[1]"></a><p id="bad%escape"></p>',
    );
    expect(findNoteAnchorTarget(root, '#学习计划')).toBe(root.querySelector('p'));
    expect(findNoteAnchorTarget(root, '#old%3Aanchor%5B1%5D')).toBe(root.querySelector('a'));
    expect(findNoteAnchorTarget(root, '#bad%escape')).toBe(root.querySelectorAll('p')[1]);
    expect(findNoteAnchorTarget(root, '#学习-计划')).toBeNull();
    expect(findNoteAnchorTarget(root, '#missing')).toBeNull();
    expect(findNoteAnchorTarget(root, '#')).toBe(root);
  });

  it.each(['click', 'keydown'])('consumes %s on nested TOC content and preserves route/history', (type) => {
    const root = content('<a href="#章节"><strong>目录项</strong></a><h2>章节</h2>');
    const navigate = vi.fn();
    const before = { href: location.href, length: history.length };
    root.addEventListener(type, (event) => handleNoteAnchorActivation(event, root, navigate));
    const event =
      type === 'click'
        ? new MouseEvent(type, { bubbles: true, cancelable: true })
        : new KeyboardEvent(type, { key: 'Enter', bubbles: true, cancelable: true });
    root.querySelector('strong')!.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    expect(navigate).toHaveBeenCalledExactlyOnceWith(root.querySelector('h2'));
    expect({ href: location.href, length: history.length }).toEqual(before);
  });

  it('consumes missing fragments without falling through to hash navigation', () => {
    const root = content('<a href="#missing">失效目录</a>');
    const navigate = vi.fn();
    root.addEventListener('click', (event) => handleNoteAnchorActivation(event, root, navigate));
    const event = new MouseEvent('click', { bubbles: true, cancelable: true });
    root.querySelector('a')!.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    expect(navigate).not.toHaveBeenCalled();
  });

  it.each(['https://example.com/#章节', '/noteLibrary/other#章节', 'lightnote://note/other'])(
    'leaves other navigation unchanged: %s',
    (href) => {
      const root = content('<a>其他链接</a><h2>章节</h2>');
      root.querySelector('a')!.setAttribute('href', href);
      const navigate = vi.fn();
      let intercepted = false;
      root.addEventListener('click', (event) => {
        intercepted = handleNoteAnchorActivation(event, root, navigate) || event.defaultPrevented;
        // Suppress jsdom's unimplemented browser navigation after observing the handler result.
        event.preventDefault();
      });
      const event = new MouseEvent('click', { bubbles: true, cancelable: true });
      root.querySelector('a')!.dispatchEvent(event);
      expect(intercepted).toBe(false);
      expect(navigate).not.toHaveBeenCalled();
    },
  );

  it('ignores non-Enter keys and links outside the note, and resolves fresh content after replacement', () => {
    const root = content('<a href="#旧章节">目录</a><h2>旧章节</h2>');
    const navigate = vi.fn();
    const wrapper = document.createElement('div');
    wrapper.append(root, content('<a href="#旧章节">外部目录</a>'));
    wrapper.addEventListener('click', (event) => handleNoteAnchorActivation(event, root, navigate));
    wrapper.addEventListener('keydown', (event) => handleNoteAnchorActivation(event, root, navigate));
    const key = new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true });
    root.querySelector('a')!.dispatchEvent(key);
    const outside = new MouseEvent('click', { bubbles: true, cancelable: true });
    wrapper.lastElementChild!.querySelector('a')!.dispatchEvent(outside);
    expect(key.defaultPrevented || outside.defaultPrevented).toBe(false);
    expect(navigate).not.toHaveBeenCalled();
    root.innerHTML = '<h2>新章节</h2>';
    expect(findNoteAnchorTarget(root, '#旧章节')).toBeNull();
    expect(findNoteAnchorTarget(root, '#新章节')).toBe(root.firstElementChild);
  });
});
