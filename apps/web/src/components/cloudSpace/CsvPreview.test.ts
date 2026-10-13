import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp, h, nextTick, ref } from 'vue';
import CsvPreview from './CsvPreview.vue';

vi.mock('@/components/base/BasicComponents/BTable/BTable.vue', () => ({
  default: { props: ['data'], template: '<div class="table-data">{{ JSON.stringify(data) }}</div>' },
}));

const disposers: (() => void)[] = [];
afterEach(() => {
  disposers.splice(0).forEach((dispose) => dispose());
  vi.unstubAllGlobals();
});
function mount() {
  const src = ref('/first.csv');
  const rendered = vi.fn();
  const error = vi.fn();
  const host = document.createElement('div');
  document.body.append(host);
  const app = createApp({ render: () => h(CsvPreview, { src: src.value, onRendered: rendered, onError: error }) });
  app.mount(host);
  const unmount = () => {
    app.unmount();
    host.remove();
  };
  disposers.push(unmount);
  return { src, rendered, error, host, unmount };
}

describe('CSV 预览加载生命周期', () => {
  it('从原始 GBK 字节读取中文，并把所有单元格作为文本展示', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          new Response(new Uint8Array([0xd6, 0xd0, 0xce, 0xc4, 44, ...new TextEncoder().encode('00123,=1+1')])),
        ),
    );
    const view = mount();
    await vi.waitFor(() => expect(view.rendered).toHaveBeenCalledOnce());
    expect(view.host.textContent).toContain('中文');
    expect(view.host.textContent).toContain('00123');
    expect(view.host.textContent).toContain('=1+1');
    expect(view.error).not.toHaveBeenCalled();
  });
  it('切换文件中止旧请求，迟到的结果不能替换新文件', async () => {
    let finishOld!: (value: Response) => void;
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<Response>((resolve) => {
            finishOld = resolve;
          }),
      )
      .mockResolvedValueOnce(new Response('新的,内容'));
    vi.stubGlobal('fetch', fetchMock);
    const view = mount();
    view.src.value = '/second.csv';
    await nextTick();
    expect(fetchMock.mock.calls[0][1].signal.aborted).toBe(true);
    await vi.waitFor(() => expect(view.rendered).toHaveBeenCalledOnce());
    finishOld(new Response('过期,内容'));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(view.host.textContent).toContain('新的');
    expect(view.host.textContent).not.toContain('过期');
    expect(view.rendered).toHaveBeenCalledOnce();
  });
  it('关闭预览后中止读取，迟到失败不再通知外层', async () => {
    let fail!: (error: Error) => void;
    const fetchMock = vi.fn(
      (_input: unknown, _init?: RequestInit) =>
        new Promise<Response>((_, reject) => {
          fail = reject;
        }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const view = mount();
    disposers.pop();
    view.unmount();
    expect(fetchMock.mock.calls[0][1]?.signal?.aborted).toBe(true);
    fail(new Error('late network error'));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(view.error).not.toHaveBeenCalled();
    expect(view.rendered).not.toHaveBeenCalled();
  });
  it.each([
    [() => new Response('a,"unclosed'), { code: 'FILE_CONTENT_INVALID' }],
    [() => new Response('a'.repeat(1_000_001)), { code: 'FILE_SIZE_INVALID' }],
    [() => new Response('', { status: 410 }), { status: 410 }],
    [() => new Response('', { status: 503 }), { status: 503 }],
  ])('保留内容错误、超限和 HTTP 失败的区别', async (response, expected) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response()));
    const view = mount();
    await vi.waitFor(() => expect(view.error).toHaveBeenCalledWith(expect.objectContaining(expected)));
    expect(view.rendered).not.toHaveBeenCalled();
  });
});
