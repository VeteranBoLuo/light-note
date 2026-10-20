import { createApp, h, ref } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import { createI18n } from 'vue-i18n';
import { createRouter, createMemoryHistory } from 'vue-router';
import '@/assets/css/index.less';
import request from '@/http/request';
import globalDirect from '@/config/globalDirect';
import { bookmarkStore, useUserStore } from '@/store';
import { RoleEnum } from '@/config/bookmarkCfg';
import { applyUiDensity } from '@/composables/useUiDensity';
import zh from '@/i18n/locales/zh-CN';
import en from '@/i18n/locales/en-US';
import Editor from '@/components/community/CommunityPostEditor.vue';
import PostCard from '@/components/community/CommunityPostCard.vue';
import type { FeedImage, FeedPost } from '@/api/communityFeedApi';
import { communityImageMarkdown } from '@lightnote/shared/community-feed';
// All requests are answered in memory. No production or development backend is contacted.
const params = new URLSearchParams(location.search);
const first = '11111111-1111-4111-8111-111111111111',
  attached = '22222222-2222-4222-8222-222222222222';
const images = new Map<string, FeedImage>(
  [first, attached].map((id, i) => [
    id,
    {
      publicId: id,
      url: i ? '/brand-scenes/store.webp' : '/brand-scenes/autumn-vista.webp',
      width: 1200,
      height: 800,
      fileSize: 100,
      contentType: 'image/webp',
    },
  ]),
);
const initial: FeedPost = {
  publicId: '33333333-3333-4333-8333-333333333333',
  revision: 1,
  title: '把截图放在说明旁边',
  body: params.has('empty')
    ? ''
    : `第一段操作说明。\n\n${communityImageMarkdown(first, '步骤截图')}\n\n第二段说明，可以继续插入图片。`,
  images: params.has('empty') ? [] : [...images.values()],
  resources: [],
  kind: 'share',
  topics: ['tips'],
  status: 'published',
  pending: false,
  locked: false,
  resolved: false,
  publishedAt: '',
  mentions: [],
  likeCount: 0,
  commentCount: 0,
  liked: false,
  subscription: 'disabled',
  isOwn: true,
  author: { name: '示例作者', userPublicId: 'fixture-author' },
};
// Restore the isolated fixture's uploaded metadata so draft refresh exercises stable image URLs.
try {
  const key = `community-post-draft:isolated-inline-images-${params.get('case') || 'default'}|user|:${initial.publicId}`;
  const stored = JSON.parse(localStorage.getItem(key) || 'null');
  for (const image of stored?.draft?.images || [])
    if (image.status === 'ready')
      images.set(image.uploadId || image.publicId, { ...image, publicId: image.uploadId || image.publicId });
} catch {
  /* Empty fixture storage. */
}
const saved = ref<FeedPost | null>(null);
let lastSubmit: any;
let failed = false;
request.defaults.adapter = async (config) => {
  const url = String(config.url || '');
  let data: any = {};
  if (url.endsWith('/images') && config.data instanceof FormData) {
    await new Promise((resolve) => setTimeout(resolve, params.has('slow') ? 1800 : 80));
    if (params.has('fail') && !failed) {
      failed = true;
      throw new Error('Fixture upload failure');
    }
    const file = config.data.get('file');
    if (!file || typeof file === 'string') throw new Error('Fixture expected an uploaded image file');
    const id = String(config.data.get('requestId'));
    const imageUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
    const probe = new Image();
    probe.src = imageUrl;
    await probe.decode();
    const image = {
      publicId: id,
      url: imageUrl,
      width: probe.naturalWidth,
      height: probe.naturalHeight,
      fileSize: file.size,
      contentType: file.type,
    };
    images.set(id, image);
    data = image;
  } else if (url.endsWith('/posts') && config.method === 'post') {
    lastSubmit = typeof config.data === 'string' ? JSON.parse(config.data) : config.data;
    data = { publicId: initial.publicId, revision: 2, status: 'published' };
  } else if (url.includes('/profile')) data = { publicPreview: initial.author };
  return { data: { status: 200, msg: 'ok', data }, status: 200, statusText: 'OK', headers: {}, config, request: null };
};
const router = createRouter({
  history: createMemoryHistory(),
  routes: [{ path: '/:pathMatch(.*)*', component: { render: () => null } }],
});
await router.push('/');
const pinia = createPinia();
setActivePinia(pinia);
const theme = params.get('theme') === 'night' ? 'night' : 'day';
document.documentElement.dataset.theme = theme;
document.documentElement.classList.toggle('light-note-mobile-rendering', params.get('renderProfile') === 'mobile');
applyUiDensity(params.get('density'), window.innerWidth <= 767);
const app = createApp({
  setup: () => () =>
    saved.value || params.has('read') || params.has('feed')
      ? h('main', { style: 'width:90%;max-width:70ch;margin:auto;padding:var(--ui-space-24,24px)' }, [
          h(PostCard, { post: saved.value || initial, detail: !params.has('feed') }),
        ])
      : h(Editor, {
          post: initial,
          topics: [{ value: 'tips', label: '使用技巧' }],
          profileEnabled: true,
          imagesEnabled: true,
          inlineImagesEnabled: true,
          resourcesEnabled: false,
          onSaved: () => {
            saved.value = { ...initial, ...lastSubmit, images: lastSubmit.images.map((id: string) => images.get(id)) };
          },
        }),
});
app.use(pinia);
app.use(router);
app.use(
  createI18n({
    legacy: false,
    locale: params.get('locale') || 'zh-CN',
    fallbackLocale: 'zh-CN',
    messages: { 'zh-CN': zh, 'en-US': en },
  }),
);
useUserStore(pinia).setUserInfo({
  id: 'isolated-inline-images-' + (params.get('case') || 'default'),
  role: RoleEnum.USER,
  userName: '示例作者',
  preferences: { theme, lang: 'zh-CN', noteViewMode: 'card' },
});
bookmarkStore(pinia).screenWidth = window.innerWidth;
globalDirect(app);
app.mount('#app');
