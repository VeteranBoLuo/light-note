import { describe, expect, it } from 'vitest';
import { createApp, h, nextTick, onMounted, ref } from 'vue';
import CommunityLayout from './CommunityLayout.vue';

describe('CommunityLayout', () => {
  it('keeps navigation discovery mounted and preserves the workspace when capabilities change', async () => {
    const disabled = ref(true);
    let navigationMounts = 0;
    let workspaceMounts = 0;
    const Navigation = {
      setup() {
        onMounted(() => navigationMounts++);
        return () => h('span', 'navigation');
      },
    };
    const Workspace = {
      setup() {
        onMounted(() => workspaceMounts++);
        return () => h('textarea');
      },
    };
    const host = document.createElement('div');
    document.body.append(host);
    const app = createApp({
      render: () =>
        h(
          CommunityLayout,
          { disabled: disabled.value, chat: true },
          {
            navigation: () => h(Navigation),
            default: () => h(Workspace),
            aside: () => h('p', 'context'),
          },
        ),
    });
    app.mount(host);
    try {
      const input = host.querySelector('textarea')!;
      input.value = 'unsent draft';
      expect((host.querySelector('.community-layout-nav') as HTMLElement).style.display).toBe('none');
      for (const value of [false, true, false]) {
        disabled.value = value;
        await nextTick();
      }
      expect(navigationMounts).toBe(1);
      expect(workspaceMounts).toBe(1);
      expect(host.querySelector('textarea')).toBe(input);
      expect(input.value).toBe('unsent draft');
      expect(host.querySelector('.community-layout-context')).not.toBeNull();
    } finally {
      app.unmount();
      host.remove();
    }
  });
});
