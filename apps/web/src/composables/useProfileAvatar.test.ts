import { createApp, nextTick, reactive, ref } from 'vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const actions = vi.hoisted(() => ({ render: vi.fn(), compress: vi.fn(), update: vi.fn() }));
const user = reactive({
  id: 'avatar-user',
  role: 'user',
  headPicture: 'old-avatar',
  alias: '原昵称',
  email: 'old@example.com',
  adminContext: null as null | { subjectUserId: string },
});
vi.mock('@/store', () => ({ useUserStore: () => user }));
vi.mock('@/api/userApi', () => ({ default: { updateUserInfo: actions.update } }));
vi.mock('@/config/builtinAvatars', () => ({ renderBuiltinAvatar: actions.render }));
vi.mock('@/utils/compressAvatar', () => ({ compressAvatarFile: actions.compress }));
const { useProfileAvatar } = await import('./useProfileAvatar');
let cleanup: () => void;
const deferred = <T>() => {
  let resolve!: (value: T) => void;
  let reject!: (value: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
};
function mount() {
  const open = ref(true);
  let avatar!: ReturnType<typeof useProfileAvatar>;
  const host = document.createElement('div');
  const app = createApp({
    setup() {
      avatar = useProfileAvatar(open);
      return () => null;
    },
  });
  app.mount(host);
  cleanup = () => app.unmount();
  return { avatar, open };
}
beforeEach(() => {
  vi.clearAllMocks();
  Object.assign(user, {
    id: 'avatar-user',
    role: 'user',
    headPicture: 'old-avatar',
    alias: '原昵称',
    email: 'old@example.com',
    adminContext: null,
  });
  actions.render.mockResolvedValue('builtin-avatar');
  actions.compress.mockResolvedValue('compressed-avatar');
  actions.update.mockResolvedValue({ status: 200 });
});
afterEach(() => cleanup?.());

describe('independent profile avatar editing', () => {
  it('only writes the avatar and preserves all other account state', async () => {
    const { avatar } = mount();
    await avatar.selectBuiltin('mountain-fox');
    expect(user.headPicture).toBe('old-avatar');
    expect(await avatar.save()).toBe(true);
    expect(actions.update).toHaveBeenCalledWith({ id: 'avatar-user', headPicture: 'builtin-avatar' }, { silent: true });
    expect(user).toMatchObject({
      headPicture: 'builtin-avatar',
      alias: '原昵称',
      email: 'old@example.com',
      id: 'avatar-user',
    });
    expect(avatar.changed.value).toBe(false);
  });
  it('keeps the selected avatar for retry and prevents duplicate saves', async () => {
    const { avatar } = mount();
    await avatar.selectBuiltin('mountain-fox');
    const pending = deferred<{ status: number }>();
    actions.update.mockReturnValueOnce(pending.promise);
    const save = avatar.save();
    expect(await avatar.save()).toBe(false);
    pending.resolve({ status: 500 });
    expect(await save).toBe(false);
    expect(avatar.error.value).toBe('save');
    expect(avatar.source.value).toBe('builtin-avatar');
    expect(user.headPicture).toBe('old-avatar');
    expect(await avatar.save()).toBe(true);
    expect(actions.update).toHaveBeenCalledTimes(2);
  });
  it('ignores old builtin generation after another selection or restoring the default', async () => {
    const { avatar } = mount();
    const pending = deferred<string>();
    actions.render.mockReturnValueOnce(pending.promise);
    const first = avatar.selectBuiltin('mountain-fox');
    await avatar.selectBuiltin('moon-reader');
    pending.resolve('stale-avatar');
    await first;
    expect(avatar.selectedId.value).toBe('moon-reader');
    expect(avatar.source.value).toBe('builtin-avatar');
    const upload = deferred<string>();
    actions.compress.mockReturnValueOnce(upload.promise);
    const work = avatar.upload(new File(['x'], 'avatar.png', { type: 'image/png' }));
    avatar.selectDefault();
    upload.resolve('stale-upload');
    await work;
    expect(avatar.source.value).toBe('');
    expect(avatar.preparing.value).toBe(false);
    expect(await avatar.save()).toBe(true);
    expect(user.headPicture).toBe('');
  });
  it('drops unfinished image work when closed and reopened', async () => {
    const { avatar, open } = mount();
    const pending = deferred<string>();
    actions.render.mockReturnValueOnce(pending.promise);
    const work = avatar.selectBuiltin('mountain-fox');
    open.value = false;
    open.value = true;
    pending.resolve('stale-avatar');
    await work;
    expect(avatar.source.value).toBe('old-avatar');
    expect(avatar.changed.value).toBe(false);
    expect(avatar.selectedId.value).toBeNull();
  });
  it('does not apply a late save response to another account', async () => {
    const { avatar } = mount();
    await avatar.selectBuiltin('mountain-fox');
    const pending = deferred<{ status: number }>();
    actions.update.mockReturnValueOnce(pending.promise);
    const save = avatar.save();
    Object.assign(user, { id: 'other-user', headPicture: 'other-avatar' });
    pending.resolve({ status: 200 });
    expect(await save).toBe(false);
    expect(user.headPicture).toBe('other-avatar');
    expect(avatar.source.value).toBe('other-avatar');
  });
  it('blocks use after image preparation fails, and keeps avatars read-only for visitors/admin context', async () => {
    const { avatar } = mount();
    actions.compress.mockRejectedValueOnce(new Error('decode failed'));
    await avatar.upload(new File(['x'], 'avatar.png', { type: 'image/png' }));
    expect(avatar.error.value).toBe('prepare');
    expect(await avatar.save()).toBe(false);
    user.role = 'visitor';
    await avatar.selectBuiltin('mountain-fox');
    expect(actions.render).toHaveBeenCalledOnce();
    expect(await avatar.save()).toBe(false);
    user.role = 'root';
    user.adminContext = { subjectUserId: 'other-user' };
    await nextTick();
    expect(avatar.canEdit.value).toBe(false);
    expect(await avatar.save()).toBe(false);
    expect(actions.update).not.toHaveBeenCalled();
  });
});
