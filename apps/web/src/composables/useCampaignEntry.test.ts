import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp, defineComponent, nextTick } from 'vue';
const api = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock('@/api/supportApi', () => ({ getCampaignEntry: api.get }));
import { useCampaignEntry, refreshCampaignEntry } from './useCampaignEntry';
let app: ReturnType<typeof createApp>;
let host: HTMLDivElement;
afterEach(() => {
  app?.unmount();
  host?.remove();
  vi.useRealTimers();
});
describe('shared campaign entrances', () => {
  it('shares in-flight requests, renders nothing when hidden and expires all entrances together', async () => {
    vi.useFakeTimers();
    let resolve!: (value: unknown) => void;
    api.get.mockImplementationOnce(
      () =>
        new Promise((r) => {
          resolve = r;
        }),
    );
    const Entry = defineComponent({
      setup: useCampaignEntry,
      template: '<a v-if="entry" :href="path">{{ entry.title }}</a>',
    });
    host = document.createElement('div');
    document.body.append(host);
    app = createApp({ components: { Entry }, template: '<Entry/><Entry/><Entry/>' });
    app.mount(host);
    await nextTick();
    expect(api.get).toHaveBeenCalledTimes(1);
    expect(host.querySelectorAll('a')).toHaveLength(0);
    const now = Date.now();
    resolve({
      campaignKey: 'autumn',
      title: 'Autumn',
      startsAt: new Date(now + 10000).toISOString(),
      endsAt: new Date(now + 60000).toISOString(),
      serverNow: new Date(now).toISOString(),
    });
    await refreshCampaignEntry();
    await nextTick();
    expect(host.querySelectorAll('a')).toHaveLength(3);
    await vi.advanceTimersByTimeAsync(60000);
    await nextTick();
    expect(host.querySelectorAll('a')).toHaveLength(0);
    api.get.mockResolvedValue(null);
    await refreshCampaignEntry(true);
    await nextTick();
    await vi.advanceTimersByTimeAsync(86400000);
    expect(host.querySelectorAll('a')).toHaveLength(0);
    expect(api.get).toHaveBeenCalledTimes(2);
  });
});
