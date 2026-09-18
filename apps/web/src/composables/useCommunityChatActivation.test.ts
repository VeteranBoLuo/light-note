import { describe, expect, it } from 'vitest';
import { createApp, defineComponent, h, KeepAlive, nextTick, ref } from 'vue';
import { communityChatWorkspaceActive, useCommunityChatActivation } from './useCommunityChatActivation';
describe('chat runtime ownership', () => {
  it('yields when cached workspace is inactive and restores exactly one owner', async () => {
    let instanceCount = 0;
    const Chat = defineComponent({
      setup() {
        instanceCount++;
        const active = useCommunityChatActivation();
        return () => h('textarea', { 'data-active': active.value });
      },
    });
    const shown = ref(true);
    const host = document.createElement('div');
    document.body.appendChild(host);
    const app = createApp({
      render: () => h(KeepAlive, null, { default: () => (shown.value ? h(Chat) : h('div', 'feed fixture')) }),
    });
    app.mount(host);
    await nextTick();
    expect(communityChatWorkspaceActive.value).toBe(true);
    const input = host.querySelector('textarea')!;
    input.value = 'unsent text';
    shown.value = false;
    await nextTick();
    expect(communityChatWorkspaceActive.value).toBe(false);
    shown.value = true;
    await nextTick();
    expect(communityChatWorkspaceActive.value).toBe(true);
    expect(host.querySelector('textarea')?.value).toBe('unsent text');
    expect(instanceCount).toBe(1);
    app.unmount();
    host.remove();
    expect(communityChatWorkspaceActive.value).toBe(false);
  });
});
