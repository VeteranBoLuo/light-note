import { createApp, defineComponent, nextTick, ref } from 'vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import BPopover from './BPopover.vue';

vi.mock('@/utils/zoom', () => ({ getRootZoom: () => 1 }));

class ResizeObserverStub {
  observe() {}
  disconnect() {}
}

describe('BPopover 键盘关闭', () => {
  const mounted: Array<{ app: ReturnType<typeof createApp>; host: HTMLElement }> = [];

  beforeEach(() => {
    vi.stubGlobal('ResizeObserver', ResizeObserverStub);
  });

  afterEach(() => {
    mounted.splice(0).forEach(({ app, host }) => {
      app.unmount();
      host.remove();
    });
    document.querySelectorAll('.b-popover-panel').forEach((panel) => panel.remove());
    vi.unstubAllGlobals();
  });

  function mountPopover(id: string) {
    const host = document.createElement('div');
    document.body.append(host);
    const App = defineComponent({
      components: { BPopover },
      setup() {
        return { open: ref(false), id };
      },
      template: `
        <BPopover v-model:open="open" trigger="click">
          <button :id="id + '-trigger'" type="button">打开</button>
          <template #content><button :id="id + '-content'" type="button">内容</button></template>
        </BPopover>
      `,
    });
    const app = createApp(App);
    app.mount(host);
    mounted.push({ app, host });
    return host;
  }

  async function waitForLeaveTransition() {
    await new Promise((resolve) => setTimeout(resolve, 180));
    await nextTick();
  }

  it('按 Escape 关闭浮层、阻止事件穿透并把焦点还给触发按钮', async () => {
    const host = mountPopover('single');
    const trigger = host.querySelector('#single-trigger') as HTMLButtonElement;
    trigger.click();
    await nextTick();
    const content = document.querySelector('#single-content') as HTMLButtonElement;
    content.focus();
    const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'Escape' });

    expect(content.dispatchEvent(event)).toBe(false);
    await waitForLeaveTransition();

    expect(document.querySelector('#single-content')).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it('同时存在多个浮层时一次 Escape 只关闭最上层', async () => {
    const firstHost = mountPopover('first');
    const secondHost = mountPopover('second');
    const firstTrigger = firstHost.querySelector('#first-trigger') as HTMLButtonElement;
    const secondTrigger = secondHost.querySelector('#second-trigger') as HTMLButtonElement;
    firstTrigger.click();
    secondTrigger.click();
    await nextTick();

    const secondContent = document.querySelector('#second-content') as HTMLButtonElement;
    secondContent.focus();
    secondContent.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'Escape' }));
    await waitForLeaveTransition();

    expect(document.querySelector('#second-content')).toBeNull();
    expect(document.querySelector('#first-content')).toBeTruthy();
    expect(document.activeElement).toBe(secondTrigger);
  });
});
