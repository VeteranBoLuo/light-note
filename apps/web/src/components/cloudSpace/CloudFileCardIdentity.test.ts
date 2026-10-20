import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp, h, nextTick, ref } from 'vue';
import { createI18n } from 'vue-i18n';
import CloudFileCardIdentity from './CloudFileCardIdentity.vue';

vi.mock('@/components/base/SvgIcon/src/SvgIcon.vue', () => ({
  default: { name: 'SvgIconStub', render: () => h('span', { class: 'svg-icon-stub' }) },
}));

const folder = { id: 'album', name: '相册', fullPath: '旅游 / 相册' };
let cleanup: (() => void) | undefined;
afterEach(() => cleanup?.());

function mountIdentity(initial: { fileName: string; folder?: typeof folder | null; disabled?: boolean }) {
  const props = ref(initial);
  const opened = vi.fn();
  const previewed = vi.fn();
  const host = document.createElement('div');
  document.body.append(host);
  const app = createApp({
    render: () =>
      h('div', { onClick: previewed }, [h(CloudFileCardIdentity, { ...props.value, onOpenFolder: opened })]),
  });
  app.use(
    createI18n({
      legacy: false,
      locale: 'zh-CN',
      messages: { 'zh-CN': { cloudSpace: { filterByFolder: '筛选文件夹“{path}”' } } },
    }),
  );
  app.mount(host);
  cleanup = () => {
    app.unmount();
    host.remove();
  };
  return { host, props, opened, previewed };
}

describe('CloudFileCardIdentity', () => {
  it('文件名与扩展名分开显示，切换文件后不残留旧扩展名', async () => {
    const name = '《新赤脚医生手册》 中国13亿人口的全民健康指导手册.PDF';
    const { host, props } = mountIdentity({ fileName: name });
    expect(host.querySelector('.file-card-name')?.textContent).toBe(name);
    expect(host.querySelector('.file-card-name__extension')?.textContent).toBe('.PDF');
    expect(host.querySelector('.file-card-name')?.getAttribute('aria-label')).toBe(name);
    for (const fileName of ['无扩展名文件', '.gitignore', '草稿.']) {
      props.value.fileName = fileName;
      await nextTick();
      expect(host.querySelector('.file-card-name')?.textContent).toBe(fileName);
      expect(host.querySelector('.file-card-name__extension')).toBeNull();
    }
    expect(host.querySelector('.file-card-folder')).toBeNull();
  });

  it('展示完整目录路径，点击只请求筛选目录而不触发卡片预览', async () => {
    const { host, props, opened, previewed } = mountIdentity({ fileName: '照片.jpg', folder });
    const button = host.querySelector<HTMLButtonElement>('.file-card-folder')!;
    expect(button.textContent).toContain('旅游 / 相册');
    expect(button.getAttribute('aria-label')).toBe('筛选文件夹“旅游 / 相册”');
    button.click();
    expect(opened).toHaveBeenCalledWith(folder);
    expect(previewed).not.toHaveBeenCalled();
    props.value.folder = null;
    await nextTick();
    expect(host.querySelector('.file-card-folder')).toBeNull();
  });

  it('批量操作或加载中不能通过路径切换目录', () => {
    const { host, opened, previewed } = mountIdentity({ fileName: '照片.jpg', folder, disabled: true });
    const button = host.querySelector<HTMLButtonElement>('.file-card-folder')!;
    expect(button.disabled).toBe(true);
    button.click();
    expect(opened).not.toHaveBeenCalled();
    expect(previewed).not.toHaveBeenCalled();
  });
});
