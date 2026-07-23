import { describe, it, expect } from 'vitest';
import {
  buildResourceHref,
  parseResourceHref,
  dedupeResourceRefs,
  buildResourceAnchorAttrs,
  decorateInternalResourceLinks,
  collectResourceRefsFromHtml,
  applyResourceReferenceChipPresentation,
  presentResourceReferenceChips,
  serializeResourceReferenceSnapshots,
  repairResourceReferenceHrefs,
  RESOURCE_REF_TEST_VECTORS,
} from './noteResourceRefs';

describe('noteResourceRefs', () => {
  async function renderMarkdownLikeEditor(markdown: string) {
    const [{ marked }, { default: DOMPurify }] = await Promise.all([import('marked'), import('dompurify')]);
    return decorateInternalResourceLinks(DOMPurify.sanitize(marked.parse(markdown)));
  }

  async function createTurndown() {
    const { default: TurndownService } = await import('turndown');
    return new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced' });
  }

  describe('parseResourceHref（前后端共享向量）', () => {
    for (const { href, ref } of RESOURCE_REF_TEST_VECTORS) {
      it(`parse: ${href}`, () => {
        expect(parseResourceHref(href)).toEqual(ref);
      });
    }
    it('非字符串返回 null', () => {
      expect(parseResourceHref(null)).toBeNull();
      expect(parseResourceHref(undefined)).toBeNull();
      expect(parseResourceHref(123 as unknown)).toBeNull();
    });
  });

  describe('buildResourceHref', () => {
    it('三类型正确构造', () => {
      expect(buildResourceHref({ type: 'note', id: 'abc-123' })).toBe('/noteLibrary/abc-123');
      expect(buildResourceHref({ type: 'bookmark', id: 'bk-9' })).toBe('/manage/editBookmark/bk-9');
      expect(buildResourceHref({ type: 'file', id: 'f-7' })).toBe('/cloudSpace?fileId=f-7');
    });
    it('空 id 返回空串', () => {
      expect(buildResourceHref({ type: 'note', id: '' })).toBe('');
    });
  });

  describe('build ↔ parse 往返一致', () => {
    it('三类型往返得到原 ref', () => {
      for (const type of ['note', 'bookmark', 'file'] as const) {
        const ref = { type, id: 'round-trip-1' };
        expect(parseResourceHref(buildResourceHref(ref))).toEqual(ref);
      }
    });
  });

  describe('dedupeResourceRefs', () => {
    it('去重、保序、忽略外链/非法', () => {
      const hrefs = ['/noteLibrary/n1', '/noteLibrary/n1', 'https://x.com', '/manage/editBookmark/b1', '/cloudSpace'];
      expect(dedupeResourceRefs(hrefs)).toEqual([
        { type: 'note', id: 'n1' },
        { type: 'bookmark', id: 'b1' },
      ]);
    });
    it('空输入返回空数组', () => {
      expect(dedupeResourceRefs([])).toEqual([]);
    });
  });

  describe('buildResourceAnchorAttrs', () => {
    it('生成 data-ln-* 增强属性', () => {
      expect(buildResourceAnchorAttrs({ type: 'file', id: 'f1' })).toEqual({
        'data-ln-resource-type': 'file',
        'data-ln-resource-id': 'f1',
      });
    });
  });

  describe('decorateInternalResourceLinks（MD→HTML 后处理装饰）', () => {
    it('装饰站内链接补 data-ln-*', () => {
      const out = decorateInternalResourceLinks('<a href="/noteLibrary/n1">笔记</a>');
      expect(out).toContain('data-ln-resource-type="note"');
      expect(out).toContain('data-ln-resource-id="n1"');
    });
    it('普通外链不装饰（原样返回，不变 chip）', () => {
      const input = '<a href="https://example.com">外链</a>';
      const out = decorateInternalResourceLinks(input);
      expect(out).toBe(input);
      expect(out).not.toContain('data-ln-resource');
    });
    it('无站内链接时原样返回（不做无谓序列化）', () => {
      expect(decorateInternalResourceLinks('<p>纯文本</p>')).toBe('<p>纯文本</p>');
      expect(decorateInternalResourceLinks('')).toBe('');
    });
    it('混合：只装饰站内，外链保持无 data-ln-*', () => {
      const out = decorateInternalResourceLinks(
        '<a href="/manage/editBookmark/b1">书签</a><a href="https://x.com">外</a>',
      );
      expect(collectResourceRefsFromHtml(out)).toEqual([{ type: 'bookmark', id: 'b1' }]);
      expect(out.match(/data-ln-resource-type/g)?.length).toBe(1);
    });
  });

  describe('collectResourceRefsFromHtml + 往返集合一致', () => {
    it('从 HTML 收集去重、保序引用，忽略外链', () => {
      const html =
        '<a href="/noteLibrary/n1">a</a><a href="/noteLibrary/n1">dup</a>' +
        '<a href="/cloudSpace?fileId=f1">f</a><a href="https://x.com">ext</a>';
      expect(collectResourceRefsFromHtml(html)).toEqual([
        { type: 'note', id: 'n1' },
        { type: 'file', id: 'f1' },
      ]);
    });
    it('build → 组 HTML → decorate → collect 得到原始集合（类型/ID 完全一致）', () => {
      const refs = [
        { type: 'note', id: 'n-1' },
        { type: 'bookmark', id: 'b-2' },
        { type: 'file', id: 'f-3' },
      ] as const;
      const html = refs.map((r) => `<a href="${buildResourceHref(r)}">x</a>`).join('');
      expect(collectResourceRefsFromHtml(decorateInternalResourceLinks(html))).toEqual([...refs]);
    });
  });

  describe('缺失 href 的早期半成品引用恢复', () => {
    it('只根据受控 data-ln-resource-* 恢复 canonical href，并能重新参与收集与保存', () => {
      const html = '<a data-ln-resource-type="bookmark" data-ln-resource-id="b-repair">旧书签</a>';
      const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');
      expect(repairResourceReferenceHrefs(doc.body)).toBe(true);
      expect(doc.body.innerHTML).toContain('href="/manage/editBookmark/b-repair"');
      expect(collectResourceRefsFromHtml(html)).toEqual([{ type: 'bookmark', id: 'b-repair' }]);

      const persisted = serializeResourceReferenceSnapshots(
        '<a contenteditable="false" title="点击打开" data-ln-resource-type="bookmark" data-ln-resource-id="b-repair">旧书签</a>',
      );
      expect(persisted).toContain('href="/manage/editBookmark/b-repair"');
      expect(persisted).not.toContain('contenteditable=');
      expect(persisted).not.toContain('title=');
    });

    it('不为普通链接或非法 data 属性虚构站内地址', () => {
      const doc = new DOMParser().parseFromString(
        '<body><a>普通文字</a><a data-ln-resource-type="unknown" data-ln-resource-id="x">错误类型</a></body>',
        'text/html',
      );
      expect(repairResourceReferenceHrefs(doc.body)).toBe(false);
      expect(doc.body.innerHTML).not.toContain('href=');
    });
  });

  describe('编辑器真实 HTML / Markdown 转换链路', () => {
    const refs = [
      { type: 'note', id: 'n-round-trip' },
      { type: 'bookmark', id: 'b-round-trip' },
      { type: 'file', id: 'f-round-trip' },
    ] as const;

    it('HTML → Turndown → Marked + DOMPurify → decorate 后保留完整引用集合', async () => {
      const turndown = await createTurndown();
      const html = refs.map((ref) => `<a href="${buildResourceHref(ref)}">${ref.type}</a>`).join(' ');
      const markdown = turndown.turndown(html);
      const rendered = await renderMarkdownLikeEditor(markdown);

      expect(markdown).toContain(`[note](${buildResourceHref(refs[0])})`);
      expect(collectResourceRefsFromHtml(rendered)).toEqual([...refs]);
    });

    it('Markdown → Marked + DOMPurify → Turndown → 再渲染后保留完整引用集合', async () => {
      const turndown = await createTurndown();
      const markdown = refs.map((ref) => `[${ref.type}](${buildResourceHref(ref)})`).join(' ');
      const roundTrippedMarkdown = turndown.turndown(await renderMarkdownLikeEditor(markdown));
      const rendered = await renderMarkdownLikeEditor(roundTrippedMarkdown);

      expect(collectResourceRefsFromHtml(rendered)).toEqual([...refs]);
    });

    it('Markdown 原生 HTML anchor 是实际可点击链接，渲染链路不得丢失', async () => {
      const rendered = await renderMarkdownLikeEditor('<a href="/noteLibrary/raw-html">原生链接</a>');
      expect(rendered).toContain('href="/noteLibrary/raw-html"');
      expect(collectResourceRefsFromHtml(rendered)).toEqual([{ type: 'note', id: 'raw-html' }]);
    });
  });

  describe('DOMPurify sanitize 后 data-ln-* 保留（协议地基）', () => {
    it('data-ln-resource-* 不被默认 sanitize 清除', async () => {
      const DOMPurify = (await import('dompurify')).default;
      const clean = DOMPurify.sanitize(
        '<a href="/noteLibrary/n1" data-ln-resource-type="note" data-ln-resource-id="n1">x</a>',
      );
      expect(clean).toContain('data-ln-resource-type="note"');
      expect(clean).toContain('data-ln-resource-id="n1"');
    });
  });

  describe('N1 阅读态 chip 展示与正文快照隔离', () => {
    it('有效引用展示当前名称，但序列化回正文时仍保留原快照文字', () => {
      const rendered = presentResourceReferenceChips('<p><a href="/noteLibrary/n1">旧笔记名</a></p>', [
        { type: 'note', id: 'n1', title: '重命名后的笔记', available: true },
      ]);
      expect(rendered).toContain('重命名后的笔记');
      expect(rendered).toContain('data-ln-resource-state="available"');
      const persisted = serializeResourceReferenceSnapshots(rendered);
      expect(persisted).toContain('>旧笔记名<');
      expect(persisted).not.toContain('data-ln-resource-display-title');
      expect(persisted).not.toContain('ln-resource-link');
    });

    it('失效引用展示快照提示，普通外链不变 chip', () => {
      const rendered = presentResourceReferenceChips(
        '<a href="/cloudSpace?fileId=f1">设计稿.pdf</a> <a href="https://example.com">外部链接</a>',
        [{ type: 'file', id: 'f1', title: null, available: false }],
        { unavailableLabel: (title) => `Unavailable reference · ${title}` },
      );
      expect(rendered).toContain('Unavailable reference · 设计稿.pdf');
      expect(rendered).toContain('data-ln-resource-state="unavailable"');
      expect(rendered).toContain('href="https://example.com"');
      expect(rendered.match(/ln-resource-link/g)?.length).toBe(1);
    });

    it('活编辑器中手工改过 chip 文字时，保存保留手工文字而非旧快照', () => {
      const doc = new DOMParser().parseFromString('<body><a href="/manage/editBookmark/b1">旧书签名</a></body>', 'text/html');
      applyResourceReferenceChipPresentation(doc.body, [
        { type: 'bookmark', id: 'b1', title: '当前书签名', available: true },
      ], { liveEditor: true });
      const anchor = doc.body.querySelector('a') as HTMLAnchorElement;
      expect(anchor.getAttribute('contenteditable')).toBe('false');
      anchor.textContent = '用户手工改名';
      const persisted = serializeResourceReferenceSnapshots(doc.body.innerHTML);
      expect(persisted).toContain('>用户手工改名<');
      expect(persisted).not.toContain('data-ln-resource-snapshot-title');
      expect(persisted).not.toContain('contenteditable=');
    });
  });
});
