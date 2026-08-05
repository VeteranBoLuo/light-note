import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp, h, nextTick, ref } from 'vue';
import { createI18n } from 'vue-i18n';
import { createPinia } from 'pinia';
import zhCN from '@/i18n/locales/zh-CN';

/**
 * 覆盖「标签库里就地新建标签」接入笔记标签配置后的四条分支。
 * 笔记侧最多绑 3 个标签，这个上限与「新建成功」的交叉是最容易出错的地方：
 * 标签确实建好了，不能让用户以为创建失败，也不该弹出两条互相矛盾的提示。
 */
const apiBasePost = vi.fn();
const apiQueryPost = vi.fn();
const success = vi.fn();
const warning = vi.fn();
const info = vi.fn();

vi.mock('@/http/request.ts', () => ({ apiBasePost, apiQueryPost }));
vi.mock('@/http/request', () => ({ apiBasePost, apiQueryPost }));
vi.mock('@/api/commonApi.ts', () => ({ recordOperation: vi.fn() }));
vi.mock('@/composables/useGuestGuard', () => ({ blockGuestWrite: vi.fn(() => false) }));
vi.mock('@/components/base/BasicComponents/BMessage/BMessage.ts', () => ({
  default: { success, warning, info, error: vi.fn() },
}));
vi.mock('@/components/base/BasicComponents/BMessage/BMessage', () => ({
  default: { success, warning, info, error: vi.fn() },
}));
vi.mock('vue-router', () => ({ useRouter: () => ({ resolve: () => ({ href: '/manage/editTag/add' }) }) }));
vi.mock('@/store', () => ({
  bookmarkStore: () => ({ isMobile: false }),
  useUserStore: () => ({ id: 'user-1', role: 'user' }),
}));
// 弹框外壳与图标不参与本测试的行为，替换成透传容器让内容直接渲染
vi.mock('@/components/base/BasicComponents/BModal/BModal.vue', () => ({
  default: { name: 'BModalStub', template: '<div class="modal-stub"><slot /></div>' },
}));
vi.mock('@/components/base/SvgIcon/src/SvgIcon.vue', () => ({
  default: { name: 'SvgIconStub', template: '<i />' },
}));

const { default: NoteTagConfig } = await import('./NoteTagConfig.vue');

let cleanup: (() => void) | undefined;

/** 标签库里已有的共享标签 */
const LIBRARY = [
  { id: 'tag-1', name: 'SSL' },
  { id: 'tag-2', name: '证书' },
  { id: 'tag-3', name: '椅子' },
];

function mount(noteTagIds: string[] = []) {
  apiQueryPost.mockResolvedValue({ status: 200, data: LIBRARY });
  apiBasePost.mockImplementation((url: string) => {
    if (url === '/api/note/getNoteTags') {
      return Promise.resolve({ status: 200, data: LIBRARY.filter((t) => noteTagIds.includes(t.id)) });
    }
    return Promise.resolve({ status: 200, data: { id: 'tag-new' } });
  });

  const host = document.createElement('div');
  document.body.append(host);
  const visible = ref(true);
  const app = createApp({
    setup() {
      return () =>
        h(NoteTagConfig, {
          note: { id: 'note-1', title: '示例笔记' },
          visible: visible.value,
          'onUpdate:visible': (value: boolean) => (visible.value = value),
        });
    },
  });
  app.use(createPinia());
  app.use(createI18n({ legacy: false, locale: 'zh-CN', messages: { 'zh-CN': zhCN } }));
  app.directive('click-log', {});
  app.mount(host);
  cleanup = () => {
    app.unmount();
    host.remove();
  };
  return host;
}

/** 等两次接口 + 渲染稳定 */
async function settle() {
  for (let i = 0; i < 6; i += 1) await nextTick();
}

/** 走一遍「点新建 → 输名字 → 确定」 */
async function createTag(host: HTMLElement, name: string) {
  host.querySelector<HTMLElement>('.inline-tag-create__entry')!.click();
  await nextTick();
  const input = host.querySelector<HTMLInputElement>('.inline-tag-create__input input')!;
  input.value = name;
  input.dispatchEvent(new Event('input'));
  await nextTick();
  host.querySelector<HTMLButtonElement>('.inline-tag-create__submit')!.click();
  await settle();
}

function selectedCount(host: HTMLElement) {
  return Number(host.querySelector('.overview-count')?.textContent?.trim() || '0');
}


/** 点某个标签行的「改名」并提交新名字 */
async function renameTag(host: HTMLElement, index: number, next: string) {
  const rows = host.querySelectorAll<HTMLElement>('.tag-row');
  rows[index].querySelector<HTMLButtonElement>('.tag-meta button')!.click();
  await nextTick();
  const input = host.querySelector<HTMLInputElement>('.inline-tag-rename__input input')!;
  input.value = next;
  input.dispatchEvent(new Event('input'));
  await nextTick();
  host.querySelector<HTMLButtonElement>('.inline-tag-rename__submit')!.click();
  await settle();
}

function libraryNames(host: HTMLElement) {
  return [...host.querySelectorAll('.tag-row .tag-name')].map((el) => el.textContent?.trim());
}

function selectedNames(host: HTMLElement) {
  return [...host.querySelectorAll('.chip-text')].map((el) => el.textContent?.trim());
}

describe('NoteTagConfig 就地新建标签', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup?.();
    cleanup = undefined;
  });

  it('入口是内联创建，不再是跳转到标签编辑页的按钮', async () => {
    const host = mount();
    await settle();

    expect(host.querySelector('.inline-tag-create__entry')).not.toBeNull();
  });

  it('新建成功后刷新标签库并绑定到当前笔记', async () => {
    const host = mount();
    await settle();
    expect(selectedCount(host)).toBe(0);

    // 刷新后的标签库要包含新标签，否则只能退回最小对象
    apiQueryPost.mockResolvedValue({ status: 200, data: [...LIBRARY, { id: 'tag-new', name: '密码学' }] });
    await createTag(host, '密码学');

    expect(apiBasePost).toHaveBeenCalledWith('/api/bookmark/addTag', { name: '密码学' });
    expect(selectedCount(host)).toBe(1);
    expect(success).toHaveBeenCalledOnce();
  });

  /**
   * 已绑满 3 个时：标签仍然要建出来，但不能再绑。
   * 只给一条「已创建」的提示 —— 不走 bindTag，避免再弹一条上限警告，
   * 也不能反过来让用户以为创建失败。
   */
  it('笔记已绑满 3 个标签时只提示已创建，不绑定也不重复警告', async () => {
    const host = mount(['tag-1', 'tag-2', 'tag-3']);
    await settle();
    expect(selectedCount(host)).toBe(3);

    apiQueryPost.mockResolvedValue({ status: 200, data: [...LIBRARY, { id: 'tag-new', name: '密码学' }] });
    await createTag(host, '密码学');

    // 标签建出来了
    expect(apiBasePost).toHaveBeenCalledWith('/api/bookmark/addTag', { name: '密码学' });
    // 但没有绑上，也没有把 4 个塞进已选区
    expect(selectedCount(host)).toBe(3);
    expect(warning).toHaveBeenCalledOnce();
    expect(success).not.toHaveBeenCalled();
  });

  it('输入已存在的标签名时直接复用绑定，不发创建请求', async () => {
    const host = mount();
    await settle();
    apiBasePost.mockClear();

    await createTag(host, '证书');

    expect(apiBasePost).not.toHaveBeenCalledWith('/api/bookmark/addTag', expect.anything());
    expect(selectedCount(host)).toBe(1);
    expect(info).toHaveBeenCalledOnce();
  });

  it('复用的标签已经绑过时只提示，不重复添加', async () => {
    const host = mount(['tag-2']);
    await settle();
    expect(selectedCount(host)).toBe(1);

    await createTag(host, '证书');

    expect(selectedCount(host)).toBe(1);
    expect(info).toHaveBeenCalledOnce();
  });

  it('弹框内不再有跳出去的入口：刷新与标签管理都已移除', async () => {
    const host = mount();
    await settle();

    const libraryButtons = [...host.querySelectorAll('.library-panel .panel-header button')].map((b) =>
      b.textContent?.trim(),
    );
    expect(libraryButtons).not.toContain('刷新');
    expect(libraryButtons).not.toContain('标签管理');
  });

  /**
   * 改名要就地同步到标签库与已选区。已选区是本地待保存状态，
   * 不能靠重拉列表刷新 —— 那会把用户还没点确定的绑定改动冲掉。
   */
  it('改名后标签库与已选区的名字同步更新，且不重拉列表', async () => {
    const host = mount(['tag-1']);
    await settle();
    expect(selectedNames(host)).toEqual(['SSL']);
    apiQueryPost.mockClear();

    await renameTag(host, 0, 'SSL 证书');

    expect(apiBasePost).toHaveBeenCalledWith('/api/bookmark/updateTag', { id: 'tag-1', name: 'SSL 证书' });
    expect(libraryNames(host)[0]).toBe('SSL 证书');
    expect(selectedNames(host)).toEqual(['SSL 证书']);
    // 没有重新拉取标签库
    expect(apiQueryPost).not.toHaveBeenCalled();
  });

  it('改名态下点击该行不会误切换绑定', async () => {
    const host = mount();
    await settle();
    expect(selectedCount(host)).toBe(0);

    const rows = host.querySelectorAll<HTMLElement>('.tag-row');
    rows[0].querySelector<HTMLButtonElement>('.tag-meta button')!.click();
    await nextTick();

    // 点编辑态所在的行（输入行内部与行本身）都不应触发绑定
    host.querySelector<HTMLElement>('.inline-tag-rename')!.click();
    rows[0].click();
    await nextTick();

    expect(selectedCount(host)).toBe(0);
  });
});
