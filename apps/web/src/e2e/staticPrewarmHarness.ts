import { createApp, h, ref } from 'vue';
import { createPinia } from 'pinia';
import { createI18n } from 'vue-i18n';
import { chatArtworkPrewarmSelections } from '@/utils/chatArtworkPrewarm';
import { manorPrewarmSelections } from '@/utils/manorPrewarm';
import { createStaticPrewarmScheduler } from '@/utils/staticPrewarm';
import {
  withForegroundActivity,
  withRequestActivity,
  holdRequestActivity,
  type ActivityKind,
} from '@/http/requestActivity';
import { applyUiDensity } from '@/composables/useUiDensity';
import AvatarFramePreview from '@/components/growth/AvatarFramePreview.vue';
import ProfileBackgroundArt from '@/components/growth/ProfileBackgroundArt.vue';
import BInput from '@/components/base/BasicComponents/BInput.vue';
import BButton from '@/components/base/BasicComponents/BButton.vue';
import { FRAME_IDS } from '@/config/growthFrames';
import icon from '@/config/icon';
import { publicArtworkUrls } from '@/utils/publicArtwork';
import '@/assets/css/index.less';

const params = new URLSearchParams(location.search);
const mobile = params.get('renderProfile') === 'mobile';
document.documentElement.classList.toggle('light-note-mobile-rendering', mobile);
document.documentElement.dataset.theme = params.get('theme') || 'day';
applyUiDensity(
  params.get('density') === 'compact' ? 'small' : params.get('density') === 'comfortable' ? 'large' : 'medium',
  mobile,
);
const scheduler = createStaticPrewarmScheduler({
  entryUrl: import.meta.url,
  mobile: () => mobile,
  delayMs: 200,
  concurrency: Number(params.get('concurrency') || 4) as 1 | 2 | 4,
});
let stop: (() => void) | undefined;
const elapsed = ref(0),
  loaded = ref(false);
const leases = new Map<string, () => void>();
const text = ref('');
const harness = {
  hold(id: string, kind: ActivityKind) {
    leases.get(id)?.();
    leases.set(id, holdRequestActivity(kind));
  },
  release(id: string) {
    leases.get(id)?.();
    leases.delete(id);
  },
  warmMany() {
    scheduler.submit({ urls: Array.from({ length: 70 }, (_, i) => `/assets/prewarm-${i}.js`), priority: 1 });
  },
  warmFast() {
    scheduler.submit({ urls: Array.from({ length: 64 }, (_, i) => `/assets/prewarm-fast-${i}.js`), priority: 1 });
  },
  start() {
    stop?.();
    stop = scheduler.submit({ urls: ['/assets/prewarm-payload.js'], priority: 1 });
  },
  warmManor() {
    manorPrewarmSelections(false).forEach((selection) => scheduler.submit(selection));
  },
  warmChatFirstScreen() {
    const selection = chatArtworkPrewarmSelections(false)[0];
    scheduler.submit(selection);
    return selection.urls;
  },
  stop() {
    stop?.();
  },
  snapshot: scheduler.snapshot,
  async incremental() {
    const start = performance.now();
    await withRequestActivity('incremental', async () => {
      await (await fetch(`/assets/foreground-test.js?run=${Date.now()}`)).arrayBuffer();
    });
    elapsed.value = performance.now() - start;
    loaded.value = true;
    return elapsed.value;
  },
  async navigate() {
    const start = performance.now();
    await withForegroundActivity(() => import(/* @vite-ignore */ `/assets/foreground-test.js?run=${Date.now()}`));
    elapsed.value = performance.now() - start;
    loaded.value = true;
    return elapsed.value;
  },
};
(window as any).__staticPrewarmHarness = harness;
const app = createApp({
  setup() {
    return () =>
      h('main', { style: { padding: 'var(--ui-space-24, 24px)', maxWidth: '900px', margin: 'auto' } }, [
        h('h1', '静态资源与切换验收'),
        h(BInput, {
          id: 'typing',
          modelValue: text.value,
          'onUpdate:modelValue': (value: string) => {
            text.value = value;
          },
        }),
        h(BButton, { id: 'plain-click' }, () => '普通点击'),
        h(BButton, { id: 'incremental', onClick: harness.incremental }, () => '追加一页'),
        h(BButton, { id: 'navigate', onClick: harness.navigate }, () => '切换模块'),
        h('output', { id: 'elapsed', 'data-loaded': loaded.value }, String(elapsed.value)),
        h('section', { style: { height: '150px', position: 'relative', margin: '24px 0' } }, [
          h(ProfileBackgroundArt, { backgroundId: 'background_coast' }),
        ]),
        h(
          'div',
          { id: 'frames', style: { height: '400px', overflow: 'auto' } },
          FRAME_IDS.map((frame) =>
            h(
              'div',
              {
                'data-frame': frame,
                style: { height: '180px', display: 'flex', alignItems: 'center', gap: '30px', padding: '20px' },
              },
              [
                h(AvatarFramePreview, {
                  frameId: frame,
                  src: icon.navigation.user,
                  size: 60,
                  pauseWhenOffscreen: true,
                }),
                h('span', frame),
              ],
            ),
          ),
        ),
        h(
          'section',
          { id: 'public-artwork' },
          ['/achievements/', '/community-chat/stickers/', '/brand-scenes/'].map((prefix) =>
            h('img', { src: publicArtworkUrls(prefix)[0], alt: prefix, width: 80, height: 80 }),
          ),
        ),
      ]);
  },
});
app.use(createPinia());
app.use(createI18n({ legacy: false, locale: 'zh-CN', messages: { 'zh-CN': {} } }));
app.mount('#app');
window.addEventListener('pagehide', () => scheduler.dispose(), { once: true });
