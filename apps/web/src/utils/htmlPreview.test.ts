import { JSDOM } from 'jsdom';
import { describe, expect, it, vi } from 'vitest';
import { HTML_PREVIEW_REFERRER_POLICY, HTML_PREVIEW_SANDBOX, injectHtmlPreviewAnchorBridge } from './htmlPreview';

describe('HTML preview sandbox policy', () => {
  it('allows interactive scripts without exposing the Light Note origin', () => {
    const tokens = new Set(HTML_PREVIEW_SANDBOX.split(/\s+/));

    expect(tokens).toContain('allow-scripts');
    expect(tokens).toContain('allow-pointer-lock');
    expect(tokens).not.toContain('allow-same-origin');
  });

  it.each([
    'allow-forms',
    'allow-popups',
    'allow-downloads',
    'allow-top-navigation',
    'allow-top-navigation-by-user-activation',
  ])('does not grant %s', (permission) => {
    expect(HTML_PREVIEW_SANDBOX.split(/\s+/)).not.toContain(permission);
  });

  it('does not expose the Light Note page as a referrer', () => {
    expect(HTML_PREVIEW_REFERRER_POLICY).toBe('no-referrer');
  });

  it('injects the anchor bridge at the start of head without changing the sandbox policy', () => {
    const source = '<!doctype html><html><head><title>目录</title></head><body>正文</body></html>';
    const result = injectHtmlPreviewAnchorBridge(source);

    expect(result).toMatch(/^<!doctype html><html><head><script data-light-note-anchor-bridge>/);
    expect(result).toContain("source.closest('a[href]')");
    expect(result).toContain('decodeURIComponent(rawHash)');
    expect(result).toContain('document.getElementsByName(candidate)');
    expect(result).toContain('const anchorOffset = 10;');
    expect(result).toContain('targetTop - anchorOffset');
    expect(result).toContain('<title>目录</title>');
  });

  it('supports legacy HTML without head and only injects once', () => {
    const source = '<!doctype html><a href="#%E7%AB%A0%E8%8A%82">章节</a><a name="章节">正文</a>';
    const first = injectHtmlPreviewAnchorBridge(source);
    const second = injectHtmlPreviewAnchorBridge(first);

    expect(first.startsWith('<!doctype html><script data-light-note-anchor-bridge>')).toBe(true);
    expect(second).toBe(first);
    expect(second.match(/data-light-note-anchor-bridge/g)).toHaveLength(1);
  });

  it('injects before SingleFile comments when the document only has an html tag', () => {
    const source = '<html style><!-- Page saved with SingleFile --><meta charset=utf-8><body>正文</body>';
    const result = injectHtmlPreviewAnchorBridge(source);

    expect(result).toMatch(/^<html style><script data-light-note-anchor-bridge>[\s\S]*<\/script><!-- Page saved/);
  });

  it('scrolls to a percent-encoded legacy name anchor inside the isolated document', () => {
    const source =
      '<!doctype html><a href="#%E7%AB%A0%E8%8A%82"><span>章节目录</span></a><div></div><a name="章节">正文</a>';
    const dom = new JSDOM(injectHtmlPreviewAnchorBridge(source), {
      runScripts: 'dangerously',
      url: 'https://preview.invalid/document',
    });
    const target = dom.window.document.getElementsByName('章节')[0];
    const scrollTo = vi.fn();
    Object.defineProperty(dom.window, 'scrollTo', { configurable: true, value: scrollTo });
    Object.defineProperty(dom.window, 'scrollY', { configurable: true, value: 120 });
    Object.defineProperty(target, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({ top: 230 }) as DOMRect,
    });

    const event = new dom.window.MouseEvent('click', { bubbles: true, cancelable: true, button: 0 });
    dom.window.document.querySelector('a span')?.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    expect(scrollTo).toHaveBeenCalledWith({ top: 340, behavior: 'smooth' });
    dom.window.close();
  });
});
