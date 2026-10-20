import { createApp, nextTick, reactive, ref } from 'vue';
import { createI18n } from 'vue-i18n';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import zhCN from '@/i18n/locales/zh-CN';

const actions = vi.hoisted(() => ({
  update: vi.fn(),
  read: vi.fn(),
  saveCommunity: vi.fn(),
  loadCommunity: vi.fn(),
  alert: vi.fn(),
  success: vi.fn(),
  warning: vi.fn(),
  loadGrowth: vi.fn(),
  loadTasks: vi.fn(),
}));
const mobile = ref(true);
const user = reactive({
  id: 'profile-test',
  role: 'root',
  alias: '菠萝',
  email: 'demo@example.com',
  headPicture: '',
  password: true,
  setUserInfo(value: Record<string, unknown>) {
    Object.assign(this, value);
  },
});
const bookmark = reactive({ isShowLogin: false });
const ownProfile = ref({
  bio: '原有简介',
  revision: 1,
  featuredAchievementKeys: [],
  publicPreview: { name: '菠萝', communityId: 'ln_demo', role: 'official', title: null },
});
const ownLoading = ref(false);
const ownError = ref(false);
const growth = ref({ equippedFrame: 'frame_dragon', equippedBackground: 'background_coast', level: 15, name: '文圣' });

vi.mock('@/store', () => ({ useUserStore: () => user, bookmarkStore: () => bookmark }));
vi.mock('@/api/userApi.ts', () => ({ default: { updateUserInfo: actions.update, getUserInfoById: actions.read } }));
vi.mock('@/api/commonApi.ts', () => ({ recordOperation: vi.fn() }));
vi.mock('@/composables/useMobileLayout', () => ({ useMobileLayout: () => mobile }));
vi.mock('@/composables/useGrowth.ts', () => ({
  useGrowth: () => ({ growth, shop: ref(null), load: actions.loadGrowth, loadGrowthTasks: actions.loadTasks }),
}));
vi.mock('@/composables/useCommunityChatProfile', () => ({
  useCommunityChatProfile: () => ({
    ownProfile,
    ownLoading,
    ownError,
    loadOwnProfile: actions.loadCommunity,
    saveOwnProfile: actions.saveCommunity,
  }),
}));
vi.mock('@/components/base/BasicComponents/BModal/Alert', () => ({ default: { alert: actions.alert } }));
vi.mock('@/components/base/BasicComponents/BMessage/BMessage.ts', () => ({
  default: { success: actions.success, warning: actions.warning, warn: actions.warning },
}));
vi.mock('@/config/profileBackgrounds', () => ({
  profileBackground: (id: string) => (id === 'background_coast' ? {} : null),
}));
vi.mock('@/config/avatarFrameArtwork', () => ({
  avatarFrameStableSlot: (size: number) => Math.round((size * 124) / 64),
}));
vi.mock('@/components/base/SvgIcon/src/SvgIcon.vue', () => ({ default: { template: '<span />' } }));
vi.mock('@/components/growth/ProfileBackgroundArt.vue', () => ({ default: { template: '<span />' } }));
vi.mock('@/components/growth/AvatarFramePreview.vue', () => ({
  default: { props: ['frameId'], template: '<span :data-frame="frameId" />' },
}));
vi.mock('@/components/growth/ProfileAppearanceStudio.vue', () => ({
  default: { props: ['open'], template: '<div v-if="open" role="dialog" aria-label="个人装扮" />' },
}));
vi.mock('@/components/personCenter/myInfo/PassConfigDlg.vue', () => ({
  default: { props: ['visible'], template: '<div v-if="visible" role="dialog" aria-label="密码" />' },
}));
vi.mock('@/components/personCenter/myInfo/AvatarPicker.vue', () => ({
  default: {
    props: ['open'],
    emits: ['select', 'update:open'],
    template:
      '<div v-if="open" role="dialog" aria-label="头像"><button @click="$emit(\'select\', \'new-avatar\'); $emit(\'update:open\', false)">选择测试头像</button></div>',
  },
}));

const { default: ProfileEditorForm } = await import('./ProfileEditorForm.vue');
let cleanup: (() => void) | undefined;
const flush = async () => {
  await nextTick();
  await new Promise((resolve) => setTimeout(resolve, 0));
};

beforeEach(() => {
  vi.clearAllMocks();
  mobile.value = true;
  Object.assign(user, {
    id: 'profile-test',
    role: 'root',
    alias: '菠萝',
    email: 'demo@example.com',
    headPicture: '',
    password: true,
  });
  bookmark.isShowLogin = false;
  ownLoading.value = false;
  ownError.value = false;
  ownProfile.value = {
    bio: '原有简介',
    revision: 1,
    featuredAchievementKeys: [],
    publicPreview: { name: '菠萝', communityId: 'ln_demo', role: 'official', title: null },
  };
  growth.value = { equippedFrame: 'frame_dragon', equippedBackground: 'background_coast', level: 15, name: '文圣' };
  actions.loadCommunity.mockImplementation(async () => ownProfile.value);
  actions.update.mockResolvedValue({ status: 200 });
  actions.read.mockImplementation(async () => ({ data: { alias: user.alias, email: user.email } }));
  actions.saveCommunity.mockImplementation(async (input) => {
    ownProfile.value = { ...ownProfile.value, bio: input.bio };
    return ownProfile.value;
  });
});
afterEach(() => {
  cleanup?.();
  cleanup = undefined;
});

function mount() {
  const host = document.createElement('div');
  document.body.append(host);
  const onClose = vi.fn(),
    onSaved = vi.fn();
  const app = createApp(ProfileEditorForm, { onClose, onSaved });
  app.use(createI18n({ legacy: false, locale: 'zh-CN', messages: { 'zh-CN': zhCN } }));
  app.directive('click-log', {});
  const instance = app.mount(host) as unknown as { requestClose: () => void };
  cleanup = () => {
    app.unmount();
    host.remove();
  };
  const button = (label: string) =>
    Array.from(host.querySelectorAll<HTMLButtonElement>('button')).find((el) => el.textContent?.trim() === label)!;
  return { host, instance, button, onClose, onSaved };
}
function input(element: HTMLInputElement | HTMLTextAreaElement, value: string) {
  element.value = value;
  element.dispatchEvent(new Event('input', { bubbles: true }));
}

describe('profile editor layout and existing flows', () => {
  it('移动保存栏跟随未保存修改，并在保存期间禁用编辑与装扮动作', async () => {
    const { host, button, onClose, onSaved } = mount();
    await flush();
    expect(host.querySelectorAll('[role="toolbar"]')).toHaveLength(1);
    expect(button('保存修改').disabled).toBe(true);
    input(host.querySelector('input')!, '新的昵称');
    await nextTick();
    expect(host.querySelector('.profile-editor-identity strong')?.textContent).toBe('新的昵称');
    expect(button('保存修改').disabled).toBe(false);
    let finish!: (value: unknown) => void;
    actions.update.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    actions.read.mockResolvedValueOnce({ data: { alias: '新的昵称', email: user.email } });
    button('保存修改').click();
    await nextTick();
    expect(button('保存修改').getAttribute('aria-busy')).toBe('true');
    expect(button('个人装扮').disabled).toBe(true);
    expect(host.querySelector<HTMLInputElement>('input')!.disabled).toBe(true);
    finish({ status: 200 });
    await flush();
    expect(actions.update).toHaveBeenCalledWith({ id: user.id, alias: '新的昵称', email: user.email });
    expect(actions.saveCommunity).not.toHaveBeenCalled();
    expect(onSaved).toHaveBeenCalledOnce();
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('社区保存失败保留输入和重试入口，成功后才关闭', async () => {
    const { host, button, onClose } = mount();
    await flush();
    input(host.querySelector('textarea')!, '新的社区简介');
    await nextTick();
    actions.saveCommunity.mockResolvedValueOnce(null);
    button('保存修改').click();
    await flush();
    expect(host.querySelector('textarea')!.value).toBe('新的社区简介');
    expect(button('保存修改').disabled).toBe(false);
    expect(onClose).not.toHaveBeenCalled();
    expect(actions.update).not.toHaveBeenCalled();
    button('保存修改').click();
    await flush();
    expect(actions.saveCommunity).toHaveBeenLastCalledWith(
      expect.objectContaining({ bio: '新的社区简介', baseRevision: 1 }),
    );
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('头像、装扮和密码入口继续可用，未保存头像离开时仍需确认', async () => {
    const { host, button, instance, onClose } = mount();
    await flush();
    button('个人装扮').click();
    button('修改密码').click();
    button('更换头像').click();
    await nextTick();
    expect(host.querySelector('[aria-label="个人装扮"]')).not.toBeNull();
    expect(host.querySelector('[aria-label="密码"]')).not.toBeNull();
    button('选择测试头像').click();
    await nextTick();
    expect(actions.update).not.toHaveBeenCalled();
    instance.requestClose();
    expect(actions.alert).toHaveBeenCalledWith(
      expect.objectContaining({ onOk: expect.any(Function), onCancel: expect.any(Function) }),
    );
    expect(onClose).not.toHaveBeenCalled();
    actions.alert.mock.calls[0][0].onOk();
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('桌面使用普通提交区，游客仅提供登录入口', async () => {
    mobile.value = false;
    const { host, button } = mount();
    await flush();
    expect(host.querySelector('[role="toolbar"]')).toBeNull();
    expect(button('保存')).toBeDefined();
    user.role = 'visitor';
    user.id = '';
    await nextTick();
    expect(host.querySelector('.profile-save-footer')).toBeNull();
    expect(host.querySelector<HTMLInputElement>('input')!.disabled).toBe(true);
    button('登录 / 注册').click();
    expect(bookmark.isShowLogin).toBe(true);
  });

  it('等级和社区身份使用正文展示，装扮信息缺失时仍可编辑', async () => {
    growth.value.equippedFrame = 'unknown-frame';
    growth.value.equippedBackground = 'unknown-background';
    const { host, button } = mount();
    await flush();
    const identity = host.querySelector('.profile-editor-identity')!;
    expect(identity.textContent).toContain('Lv.15 文圣');
    expect(identity.textContent).toContain('轻笺团队');
    expect(identity.textContent).not.toContain('传说头像框');
    expect(identity.querySelector('[data-frame]')).toBeNull();
    expect(identity.querySelector('.profile-editor-identity__cover')).toBeNull();
    expect(button('更换头像').disabled).toBe(false);
  });

  it('社区读取中显示共享加载提示，资料到达后恢复简介输入', async () => {
    ownLoading.value = true;
    const { host, button } = mount();
    await flush();
    const status = host.querySelector<HTMLElement>('[role="status"]')!;
    expect(status).not.toBeNull();
    expect(status.style.display).not.toBe('none');
    expect(status.textContent?.trim()).not.toBe('');
    input(host.querySelector('input')!, '加载时修改的昵称');
    await nextTick();
    expect(button('保存修改').disabled).toBe(true);
    ownLoading.value = false;
    await nextTick();
    expect(host.querySelector('textarea')!.value).toBe('原有简介');
    expect(button('保存修改').disabled).toBe(false);
  });
});
