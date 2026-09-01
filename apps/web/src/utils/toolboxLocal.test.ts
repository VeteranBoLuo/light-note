// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { downloadToolboxBlob, TOOLBOX_LOCAL_DELIVERY_EVENT } from './toolboxLocal';

describe('toolboxLocal download delivery', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
    Reflect.deleteProperty(URL, 'createObjectURL');
    Reflect.deleteProperty(URL, 'revokeObjectURL');
  });

  it('浏览器接管导出后只发出一次无内容的交付事件，并按时释放对象 URL', () => {
    vi.useFakeTimers();
    const createObjectURL = vi.fn(() => 'blob:toolbox-output');
    const revokeObjectURL = vi.fn();
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: createObjectURL });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: revokeObjectURL });
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    const delivery = vi.fn();
    window.addEventListener(TOOLBOX_LOCAL_DELIVERY_EVENT, delivery);

    downloadToolboxBlob(new Blob(['private-content']), 'private-file-name.md');

    expect(createObjectURL).toHaveBeenCalledOnce();
    expect(click).toHaveBeenCalledOnce();
    expect(delivery).toHaveBeenCalledOnce();
    expect(delivery.mock.calls[0]).toHaveLength(1);
    expect((delivery.mock.calls[0]?.[0] as CustomEvent).detail).toBeUndefined();
    expect(document.querySelector(`a[href="blob:toolbox-output"]`)).toBeNull();
    vi.advanceTimersByTime(1000);
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:toolbox-output');

    window.removeEventListener(TOOLBOX_LOCAL_DELIVERY_EVENT, delivery);
  });
});
