import { createApp, h, nextTick, reactive } from 'vue';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ACHIEVEMENT_KEYS, achievementVisualFor } from '@/config/achievements';
vi.mock('@/components/base/SvgIcon/src/SvgIcon.vue', () => ({
  default: { props: ['src', 'size'], template: '<span class="glyph" />' },
}));
import AchievementEmblem from './AchievementEmblem.vue';
let cleanup: () => void;
afterEach(() => {
  cleanup?.();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
});
function mount(input: Record<string, unknown>) {
  const props = reactive({ achievementKey: 'streak_1', ...input });
  const host = document.createElement('div');
  document.body.append(host);
  const app = createApp({ render: () => h(AchievementEmblem, props) });
  app.mount(host);
  cleanup = () => {
    app.unmount();
    host.remove();
  };
  return {
    host,
    props,
  };
}
async function load(host: HTMLElement, layers = true) {
  host.querySelector('img')!.dispatchEvent(new Event('load'));
  await nextTick();
  if (layers) {
    host.querySelectorAll('.enamel-motion__layer').forEach((img) => img.dispatchEvent(new Event('load')));
    await nextTick();
  }
}
function visibility() {
  const hidden = vi.spyOn(document, 'hidden', 'get').mockReturnValue(false);
  let callback: (entries: unknown[]) => void = () => {};
  const disconnect = vi.fn(),
    attach = vi.fn();
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      constructor(cb: typeof callback) {
        callback = cb;
      }
      observe() {
        attach();
      }
      disconnect() {
        disconnect();
      }
    },
  );
  return { hidden, attach, disconnect, set: (shown: boolean) => callback([{ isIntersecting: shown }]) };
}
const highest = ACHIEVEMENT_KEYS.filter((key) => achievementVisualFor(key).tier === 5);
describe('AchievementEmblem motion', () => {
  it.each(highest)('animates unlocked highest-tier %s in the wall without loading large art', async (key) => {
    const view = visibility();
    const { host } = mount({ achievementKey: key, size: 72, animated: true });
    await load(host);
    view.set(true);
    await nextTick();
    expect(host.querySelector('img')?.getAttribute('src')).toContain(`${key}-small.webp`);
    expect(host.querySelector('img')?.getAttribute('loading')).toBe('lazy');
    expect(host.querySelector('.achievement-emblem--animated')).not.toBeNull();
    expect(host.querySelector('.achievement-emblem--paused')).toBeNull();
    expect(host.querySelector('.enamel-motion--ready')).not.toBeNull();
    expect(
      [...host.querySelectorAll('.enamel-motion__layer')].every((img) =>
        img.getAttribute('src')?.endsWith('-small.webp'),
      ),
    ).toBe(true);
  });
  it.each([{ size: 30 }, { locked: true }, { animated: false }, { achievementKey: 'note_200' }])(
    'keeps small, locked, disabled and ordinary badges static (%j)',
    async (input) => {
      const view = visibility();
      const { host } = mount({ achievementKey: 'level_15', size: 200, animated: true, ...input });
      await load(host);
      expect(host.querySelector('.enamel-motion')).toBeNull();
      expect(view.attach).not.toHaveBeenCalled();
    },
  );
  it('keeps the complete poster visible until every layer is ready, and restores it on layer failure', async () => {
    const { host, props } = mount({ achievementKey: 'level_15', size: 200, animated: true });
    await load(host, false);
    const layers = [...host.querySelectorAll('.enamel-motion__layer')];
    layers.slice(0, -1).forEach((img) => img.dispatchEvent(new Event('load')));
    await nextTick();
    expect(host.querySelector('.achievement-emblem--animated')).toBeNull();
    layers.at(-1)!.dispatchEvent(new Event('load'));
    await nextTick();
    expect(host.querySelector('.achievement-emblem--animated')).not.toBeNull();
    layers[0].dispatchEvent(new Event('error'));
    await nextTick();
    expect(host.querySelector('.enamel-motion')).toBeNull();
    expect(host.querySelector('.achievement-emblem--animated')).toBeNull();
    expect(host.querySelector('.achievement-emblem__art')).not.toBeNull();
    props.achievementKey = 'note_500';
    await nextTick();
    await load(host);
    expect(host.querySelector('.achievement-emblem--animated')).not.toBeNull();
  });
  it('reloads the correctly sized layer set when moving between thumbnail and detail sizes', async () => {
    const { host, props } = mount({ achievementKey: 'level_15', size: 72, animated: true });
    await load(host);
    const before = host.querySelector('.enamel-motion');
    props.size = 200;
    await nextTick();
    expect(host.querySelector('.achievement-emblem--animated')).toBeNull();
    await load(host);
    expect(host.querySelector('.enamel-motion')).not.toBe(before);
    expect(
      [...host.querySelectorAll('.enamel-motion__layer')].every(
        (img) => !img.getAttribute('src')?.endsWith('-small.webp'),
      ),
    ).toBe(true);
  });
  it('keeps the same illustration mounted while pausing off screen and in the background, without a timed reveal', async () => {
    vi.useFakeTimers();
    const view = visibility();
    const { host } = mount({ achievementKey: 'note_500', size: 200, animated: true });
    await load(host);
    const motion = host.querySelector('.enamel-motion');
    view.set(true);
    await nextTick();
    expect(host.querySelector('.enamel-motion--paused')).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(8000);
    expect(host.querySelector('.enamel-motion')).toBe(motion);
    view.set(false);
    await nextTick();
    expect(motion?.classList.contains('enamel-motion--paused')).toBe(true);
    view.set(true);
    await nextTick();
    expect(motion?.classList.contains('enamel-motion--paused')).toBe(false);
    view.hidden.mockReturnValue(true);
    document.dispatchEvent(new Event('visibilitychange'));
    await nextTick();
    expect(motion?.classList.contains('enamel-motion--paused')).toBe(true);
    view.hidden.mockReturnValue(false);
    document.dispatchEvent(new Event('visibilitychange'));
    await nextTick();
    expect(motion?.classList.contains('enamel-motion--paused')).toBe(false);
    expect(host.querySelector('.enamel-motion')).toBe(motion);
    expect(vi.getTimerCount()).toBe(0);
  });
  it('responds to motion preference changes and releases observers when disabled or unmounted', async () => {
    const view = visibility();
    let motionChange = () => {};
    const query = {
      matches: false,
      addEventListener: vi.fn((_event: string, fn: () => void) => {
        motionChange = fn;
      }),
      removeEventListener: vi.fn(),
    };
    vi.stubGlobal('matchMedia', () => query);
    const { host, props } = mount({ achievementKey: 'level_15', size: 200, animated: true });
    await load(host);
    view.set(true);
    await nextTick();
    query.matches = true;
    motionChange();
    await nextTick();
    expect(host.querySelector('.enamel-motion')).toBeNull();
    query.matches = false;
    motionChange();
    await nextTick();
    expect(host.querySelector('.enamel-motion')).not.toBeNull();
    props.animated = false;
    await nextTick();
    expect(host.querySelector('.enamel-motion')).toBeNull();
    expect(view.disconnect).toHaveBeenCalledTimes(1);
    props.animated = true;
    await nextTick();
    expect(view.attach).toHaveBeenCalledTimes(2);
    cleanup();
    cleanup = () => {};
    expect(view.disconnect).toHaveBeenCalledTimes(2);
    expect(query.removeEventListener).toHaveBeenCalledTimes(2);
  });
  it('falls back without effects after failure and resets correctly when the achievement changes', async () => {
    const { host, props } = mount({ achievementKey: 'level_15', size: 200, animated: true });
    await load(host);
    host.querySelector('img')!.dispatchEvent(new Event('error'));
    await nextTick();
    expect(host.querySelector('.glyph')).not.toBeNull();
    expect(host.querySelector('.enamel-motion')).toBeNull();
    props.achievementKey = 'future';
    await nextTick();
    expect(host.querySelector('img')).toBeNull();
    props.achievementKey = 'note_500';
    await nextTick();
    expect(host.querySelector('img')?.getAttribute('src')).toContain('note_500.webp');
    await load(host);
    expect(host.querySelector('.enamel-motion')).not.toBeNull();
  });
});
