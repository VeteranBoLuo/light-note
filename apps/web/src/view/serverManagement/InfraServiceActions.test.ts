import { createApp, h, nextTick } from 'vue';
import { createI18n } from 'vue-i18n';
import { afterEach, describe, it, expect, vi } from 'vitest';
import type { HostAgentServiceSnapshot } from '@lightnote/shared/host-agent-protocol';
vi.mock('@/components/base/BasicComponents/BActionMenu.vue', async () => {
  const { h } = await import('vue');
  return {
    default: {
      props: ['items'],
      emits: ['select'],
      setup(props: any, { emit }: any) {
        return () =>
          h(
            'div',
            props.items.map((item: any) => h('button', { onClick: () => emit('select', item.key) }, item.key)),
          );
      },
    },
  };
});
import InfraServiceActions from './InfraServiceActions.vue';
const cleanups: Array<() => void> = [];
afterEach(() => cleanups.splice(0).forEach((fn) => fn()));
function mount(id: string, actions: string[]) {
  const host = document.createElement('div');
  document.body.append(host);
  const onAction = vi.fn();
  const onLogs = vi.fn();
  const app = createApp({
    render: () =>
      h(InfraServiceActions, {
        service: { id, actions } as HostAgentServiceSnapshot,
        loading: false,
        onAction,
        onLogs,
      }),
  });
  app.use(createI18n({ legacy: false, missingWarn: false, fallbackWarn: false, messages: { en: {} } }));
  app.mount(host);
  cleanups.push(() => {
    app.unmount();
    host.remove();
  });
  return { host, onAction, onLogs };
}
describe('infra service action boundary', () => {
  it.each(['lightnote-api', 'mysql', 'redis'])('keeps %s read only even with a malformed action list', (id) => {
    const { host } = mount(id, ['service.restart', 'nginx.reload']);
    expect(host.querySelectorAll('button')).toHaveLength(1);
  });
  it('keeps the supplied worker action and forwards its exact action identifier', async () => {
    const { host, onAction, onLogs } = mount('lightnote-document-worker', ['service.restart', 'nginx.reload']);
    const buttons = host.querySelectorAll('button');
    expect(buttons).toHaveLength(2);
    buttons[0].click();
    buttons[1].click();
    await nextTick();
    expect(onLogs).toHaveBeenCalledOnce();
    expect(onAction).toHaveBeenCalledWith('service.restart');
  });
  it('never offers actions absent from the snapshot', () => {
    expect(mount('nginx', []).host.querySelectorAll('button')).toHaveLength(1);
  });
});
