import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp, h, nextTick, ref } from 'vue';
import { createI18n } from 'vue-i18n';
import zhCN from '@/i18n/locales/zh-CN';

vi.mock('@/components/base/BasicComponents/BDrawer.vue', () => ({
  default: {
    props: ['open'],
    template: '<section v-if="open"><slot /></section>',
  },
}));
vi.mock('@/components/base/BasicComponents/BButton.vue', () => ({
  default: { template: '<button><slot /></button>' },
}));
vi.mock('@/components/base/BasicComponents/BSelect.vue', () => ({
  default: {
    props: ['value', 'options'],
    emits: ['update:value', 'change'],
    template:
      '<button class="folder-select-stub" @click="$emit(\'update:value\', options[1]?.value); $emit(\'change\', options[1]?.value)">{{ value }}</button>',
  },
}));
vi.mock('@/components/base/SvgIcon/src/SvgIcon.vue', () => ({
  default: { template: '<i />' },
}));

const { default: MobileCloudUploadDrawer } = await import('./MobileCloudUploadDrawer.vue');

let cleanup: (() => void) | undefined;

afterEach(() => {
  cleanup?.();
  cleanup = undefined;
});

describe('移动端正式文件上传抽屉', () => {
  it('上一批正在检查时不打开选择器，检查结束后再按当前目标请求选择', async () => {
    const host = document.createElement('div');
    document.body.append(host);
    const checking = ref(true);
    const choose = vi.fn();
    const close = vi.fn();
    const app = createApp({
      render: () =>
        h(MobileCloudUploadDrawer, {
          open: true,
          checking: checking.value,
          onChoose: choose,
          'onUpdate:open': close,
        }),
    });
    app.use(createI18n({ legacy: false, locale: 'zh-CN', messages: { 'zh-CN': zhCN } }));
    app.mount(host);
    cleanup = () => {
      app.unmount();
      host.remove();
    };
    host.querySelector<HTMLElement>('.mobile-cloud-upload__button')!.click();
    expect(choose).not.toHaveBeenCalled();
    expect(close).not.toHaveBeenCalled();
    checking.value = false;
    await nextTick();
    host.querySelector<HTMLElement>('.mobile-cloud-upload__button')!.click();
    expect(choose).toHaveBeenCalledWith(null);
    expect(close).toHaveBeenCalledWith(false);
  });
  it('其他页面默认回传根目录并关闭抽屉', () => {
    const host = document.createElement('div');
    document.body.append(host);
    const received: Array<string | null> = [];
    const openStates: boolean[] = [];
    const app = createApp({
      render: () =>
        h(MobileCloudUploadDrawer, {
          open: true,
          onChoose: (folderId: string | null) => received.push(folderId),
          'onUpdate:open': (open: boolean) => openStates.push(open),
        }),
    });
    app.use(createI18n({ legacy: false, locale: 'zh-CN', messages: { 'zh-CN': zhCN } }));
    app.mount(host);
    cleanup = () => {
      app.unmount();
      host.remove();
    };

    host.querySelector<HTMLElement>('.mobile-cloud-upload__button')?.click();

    expect(received).toEqual([null]);
    expect(openStates).toEqual([false]);
  });

  it('支持把文件夹默认值改成用户选择的目标', () => {
    const host = document.createElement('div');
    document.body.append(host);
    const received: Array<string | null> = [];
    const folder = {
      id: 'folder-1',
      name: '项目资料',
      parentId: null,
      depth: 1,
      sort: 0,
      childCount: 0,
      directFileCount: 0,
      hasChildren: false,
      path: ['项目资料'],
      fullPath: '项目资料',
    };
    const app = createApp({
      render: () =>
        h(MobileCloudUploadDrawer, {
          open: true,
          folders: [folder],
          onChoose: (folderId: string | null) => received.push(folderId),
        }),
    });
    app.use(createI18n({ legacy: false, locale: 'zh-CN', messages: { 'zh-CN': zhCN } }));
    app.mount(host);
    cleanup = () => {
      app.unmount();
      host.remove();
    };

    host.querySelector<HTMLElement>('.folder-select-stub')?.click();
    host.querySelector<HTMLElement>('.mobile-cloud-upload__button')?.click();

    expect(received).toEqual(['folder-1']);
  });

  it('在云空间传入有效默认文件夹时直接选中该目录', () => {
    const host = document.createElement('div');
    document.body.append(host);
    const received: Array<string | null> = [];
    const folder = {
      id: 'folder-current',
      name: '当前目录',
      parentId: null,
      depth: 1,
      sort: 0,
      childCount: 0,
      directFileCount: 0,
      hasChildren: false,
      path: ['当前目录'],
      fullPath: '当前目录',
    };
    const app = createApp({
      render: () =>
        h(MobileCloudUploadDrawer, {
          open: true,
          folders: [folder],
          defaultFolderId: folder.id,
          onChoose: (folderId: string | null) => received.push(folderId),
        }),
    });
    app.use(createI18n({ legacy: false, locale: 'zh-CN', messages: { 'zh-CN': zhCN } }));
    app.mount(host);
    cleanup = () => {
      app.unmount();
      host.remove();
    };

    host.querySelector<HTMLElement>('.mobile-cloud-upload__button')?.click();

    expect(received).toEqual(['folder-current']);
  });

  it('异步刷新为同数量的新目录时仍会校准默认目标', async () => {
    const host = document.createElement('div');
    document.body.append(host);
    const createFolder = (id: string, name: string) => ({
      id,
      name,
      parentId: null,
      depth: 1,
      sort: 0,
      childCount: 0,
      directFileCount: 0,
      hasChildren: false,
      path: [name],
      fullPath: name,
    });
    const folders = ref([createFolder('folder-old', '旧目录')]);
    const defaultFolderId = ref('folder-old');
    const app = createApp({
      render: () =>
        h(MobileCloudUploadDrawer, {
          open: true,
          folders: folders.value,
          defaultFolderId: defaultFolderId.value,
        }),
    });
    app.use(createI18n({ legacy: false, locale: 'zh-CN', messages: { 'zh-CN': zhCN } }));
    app.mount(host);
    cleanup = () => {
      app.unmount();
      host.remove();
    };

    expect(host.querySelector('.folder-select-stub')?.textContent).toContain('folder-old');
    folders.value = [createFolder('folder-new', '新目录')];
    defaultFolderId.value = 'folder-new';
    await nextTick();

    expect(host.querySelector('.folder-select-stub')?.textContent).toContain('folder-new');
  });
});
