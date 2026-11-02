/** Only in-memory fixtures: never contacts a business API or object storage. */
import { createApp, h, ref } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import { createRouter, createMemoryHistory, RouterView } from 'vue-router';
import { createI18n } from 'vue-i18n';
import axios, { AxiosError, CanceledError } from 'axios';
import request from '@/http/request';
import { bookmarkStore, cloudSpaceStore, useUserStore } from '@/store';
import { applyUiDensity } from '@/composables/useUiDensity';
import zh from '@/i18n/locales/zh-CN';
import en from '@/i18n/locales/en-US';
import HandleBtnGroup from '@/components/cloudSpace/HandleBtnGroup.vue';
import '@/assets/css/index.less';

const params = new URLSearchParams(location.search);
const pinia = createPinia();
setActivePinia(pinia);
const bookmark = bookmarkStore();
bookmark.screenWidth = innerWidth;
bookmark.screenHeight = innerHeight;
const user = useUserStore();
user.id = 'upload-fixture';
user.role = 'user';
user.preferences.theme = params.get('theme') === 'night' ? 'night' : 'day';
document.documentElement.dataset.theme = user.currentTheme;
document.documentElement.classList.toggle('light-note-mobile-rendering', params.get('renderProfile') === 'mobile');
applyUiDensity(params.get('density') || 'medium', !bookmark.isDesktop);
const fixture = {
  serial: 0,
  puts: [] as string[],
  batches: [] as number[],
  confirmed: new Set<string>(),
  active: 0,
  peak: 0,
  refreshes: 0,
  fail: true,
  quota: false,
  putDelay: 25,
  duplicate: false,
  delayCheck: 0,
  failCheck: false,
  checks: 0,
  targets: [] as Array<string | null>,
};
const cloud = cloudSpaceStore();
cloud.maxSpace = 100000;
cloud.usedSpace = 0;
cloud.getUsedSpace = async () => true;
cloud.refreshAfterFileMutation = async () => {
  fixture.refreshes++;
  return true;
};
request.defaults.adapter = async (config) => {
  if (config.signal?.aborted) throw new CanceledError();
  const body = typeof config.data === 'string' ? JSON.parse(config.data) : config.data || {};
  const url = config.url || '';
  let data: any = [];
  let status = 200;
  if (url.endsWith('/checkFileNames')) {
    fixture.checks++;
    if (fixture.delayCheck) await new Promise((resolve) => setTimeout(resolve, fixture.delayCheck));
    if (fixture.failCheck) status = 500;
    data = {
      allNames: fixture.duplicate ? [body.fileNames[0]] : [],
      check: body.fileNames.map((fileName: string, index: number) => ({
        fileName,
        exists: fixture.duplicate && index === 0,
      })),
    };
  } else if (url.endsWith('/uploadFiles')) {
    fixture.batches.push(body.files.length);
    if (fixture.quota) {
      status = 413;
      data = { shortfallMB: 10 };
    } else
      data = body.files.map((file: any) => ({
        filename: file.fileName,
        fileType: file.fileType,
        objectKey: `key-${++fixture.serial}`,
        uploadUrl: `https://upload.invalid/${fixture.serial}`,
        expiresIn: 900,
      }));
  } else if (url.endsWith('/confirmUpload')) {
    fixture.targets.push(body.folderId);
    data = body.files.map((file: any) => {
      fixture.confirmed.add(file.objectKey);
      return { filename: file.fileName, fileId: file.objectKey, status: '已上传' };
    });
  }
  return { config, status: 200, statusText: 'OK', headers: {}, data: { status, data, msg: '' } };
};
axios.defaults.adapter = async (config) => {
  if (config.method !== 'put' || !config.url?.startsWith('https://upload.invalid/'))
    throw new Error('UNEXPECTED_FIXTURE_REQUEST');
  const file = config.data as File;
  fixture.puts.push(file.name);
  fixture.peak = Math.max(fixture.peak, ++fixture.active);
  try {
    await new Promise<void>((resolve, reject) => {
      if (config.signal?.aborted) return reject(new CanceledError());
      const abort = () => {
        clearTimeout(timer);
        reject(new CanceledError());
      };
      const timer = setTimeout(() => {
        config.signal?.removeEventListener?.('abort', abort);
        resolve();
      }, fixture.putDelay);
      config.signal?.addEventListener?.('abort', abort, { once: true });
    });
    if (fixture.fail && file.name === 'photo-3.jpg')
      throw new AxiosError('Fixture failure', 'ERR_BAD_REQUEST', config, undefined, { status: 400 } as any);
    config.onUploadProgress?.({ loaded: file.size, total: file.size } as any);
    return { config, status: 200, statusText: 'OK', data: '', headers: {} };
  } finally {
    fixture.active--;
  }
};
const panel = ref<InstanceType<typeof HandleBtnGroup>>();
const router = createRouter({
  history: createMemoryHistory(),
  routes: [
    {
      path: '/cloudSpace',
      name: 'cloudSpace',
      component: { setup: () => () => h(HandleBtnGroup, { ref: panel, showControls: params.has('controls') }) },
    },
    { path: '/other', component: { render: () => h('p', 'Other page') } },
  ],
});
await router.push('/cloudSpace');
const app = createApp({ render: () => h(RouterView) });
app
  .use(pinia)
  .use(router)
  .use(
    createI18n({
      legacy: false,
      locale: params.get('lang') === 'en' ? 'en-US' : 'zh-CN',
      messages: { 'zh-CN': zh, 'en-US': en },
    }),
  );
app.mount('#app');
Object.assign(window, {
  __cloudUploadFixture: {
    controls: fixture,
    user,
    router,
    start: (count = 60, names?: string[], folderId: string | null = 'album-a', offset = 0) =>
      panel.value!.uploadSelectedFiles(
        Array.from(
          { length: count },
          (_, i) => new File(['fixture photo'], names?.[i] || `photo-${i + offset}.jpg`, { type: 'image/jpeg' }),
        ),
        folderId,
      ),
  },
});
