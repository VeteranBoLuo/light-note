import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import VideoPreview from './VideoPreview.vue';

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key: string) => key }),
}));

vi.mock('@/components/base/BasicComponents/BButton.vue', () => ({
  default: {
    emits: ['click'],
    template: '<button @click="$emit(\'click\')"><slot /></button>',
  },
}));

vi.mock('@/components/base/SvgIcon/src/SvgIcon.vue', () => ({
  default: { template: '<span />' },
}));

let cleanup: (() => void) | undefined;

afterEach(() => {
  cleanup?.();
  cleanup = undefined;
  vi.restoreAllMocks();
});

function mountVideoPreview(overrides: Record<string, unknown> = {}) {
  const host = document.createElement('div');
  document.body.append(host);
  const app = createApp({
    setup() {
      return () =>
        h(VideoPreview, {
          videoUrl: 'https://files.example/clip.mp4?signature=test',
          mimeType: 'video/mp4',
          formatLabel: 'MP4',
          ...overrides,
        });
    },
  });
  app.mount(host);
  cleanup = () => {
    app.unmount();
    host.remove();
  };
  return host;
}

describe('VideoPreview', () => {
  it('loads metadata without autoplay and only plays after an explicit click', async () => {
    const play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
    const onLoaded = vi.fn();
    const host = mountVideoPreview({ onLoaded });
    const video = host.querySelector('video');

    expect(video?.autoplay).toBe(false);
    expect(video?.querySelector('source')?.getAttribute('type')).toBe('video/mp4');
    expect(play).not.toHaveBeenCalled();

    video?.dispatchEvent(new Event('loadedmetadata'));
    await nextTick();

    expect(onLoaded).toHaveBeenCalledOnce();
    expect(play).not.toHaveBeenCalled();
    host.querySelector<HTMLButtonElement>('.video-play-button')?.click();
    await nextTick();
    expect(play).toHaveBeenCalledOnce();
  });

  it('reports a stable media error instead of exposing the browser event', async () => {
    const onError = vi.fn();
    const host = mountVideoPreview({ onError });

    host.querySelector('video')?.dispatchEvent(new Event('error'));
    await nextTick();

    expect(onError).toHaveBeenCalledOnce();
    expect(onError.mock.calls[0][0]).toBeInstanceOf(Error);
    expect(onError.mock.calls[0][0].message).toBe('cloudSpace.previewPanel.mediaLoadFailed');
  });
});
