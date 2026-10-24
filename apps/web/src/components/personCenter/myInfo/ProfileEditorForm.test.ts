import { createApp, nextTick, reactive, ref } from 'vue';
import { createI18n } from 'vue-i18n';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import zhCN from '@/i18n/locales/zh-CN';

const actions = vi.hoisted(() => ({
  account: vi.fn(),
  update: vi.fn(),
  read: vi.fn(),
  saveCommunity: vi.fn(),
  loadCommunity: vi.fn(),
  closeProfile: vi.fn(),
  alert: vi.fn(),
  success: vi.fn(),
  warning: vi.fn(),
  loadGrowth: vi.fn(),
  loadTasks: vi.fn(),
}));
const mobile = ref(true);
const user = reactive({
  adminContext: null as null | { targetUserId: string },
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

vi.mock('@/http/request', () => ({ apiBaseGet: actions.account }));
vi.mock('@/components/settings/AccountEmailDialog.vue', () => ({
  default: {
    props: ['visible'],
    emits: ['update:visible'],
    template:
      '<div v-if="visible" role="dialog" aria-label="更换邮箱"><button @click="$emit(\'update:visible\', false)">取消更换</button></div>',
  },
}));
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
    closeProfile: actions.closeProfile,
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
  default: {
    props: ['open'],
    emits: ['avatar-saved'],
    setup() {
      return {
        applyAvatar: () => {
          user.headPicture = 'new-avatar';
        },
      };
    },
    template:
      '<div v-if="open" role="dialog" aria-label="个人装扮"><button @click="applyAvatar(); $emit(\'avatar-saved\')">使用测试头像</button></div>',
  },
}));
vi.mock('@/components/personCenter/myInfo/PassConfigDlg.vue', () => ({
  default: { props: ['visible'], template: '<div v-if="visible" role="dialog" aria-label="密码" />' },
}));

const { default: ProfileEditorForm } = await import('./ProfileEditorForm.vue');
let cleanup: (() => void) | undefined;
const flush = async () => {
  await nextTick();
  await new Promise((resolve) => setTimeout(resolve, 0));
};

beforeEach(() => {
  vi.clearAllMocks();
  user.adminContext = null;
  actions.account.mockImplementation(async () => ({ status: 200, data: { id: user.id, hasPassword: true } }));
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
  actions.read.mockImplementation(async () => ({
    status: 200,
    data: { id: user.id, alias: user.alias, email: user.email },
  }));
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
    actions.read.mockResolvedValueOnce({ status: 200, data: { id: user.id, alias: '新的昵称', email: user.email } });
    button('保存修改').click();
    await nextTick();
    expect(button('保存修改').getAttribute('aria-busy')).toBe('true');
    expect(button('个人装扮').disabled).toBe(true);
    expect(host.querySelector<HTMLInputElement>('input')!.disabled).toBe(true);
    finish({ status: 200 });
    await flush();
    expect(actions.update).toHaveBeenCalledWith({ id: user.id, alias: '新的昵称' });
    expect(host.querySelector('.profile-account-fields')?.textContent).toContain(user.email);
    expect(host.querySelector('.profile-account-fields input')).toBeNull();
    expect(actions.saveCommunity).not.toHaveBeenCalled();
    expect(onSaved).toHaveBeenCalledOnce();
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('更换邮箱使用独立弹框，取消后保留昵称与简介草稿，普通资料保存不提交邮箱', async () => {
    const { host, button } = mount();
    await flush();
    input(host.querySelector('input')!, '昵称草稿');
    input(host.querySelector('textarea')!, '简介草稿');
    await nextTick();
    button('更换邮箱').click();
    await nextTick();
    expect(host.querySelector('[aria-label="更换邮箱"]')).not.toBeNull();
    button('取消更换').click();
    await nextTick();
    expect(host.querySelector<HTMLInputElement>('input')!.value).toBe('昵称草稿');
    expect(host.querySelector<HTMLTextAreaElement>('textarea')!.value).toBe('简介草稿');
    expect(actions.update).not.toHaveBeenCalled();
    button('保存修改').click();
    await flush();
    expect(actions.update).toHaveBeenCalledWith({ id: user.id, alias: '昵称草稿' });
  });
  it.each(['update', 'read'] as const)('保存的 %s 阶段切号后不回写身份，也不继续提交旧简介', async (stage) => {
    const { host, button, onSaved } = mount();
    await flush();
    input(host.querySelector('input')!, '旧账号昵称');
    input(host.querySelector('textarea')!, '旧账号简介');
    await nextTick();
    let finish!: (value: unknown) => void;
    actions[stage].mockImplementationOnce(() => new Promise((resolve) => (finish = resolve)));
    button('保存修改').click();
    await flush();
    Object.assign(user, { id: 'new-owner', alias: '新账号', email: 'new-owner@example.com' });
    finish({ status: 200, data: { id: 'profile-test', alias: '旧账号昵称', email: 'demo@example.com' } });
    await flush();
    expect(user.id).toBe('new-owner');
    expect(user.alias).toBe('新账号');
    expect(actions.saveCommunity).not.toHaveBeenCalled();
    expect(onSaved).not.toHaveBeenCalled();
    expect(actions.success).not.toHaveBeenCalled();
    if (stage === 'update') expect(actions.read).not.toHaveBeenCalled();
  });
  it.each([
    { status: 500, data: null },
    { status: 200, data: { id: 'other-owner', alias: '别人的昵称' } },
  ])('保存后刷新返回异常时保留草稿，不覆盖登录身份', async (response) => {
    const { host, button, onSaved } = mount();
    await flush();
    input(host.querySelector('input')!, '保留的昵称');
    await nextTick();
    actions.read.mockResolvedValueOnce(response);
    button('保存修改').click();
    await flush();
    expect(user.id).toBe('profile-test');
    expect(host.querySelector<HTMLInputElement>('input')!.value).toBe('保留的昵称');
    expect(actions.warning).toHaveBeenCalled();
    expect(onSaved).not.toHaveBeenCalled();
    expect(button('保存修改').disabled).toBe(false);
  });
  it('卸载后忽略迟到的保存响应', async () => {
    const { host, button, onSaved } = mount();
    await flush();
    input(host.querySelector('input')!, '已离开页面的昵称');
    await nextTick();
    let finish!: (value: unknown) => void;
    actions.update.mockImplementationOnce(() => new Promise((resolve) => (finish = resolve)));
    button('保存修改').click();
    await nextTick();
    cleanup?.();
    cleanup = undefined;
    finish({ status: 200 });
    await flush();
    expect(actions.read).not.toHaveBeenCalled();
    expect(onSaved).not.toHaveBeenCalled();
  });
  it('管理员代看不能更换邮箱，身份切换会关闭已打开的安全弹框', async () => {
    const { host, button } = mount();
    await flush();
    button('更换邮箱').click();
    await nextTick();
    user.adminContext = { targetUserId: 'someone' };
    await flush();
    expect(button('更换邮箱').disabled).toBe(true);
    expect(host.querySelector('[aria-label="更换邮箱"]')).toBeNull();
  });
  it('密码状态以服务端事实为准，未知时仍提供专用验证入口', async () => {
    actions.account.mockResolvedValueOnce({ status: 200, data: { id: user.id, hasPassword: null } });
    const { button } = mount();
    await flush();
    expect(button('设置或修改密码')).toBeDefined();
    expect(button('修改密码')).toBeUndefined();
  });

  it('未设置密码时提供设置入口，取消资料编辑保留未保存确认', async () => {
    actions.account.mockResolvedValueOnce({ status: 200, data: { id: user.id, hasPassword: false } });
    const { host, button, onClose } = mount();
    await flush();
    expect(button('设置密码')).toBeDefined();
    input(host.querySelector('input')!, '草稿');
    await nextTick();
    button('取消').click();
    expect(actions.alert).toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });
  it('旧账号的密码状态响应不会覆盖新身份', async () => {
    let resolve!: (value: unknown) => void;
    actions.account.mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    const { button, onClose } = mount();
    await nextTick();
    user.id = 'new-owner';
    await flush();
    resolve({ status: 200, data: { id: 'profile-test', hasPassword: false } });
    await flush();
    expect(button('修改密码')).toBeDefined();
    expect(button('设置密码')).toBeUndefined();
    expect(onClose).toHaveBeenCalled();
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

  it('头像在装扮内生效，昵称和简介草稿继续保留并在离开时确认', async () => {
    const { host, button, instance, onClose } = mount();
    await flush();
    button('个人装扮').click();
    button('修改密码').click();
    input(host.querySelector('input')!, '未保存的昵称');
    input(host.querySelector('textarea')!, '未保存的简介');
    await nextTick();
    expect(host.querySelector('[aria-label="个人装扮"]')).not.toBeNull();
    expect(host.querySelector('[aria-label="密码"]')).not.toBeNull();
    button('使用测试头像').click();
    await nextTick();
    expect(actions.update).not.toHaveBeenCalled();
    expect(actions.saveCommunity).not.toHaveBeenCalled();
    expect(host.querySelector<HTMLInputElement>('input')!.value).toBe('未保存的昵称');
    expect(host.querySelector<HTMLTextAreaElement>('textarea')!.value).toBe('未保存的简介');
    expect(user.headPicture).toBe('new-avatar');
    instance.requestClose();
    expect(actions.alert).toHaveBeenCalledWith(
      expect.objectContaining({ onOk: expect.any(Function), onCancel: expect.any(Function) }),
    );
    expect(onClose).not.toHaveBeenCalled();
    actions.alert.mock.calls[0][0].onOk();
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('仅独立更新头像不会让资料表单出现未保存状态', async () => {
    const { host, button, instance, onClose } = mount();
    await flush();
    host.querySelector<HTMLButtonElement>('[aria-label="选择头像"]')!.click();
    await nextTick();
    expect(host.querySelector('[aria-label="个人装扮"]')).not.toBeNull();
    button('使用测试头像').click();
    await nextTick();
    expect(button('保存修改').disabled).toBe(true);
    instance.requestClose();
    expect(actions.alert).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('桌面使用普通提交区，游客仅提供登录入口', async () => {
    mobile.value = false;
    const { host, button } = mount();
    await flush();
    expect(host.querySelector('[role="toolbar"]')).toBeNull();
    expect(button('保存修改')).toBeDefined();
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
    expect(identity.classList.contains('is-decorated')).toBe(false);
    expect(host.querySelector<HTMLButtonElement>('[aria-label="选择头像"]')!.disabled).toBe(false);
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
