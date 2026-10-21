import { computed, onBeforeUnmount, ref, watch, type Ref } from 'vue';
import userApi from '@/api/userApi';
import { useUserStore } from '@/store';
import icon from '@/config/icon';
import { renderBuiltinAvatar, type BuiltinAvatarId } from '@/config/builtinAvatars';
import { compressAvatarFile } from '@/utils/compressAvatar';

export function useProfileAvatar(open: Readonly<Ref<boolean>>) {
  const user = useUserStore();
  const normalize = (source?: string) =>
    !source || source === icon.navigation.user || source === icon.communityChat.defaultAvatar ? '' : source;
  const persisted = computed(() => normalize(user.headPicture));
  const canEdit = computed(() => Boolean(user.id && user.role !== 'visitor' && !user.adminContext));
  const source = ref('');
  const kind = ref<'current' | 'builtin' | 'custom' | 'default'>('current');
  const selectedId = ref<BuiltinAvatarId | null>(null);
  const preparing = ref(false);
  const saving = ref(false);
  const error = ref<'prepare' | 'save' | ''>('');
  const changed = computed(() => source.value !== persisted.value);
  const owner = () => `${user.id}|${user.role}|${user.adminContext?.subjectUserId || ''}`;
  let generation = 0;

  function reset() {
    generation++;
    source.value = persisted.value;
    kind.value = 'current';
    selectedId.value = null;
    preparing.value = false;
    saving.value = false;
    error.value = '';
  }
  watch([open, owner], reset, { immediate: true, flush: 'sync' });
  watch(
    persisted,
    (value) => {
      if (kind.value === 'current' && !saving.value) source.value = value;
    },
    { flush: 'sync' },
  );
  onBeforeUnmount(() => generation++);

  async function prepare(nextKind: 'builtin' | 'custom', id: BuiltinAvatarId | null, render: () => Promise<string>) {
    if (!open.value || saving.value) return;
    const request = ++generation;
    const identity = owner();
    kind.value = nextKind;
    selectedId.value = id;
    preparing.value = true;
    error.value = '';
    try {
      const value = await render();
      if (request === generation && identity === owner() && open.value) source.value = value;
    } catch {
      if (request === generation && identity === owner() && open.value) error.value = 'prepare';
    } finally {
      if (request === generation && identity === owner() && open.value) preparing.value = false;
    }
  }
  const selectBuiltin = (id: BuiltinAvatarId) => prepare('builtin', id, () => renderBuiltinAvatar(id));
  const upload = (file: File) => prepare('custom', null, () => compressAvatarFile(file));
  function selectDefault() {
    if (!open.value || saving.value) return;
    reset();
    kind.value = 'default';
    source.value = '';
  }

  async function save() {
    if (!open.value || !canEdit.value || saving.value || preparing.value || !changed.value || error.value === 'prepare')
      return false;
    const request = generation;
    const identity = owner();
    const value = source.value;
    saving.value = true;
    error.value = '';
    try {
      // 只写头像；绝不携带资料编辑中的昵称、邮箱或简介草稿。
      const response = await userApi.updateUserInfo({ id: user.id, headPicture: value }, { silent: true });
      if (request !== generation || identity !== owner() || !open.value) return false;
      if (response.status !== 200) throw new Error('AVATAR_SAVE_FAILED');
      // setUserInfo 会重建整份账号状态，局部成功这里只更新头像。
      user.headPicture = value;
      return true;
    } catch {
      if (request === generation && identity === owner() && open.value) error.value = 'save';
      return false;
    } finally {
      if (request === generation && identity === owner() && open.value) saving.value = false;
    }
  }

  return {
    source,
    kind,
    selectedId,
    preparing,
    saving,
    error,
    changed,
    canEdit,
    reset,
    selectBuiltin,
    upload,
    selectDefault,
    save,
  };
}
