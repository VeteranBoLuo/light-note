import { createApp, defineComponent, nextTick } from 'vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import TypewriterOutput from './TypewriterOutput.vue';

describe('TypewriterOutput 渲染空白语义', () => {
  let app: ReturnType<typeof createApp> | null = null;
  let host: HTMLElement | null = null;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
  });

  afterEach(() => {
    app?.unmount();
    host?.remove();
    app = null;
    host = null;
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  async function mountOutput(props: Record<string, unknown>) {
    host = document.createElement('div');
    document.body.append(host);
    app = createApp(
      defineComponent({
        components: { TypewriterOutput },
        setup: () => ({ props }),
        template: '<TypewriterOutput v-bind="props" />',
      }),
    );
    app.mount(host);
    await vi.runAllTimersAsync();
    await nextTick();
    return host;
  }

  it('Markdown 和 HTML 使用折叠源码空白的富内容模式', async () => {
    let wrapper = await mountOutput({ content: '## 摘要\n\n- 第一项\n- 第二项', markdown: true, typingSpeed: 0 });
    expect(wrapper.querySelector('.typewriter-content--markup')).not.toBeNull();
    expect(wrapper.querySelector('.typewriter-content--plain')).toBeNull();
    expect(wrapper.querySelectorAll('li')).toHaveLength(2);

    app?.unmount();
    host?.remove();
    app = null;
    host = null;

    wrapper = await mountOutput({
      content: '<h2>摘要</h2>\n\n<ul>\n<li>第一项</li>\n<li>第二项</li>\n</ul>',
      typingSpeed: 0,
    });
    expect(wrapper.querySelector('.typewriter-content--markup')).not.toBeNull();
    expect(wrapper.querySelectorAll('li')).toHaveLength(2);
  });

  it('纯文本模式仍保留原始换行', async () => {
    const wrapper = await mountOutput({ content: '第一行\n\n第三行', renderAsText: true, typingSpeed: 0 });
    const content = wrapper.querySelector('.typewriter-content--plain');
    expect(content).not.toBeNull();
    expect(content?.textContent).toBe('第一行\n\n第三行');
    expect(wrapper.querySelector('.typewriter-content--markup')).toBeNull();
  });
});
