import { beforeEach, describe, expect, it, vi } from 'vitest';

const renderMock = vi.fn();
const initializeMock = vi.fn();

vi.mock('mermaid', () => ({
  default: {
    initialize: (...args: unknown[]) => initializeMock(...args),
    render: (...args: unknown[]) => renderMock(...args),
  },
}));

vi.mock('@/i18n', () => ({
  default: { global: { t: (key: string) => key } },
}));

// svgCache / mermaidPromise / initializedTheme 都是模块级状态,用例之间必须隔离,
// 否则"是否调用过 mermaid"这类断言会被上一个用例的缓存干扰。
async function loadModule() {
  vi.resetModules();
  return import('./mermaidRender.ts');
}

function markdownHost(...codes: string[]) {
  const host = document.createElement('div');
  host.innerHTML = codes
    .map((code) => `<pre><code class="language-mermaid">${code}</code></pre>`)
    .join('<p>正文</p>');
  document.body.appendChild(host);
  return host;
}

describe('mermaidRender', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    renderMock.mockReset();
    initializeMock.mockReset();
    renderMock.mockImplementation(async (id: string) => ({ svg: `<svg data-id="${id}"><text>图</text></svg>` }));
  });

  it('识别 mermaid 代码块:源码围栏与渲染后的 class 都算', async () => {
    const { hasMermaidBlock } = await loadModule();
    expect(hasMermaidBlock('```mermaid\nmindmap\n```')).toBe(true);
    expect(hasMermaidBlock('<pre><code class="language-mermaid">mindmap</code></pre>')).toBe(true);
    expect(hasMermaidBlock('```python\nprint(1)\n```')).toBe(false);
    expect(hasMermaidBlock('')).toBe(false);
  });

  it('把代码块换成图,原始源码留在容器上供主题切换时重渲染', async () => {
    const { renderMermaidBlocks } = await loadModule();
    const host = markdownHost('mindmap\n  root((主题))');
    await renderMermaidBlocks(host);

    const figure = host.querySelector('.mermaid-figure') as HTMLElement;
    expect(figure).toBeTruthy();
    expect(figure.dataset.mermaidState).toBe('ready');
    expect(figure.querySelector('svg')).toBeTruthy();
    expect(figure.getAttribute('data-mermaid-source')).toBe('mindmap\n  root((主题))');
    expect(host.querySelector('code.language-mermaid')).toBeNull();
  });

  it('渲染失败时保留源码并给出错误提示,不吞掉笔记内容', async () => {
    const { renderMermaidBlocks } = await loadModule();
    renderMock.mockRejectedValue(new Error('Parse error on line 2'));
    const host = markdownHost('mindmap\n  ??');
    await renderMermaidBlocks(host);

    const figure = host.querySelector('.mermaid-figure') as HTMLElement;
    expect(figure.dataset.mermaidState).toBe('error');
    expect(figure.querySelector('.mermaid-figure__error')?.textContent).toContain('Parse error on line 2');
    expect(figure.querySelector('code.language-mermaid')?.textContent).toBe('mindmap\n  ??');
  });

  it('重复调用不会重复渲染同一个块', async () => {
    const { renderMermaidBlocks } = await loadModule();
    const host = markdownHost('mindmap\n  root((主题))');
    await renderMermaidBlocks(host);
    await renderMermaidBlocks(host);

    expect(renderMock).toHaveBeenCalledTimes(1);
    expect(host.querySelectorAll('.mermaid-figure')).toHaveLength(1);
  });

  it('同一段源码第二次出现走缓存,不再调用 mermaid', async () => {
    const { renderMermaidBlocks } = await loadModule();
    const first = markdownHost('flowchart TD\n  A --> B');
    await renderMermaidBlocks(first);
    const second = markdownHost('flowchart TD\n  A --> B');
    await renderMermaidBlocks(second);

    expect(renderMock).toHaveBeenCalledTimes(1);
    expect(second.querySelector('.mermaid-figure svg')).toBeTruthy();
  });

  it('没有 mermaid 代码块时完全不加载 mermaid', async () => {
    const { renderMermaidBlocks } = await loadModule();
    const host = document.createElement('div');
    host.innerHTML = '<pre><code class="language-python">print(1)</code></pre>';
    document.body.appendChild(host);

    await renderMermaidBlocks(host);

    expect(initializeMock).not.toHaveBeenCalled();
    expect(renderMock).not.toHaveBeenCalled();
  });

  it('interactive: false 不放「放大查看」按钮(导出的静态文件里点了没反应)', async () => {
    const { renderMermaidBlocks } = await loadModule();
    const host = markdownHost('mindmap\n  root((导出))');
    await renderMermaidBlocks(host, { interactive: false });

    expect(host.querySelector('.mermaid-figure svg')).toBeTruthy();
    expect(host.querySelector('.mermaid-figure__tools')).toBeNull();
  });

  it('离屏容器(导出路径)同样渲染 —— 不能用 isConnected 判断有效性', async () => {
    const { renderMermaidBlocks } = await loadModule();
    const holder = document.createElement('div');
    holder.innerHTML = '<pre><code class="language-mermaid">mindmap\n  root((离屏))</code></pre>';

    await renderMermaidBlocks(holder, { interactive: false });

    expect(holder.querySelector('.mermaid-figure svg')).toBeTruthy();
  });

  it('主题切换重渲染与容器渲染并发时,图不会变成空壳', async () => {
    // 实测踩过的坑:竞态令牌按容器记时,主题重渲染会把组件那一批整体作废,
    // 已经替换进 DOM 的 figure 就永远停在空壳(state=ready 却没有 svg)。
    const { renderMermaidBlocks, refreshMermaidTheme } = await loadModule();
    const host = markdownHost('mindmap\n  root((并发))');
    await renderMermaidBlocks(host);

    refreshMermaidTheme();
    document.documentElement.setAttribute('data-theme', 'night');
    await renderMermaidBlocks(host);
    await new Promise((resolve) => setTimeout(resolve, 0));
    document.documentElement.removeAttribute('data-theme');

    const figure = host.querySelector('.mermaid-figure') as HTMLElement;
    expect(figure.dataset.mermaidState).toBe('ready');
    expect(figure.querySelector('svg')).toBeTruthy();
  });

  it('连线样式只给思维导图和流程图,时序图不出这个按钮', async () => {
    const { renderMermaidBlocks } = await loadModule();
    const flow = markdownHost('flowchart TD\n  A --> B');
    await renderMermaidBlocks(flow);
    const sequence = markdownHost('sequenceDiagram\n  用户->>系统: 请求');
    await renderMermaidBlocks(sequence);
    const timeline = markdownHost('timeline\n  title 里程碑\n  2026 : 上线');
    await renderMermaidBlocks(timeline);

    // 流程图:连线样式 + 下载 + 放大;时序图/时间线:只有下载 + 放大
    expect(flow.querySelectorAll('.mermaid-figure__tool')).toHaveLength(3);
    expect(sequence.querySelectorAll('.mermaid-figure__tool')).toHaveLength(2);
    expect(timeline.querySelectorAll('.mermaid-figure__tool')).toHaveLength(2);
  });

  it('图表声明前有 init 指令也能认出类型', async () => {
    const { renderMermaidBlocks } = await loadModule();
    const host = markdownHost("%%{init: {'theme':'base'}}%%\nmindmap\n  root(带指令)");
    await renderMermaidBlocks(host);

    expect(host.querySelectorAll('.mermaid-figure__tool')).toHaveLength(3);
  });

  it('图上带工具条:连线样式、下载、放大查看', async () => {
    const { renderMermaidBlocks } = await loadModule();
    const host = markdownHost('mindmap\n  root(工具条)');
    await renderMermaidBlocks(host);

    const tools = host.querySelectorAll('.mermaid-figure__tool');
    expect(tools).toHaveLength(3);
    // 每个按钮都要有可读名字,否则读屏只会念出一堆「按钮」
    Array.from(tools).forEach((tool) => expect(tool.getAttribute('aria-label')).toBeTruthy());
  });

  it('已渲染过的图能同步塞回 HTML,预览重建时不闪回代码块', async () => {
    const { renderMermaidBlocks, inlineCachedMermaid } = await loadModule();
    const code = 'mindmap\n  root(缓存)';
    const host = markdownHost(code);
    await renderMermaidBlocks(host);

    // 预览重建后又是一段代码块,这里应当被缓存里的图直接顶掉
    const rebuilt = `<h1>标题</h1><pre><code class="language-mermaid">${code}</code></pre>`;
    const inlined = inlineCachedMermaid(rebuilt);

    expect(inlined).toContain('mermaid-figure');
    expect(inlined).toContain('<svg');
    expect(inlined).not.toContain('language-mermaid');
  });

  it('改了图表内容、新图还没画好时沿用旧图,不退回代码块', async () => {
    const { renderMermaidBlocks, inlineCachedMermaid } = await loadModule();
    const previous = markdownHost('mindmap\n  root(旧)');
    await renderMermaidBlocks(previous);

    // 源码改了 → 缓存必然落空,这时要拿上一版同位置的图顶着
    const changed = '<pre><code class="language-mermaid">mindmap\n  root(新)</code></pre>';
    const inlined = inlineCachedMermaid(changed, previous);

    expect(inlined).toContain('<svg');
    expect(inlined).not.toContain('language-mermaid');
    expect(inlined).toContain("data-mermaid-state=\"stale\"");
    // 记的是新源码,后面才知道该照着什么重画
    expect(inlined).toContain('mindmap\n  root(新)');
  });

  it('顶着的旧图会被按新源码重渲染,最终显示新内容', async () => {
    const { renderMermaidBlocks, inlineCachedMermaid } = await loadModule();
    const previous = markdownHost('mindmap\n  root(旧)');
    await renderMermaidBlocks(previous);

    const host = document.createElement('div');
    host.innerHTML = inlineCachedMermaid(
      '<pre><code class="language-mermaid">mindmap\n  root(新)</code></pre>',
      previous,
    );
    document.body.appendChild(host);
    expect(host.querySelector('.mermaid-figure')?.getAttribute('data-mermaid-state')).toBe('stale');

    renderMock.mockResolvedValue({ svg: '<svg data-id="fresh"><text>新</text></svg>' });
    await renderMermaidBlocks(host);
    await new Promise((resolve) => setTimeout(resolve, 0));

    const figure = host.querySelector('.mermaid-figure') as HTMLElement;
    expect(figure.dataset.mermaidState).toBe('ready');
    expect(figure.querySelector('svg')?.getAttribute('data-id')).toBe('fresh');
  });

  it('全新图表给占位而不是摊开源码(刚插入图表时不该先冒出一段代码)', async () => {
    const { inlineCachedMermaid, renderMermaidBlocks } = await loadModule();
    const html = '<pre><code class="language-mermaid">mindmap\n  root(没缓存)</code></pre>';

    const inlined = inlineCachedMermaid(html);
    expect(inlined).toContain('mermaid-figure__placeholder');
    expect(inlined).toContain("data-mermaid-state=\"queued\"");
    expect(inlined).not.toContain('language-mermaid');

    // 占位随后要被真正渲染出来
    const host = document.createElement('div');
    host.innerHTML = inlined;
    document.body.appendChild(host);
    await renderMermaidBlocks(host);
    await new Promise((resolve) => setTimeout(resolve, 0));

    const figure = host.querySelector('.mermaid-figure') as HTMLElement;
    expect(figure.dataset.mermaidState).toBe('ready');
    expect(figure.querySelector('svg')).toBeTruthy();
    expect(figure.querySelector('.mermaid-figure__placeholder')).toBeNull();
  });

  it('缓存塞回来的图会在下一次渲染时补上工具条', async () => {
    const { renderMermaidBlocks, inlineCachedMermaid } = await loadModule();
    const code = 'mindmap\n  root(补工具条)';
    const first = markdownHost(code);
    await renderMermaidBlocks(first);

    const host = document.createElement('div');
    host.innerHTML = inlineCachedMermaid(`<pre><code class="language-mermaid">${code}</code></pre>`);
    document.body.appendChild(host);
    expect(host.querySelector('.mermaid-figure__tools')).toBeNull();

    await renderMermaidBlocks(host);
    expect(host.querySelectorAll('.mermaid-figure__tool')).toHaveLength(3);
  });

  it('根节点配色在插进 DOM 之前就写好,不会先闪一帧 mermaid 原色', async () => {
    const { renderMermaidBlocks } = await loadModule();
    renderMock.mockResolvedValue({
      svg: '<svg xmlns="http://www.w3.org/2000/svg"><g class="section-root"><rect fill="#1a14b5"></rect><text>中心主题</text></g></svg>',
    });
    const host = markdownHost('mindmap\n  root(配色)');
    await renderMermaidBlocks(host);

    const shape = host.querySelector('.section-root rect') as SVGElement;
    const text = host.querySelector('.section-root text') as SVGElement;
    // 外部 CSS 管不到 data URL 里的独立文档,颜色必须落在元素自己的 style 上
    expect(shape.style.fill).toBe('rgb(97, 92, 237)');
    expect(text.style.fill).toBe('rgb(255, 255, 255)');

    // 缓存里存的也必须是上过色的,否则预览重建同步复用时又会闪一下
    const figure = host.querySelector('.mermaid-figure__canvas') as HTMLElement;
    expect(figure.innerHTML).toContain('fill: rgb(97, 92, 237)');
  });

  it('根节点文字的位置校正在插进 DOM 前就做完,不会先偏再跳', async () => {
    const { renderMermaidBlocks } = await loadModule();
    renderMock.mockResolvedValue({
      svg: '<svg xmlns="http://www.w3.org/2000/svg"><g class="section-root"><rect></rect><text>中心主题</text></g></svg>',
    });
    // 复刻 mermaid 的产出:形状中心在 0,文字却从 0 起笔
    Object.defineProperty(window.SVGElement.prototype, 'getBBox', {
      configurable: true,
      value(this: Element) {
        return this.tagName === 'text'
          ? { x: 0, y: -10, width: 56, height: 20 }
          : { x: -43, y: -18, width: 86, height: 36 };
      },
    });

    const host = markdownHost('mindmap\n  root(位置)');
    await renderMermaidBlocks(host);

    const text = host.querySelector('.section-root text') as SVGElement;
    expect(text.getAttribute('transform')).toBe('translate(-28.00, 0)');
    // 加工完才进 DOM:标记与位移必须已经在这一份 HTML 里
    expect(text.getAttribute('data-ln-centered')).toBe('1');
  });

  it('重复加工不会把文字越挪越偏', async () => {
    const { renderMermaidBlocks, refreshMermaidTheme } = await loadModule();
    renderMock.mockResolvedValue({
      svg: '<svg xmlns="http://www.w3.org/2000/svg"><g class="section-root"><rect></rect><text>中心主题</text></g></svg>',
    });
    Object.defineProperty(window.SVGElement.prototype, 'getBBox', {
      configurable: true,
      value(this: Element) {
        return this.tagName === 'text'
          ? { x: 0, y: -10, width: 56, height: 20 }
          : { x: -43, y: -18, width: 86, height: 36 };
      },
    });

    const host = markdownHost('mindmap\n  root(幂等)');
    await renderMermaidBlocks(host);
    refreshMermaidTheme();
    await new Promise((resolve) => setTimeout(resolve, 0));

    const transforms = Array.from(host.querySelectorAll('.section-root text')).map((el) =>
      el.getAttribute('transform'),
    );
    transforms.forEach((value) => expect(value).toBe('translate(-28.00, 0)'));
  });

  it('mermaid 返回空 svg 时按失败处理,不留空壳', async () => {
    const { renderMermaidBlocks } = await loadModule();
    renderMock.mockResolvedValue({ svg: '' });
    const host = markdownHost('mindmap\n  root((空))');
    await renderMermaidBlocks(host);

    const figure = host.querySelector('.mermaid-figure') as HTMLElement;
    expect(figure.dataset.mermaidState).toBe('error');
    expect(figure.querySelector('code.language-mermaid')?.textContent).toBe('mindmap\n  root((空))');
  });

  describe('伴随模式(富文本编辑器)', () => {
    function richTextHost(code: string) {
      const host = document.createElement('div');
      host.innerHTML = `<p>正文</p><pre class="language-mermaid">${code}</pre><p>结尾</p>`;
      document.body.appendChild(host);
      return host;
    }

    it('保留源码代码块,图挂在它后面', async () => {
      const { renderMermaidBlocks } = await loadModule();
      const host = richTextHost('mindmap\n  root((富文本))');
      await renderMermaidBlocks(host, { companion: true });

      const pre = host.querySelector('pre.language-mermaid') as HTMLElement;
      expect(pre).toBeTruthy();
      // 源码块必须原封不动:任何加在它上面的 class/属性都会被 TinyMCE 存进笔记内容
      expect(pre.attributes).toHaveLength(1);
      expect(pre.getAttribute('class')).toBe('language-mermaid');
      const figure = pre.nextElementSibling as HTMLElement;
      expect(figure.classList.contains('mermaid-figure--companion')).toBe(true);
      expect(figure.querySelector('svg')).toBeTruthy();
    });

    it('图带 data-mce-bogus,不会被 TinyMCE 存进笔记内容', async () => {
      const { renderMermaidBlocks } = await loadModule();
      const host = richTextHost('mindmap\n  root((不进内容))');
      await renderMermaidBlocks(host, { companion: true });

      const figure = host.querySelector('.mermaid-figure--companion') as HTMLElement;
      expect(figure.getAttribute('data-mce-bogus')).toBe('all');
      expect(figure.getAttribute('contenteditable')).toBe('false');
    });

    it('源码没变时不重复渲染(编辑器 NodeChange 触发很密)', async () => {
      const { renderMermaidBlocks } = await loadModule();
      const host = richTextHost('mindmap\n  root((幂等))');
      await renderMermaidBlocks(host, { companion: true });
      await renderMermaidBlocks(host, { companion: true });
      await renderMermaidBlocks(host, { companion: true });

      expect(renderMock).toHaveBeenCalledTimes(1);
      expect(host.querySelectorAll('.mermaid-figure--companion')).toHaveLength(1);
    });

    it('改了源码就重渲染,且仍然只有一张图', async () => {
      const { renderMermaidBlocks } = await loadModule();
      const host = richTextHost('mindmap\n  root((改前))');
      await renderMermaidBlocks(host, { companion: true });

      const pre = host.querySelector('pre.language-mermaid') as HTMLElement;
      pre.textContent = 'mindmap\n  root((改后))';
      await renderMermaidBlocks(host, { companion: true });

      expect(renderMock).toHaveBeenCalledTimes(2);
      const figures = host.querySelectorAll('.mermaid-figure--companion');
      expect(figures).toHaveLength(1);
      expect(figures[0].getAttribute('data-mermaid-source')).toBe('mindmap\n  root((改后))');
    });

    it('源码块被删掉后,残留的图一并清掉', async () => {
      const { renderMermaidBlocks } = await loadModule();
      const host = richTextHost('mindmap\n  root((待删))');
      await renderMermaidBlocks(host, { companion: true });
      expect(host.querySelector('.mermaid-figure--companion')).toBeTruthy();

      host.querySelector('pre.language-mermaid')?.remove();
      await renderMermaidBlocks(host, { companion: true });

      expect(host.querySelector('.mermaid-figure--companion')).toBeNull();
    });
  });

  it('思维导图根节点文字被摆正(mermaid 把它按"从中心起笔"画,中文会顶出边框)', async () => {
    const { renderMermaidBlocks } = await loadModule();
    // 复刻 mermaid 的产出:形状中心在 0,文字却从 0 起笔
    renderMock.mockResolvedValue({
      svg: '<svg><g class="section-root"><rect></rect><text>中心主题</text></g></svg>',
    });
    const shapeBox = { x: -43, y: -18, width: 86, height: 36 };
    const textBox = { x: 0, y: -10, width: 56, height: 20 };
    Object.defineProperty(window.SVGElement.prototype, 'getBBox', {
      configurable: true,
      value(this: Element) {
        return this.tagName === 'text' ? textBox : shapeBox;
      },
    });

    const host = markdownHost('mindmap\n  root(中心主题)');
    await renderMermaidBlocks(host);

    const text = host.querySelector('.section-root text') as SVGElement;
    // 形状中心 0、文字中心 28 → 需要左移 28
    expect(text.getAttribute('transform')).toBe('translate(-28.00, 0)');
  });

  it('节点文字不靠 foreignObject:初始化必须关掉 htmlLabels', async () => {
    const { renderMermaidBlocks } = await loadModule();
    const host = markdownHost('mindmap\n  root((主题))');
    await renderMermaidBlocks(host);

    const config = initializeMock.mock.calls[0][0];
    expect(config.htmlLabels).toBe(false);
    expect(config.flowchart.htmlLabels).toBe(false);
    expect(config.securityLevel).toBe('strict');
  });
});
