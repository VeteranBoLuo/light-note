/** Only in-memory fixtures: never contacts a business API or object storage. */
import { createApp, h, ref } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import { createRouter, createMemoryHistory, RouterView } from 'vue-router';
import i18n, { setLocale } from '@/i18n';
import axios, { AxiosError, CanceledError } from 'axios';
import request from '@/http/request';
import { bookmarkStore, cloudSpaceStore, useUserStore } from '@/store';
import { applyUiDensity } from '@/composables/useUiDensity';
import zh from '@/i18n/locales/zh-CN';
import en from '@/i18n/locales/en-US';
import HandleBtnGroup from '@/components/cloudSpace/HandleBtnGroup.vue';
import GlobalCloudUploadQueue from '@/components/cloudSpace/GlobalCloudUploadQueue.vue';
import useCloudUpload from '@/store/cloudUpload';
import globalDirect from '@/config/globalDirect';
import { CLOUD_UPLOAD_PART_BYTES } from '@lightnote/shared/cloud-upload';
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
  multipartMergeDelay: 0,
  multipartFailure: 0,
  multipartInit: 0,
  targets: [] as Array<string | null>,
};
const multipart = new Map<string, any>();
const nativeUploadAdapter = axios.getAdapter(axios.defaults.adapter);
const cloud = cloudSpaceStore();
cloud.maxSpace = 100000;
cloud.usedSpace = 0;
cloud.getUsedSpace = async () => true;
cloud.queryFolder = async () => true;
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
  if (url.endsWith('/initMultipartUpload')) {
    fixture.multipartInit++;
    const sessionId = body.requestId;
    if (!multipart.has(sessionId))
      multipart.set(sessionId, {
        sessionId,
        objectKey: 'multipart-' + sessionId,
        filename: body.fileName,
        fileType: body.fileType,
        fileSize: body.fileSize,
        partSize: CLOUD_UPLOAD_PART_BYTES,
        partCount: Math.ceil(body.fileSize / CLOUD_UPLOAD_PART_BYTES),
        state: 'uploading',
        uploaded: new Map(),
      });
    data = multipart.get(sessionId);
  } else if (url.endsWith('/signMultipartParts')) {
    data = body.partNumbers.map((partNumber: number) => ({
      partNumber,
      uploadUrl: `${params.get('multipartOrigin') || 'https://upload.invalid'}/multipart/${body.sessionId}/${partNumber}`,
      headers: { 'Content-Type': 'application/octet-stream' },
      expiresIn: 900,
    }));
  } else if (url.endsWith('/multipartUploadStatus')) {
    const s = multipart.get(body.sessionId);
    data = { ...s, parts: [...s.uploaded].map(([partNumber, size]) => ({ partNumber, size, etag: 'fixture' })) };
  } else if (url.endsWith('/completeMultipartUpload')) {
    if (fixture.multipartMergeDelay) await new Promise((r) => setTimeout(r, fixture.multipartMergeDelay));
    data = multipart.get(body.sessionId);
    data.state = 'ready';
  } else if (url.endsWith('/abortMultipartUpload')) {
    const s = multipart.get(body.sessionId);
    if (s) s.state = 'aborted';
    data = { cancelled: true };
  } else if (url.endsWith('/checkFileNames')) {
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
  const part = /\/multipart\/([^/]+)\/(\d+)/.exec(config.url || '');
  if (config.method !== 'put' || (!part && !config.url?.startsWith('https://upload.invalid/')))
    throw new Error('UNEXPECTED_FIXTURE_REQUEST');
  const file = config.data as File;
  fixture.puts.push(part ? 'part-' + part[2] : file.name);
  fixture.peak = Math.max(fixture.peak, ++fixture.active);
  try {
    if (part && params.has('multipartNetwork')) {
      const response = await nativeUploadAdapter(config);
      multipart.get(part[1]).uploaded.set(Number(part[2]), file.size);
      return response;
    }
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
    if (part && Number(part[2]) === fixture.multipartFailure)
      throw new AxiosError('Fixture part failure', 'ERR_BAD_REQUEST', config, undefined, { status: 400 } as any);
    if (part) multipart.get(part[1]).uploaded.set(Number(part[2]), file.size);
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
const upload = useCloudUpload();
i18n.global.setLocaleMessage('zh-CN', zh);
i18n.global.setLocaleMessage('en-US', en);
await setLocale(params.get('lang') === 'en' ? 'en-US' : 'zh-CN');
const mobileCreateAction = ref<'file' | null>(null);
const MobileCreateLayer = params.has('mobileCreate')
  ? (await import('@/components/mobile/MobileFormalCreateLayer.vue')).default
  : null;
const app = createApp({
  render: () => [
    h(GlobalCloudUploadQueue),
    h(RouterView),
    ...(MobileCreateLayer
      ? [
          h(MobileCreateLayer, {
            action: mobileCreateAction.value,
            'onUpdate:action': (value: any) => {
              mobileCreateAction.value = value;
            },
          }),
        ]
      : []),
  ],
});
app.use(pinia).use(router).use(i18n);
globalDirect(app);
app.mount('#app');
Object.assign(window, {
  __cloudUploadFixture: {
    controls: fixture,
    cloud,
    user,
    router,
    upload,
    openMobileCreate: () => {
      mobileCreateAction.value = 'file';
    },
    start: (count = 60, names?: string[], folderId: string | null = 'album-a', offset = 0) =>
      upload.enqueue(
        Array.from(
          { length: count },
          (_, i) => new File(['fixture photo'], names?.[i] || `photo-${i + offset}.jpg`, { type: 'image/jpeg' }),
        ),
        folderId,
      ),
  },
});
