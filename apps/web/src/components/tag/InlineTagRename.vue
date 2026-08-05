<template>
  <!-- 编辑态占据整个标签行：click.stop 阻止冒泡到行本身的「切换绑定」 -->
  <div class="inline-tag-rename" @click.stop>
    <BInput
      ref="inputRef"
      v-model:value="name"
      class="inline-tag-rename__input"
      :maxlength="NAME_MAX_LENGTH"
      :disabled="submitting"
      @enter="submit"
      @keydown.esc="$emit('cancel')"
    />
    <div class="inline-tag-rename__actions">
      <b-button
        size="small"
        type="primary"
        class="inline-tag-rename__submit"
        :disabled="!canSubmit"
        @click.stop="submit"
      >
        {{ submitting ? t('tagInlineCreate.creating') : t('common.confirm') }}
      </b-button>
      <b-button
        size="small"
        class="inline-tag-rename__cancel"
        :disabled="submitting"
        @click.stop="$emit('cancel')"
      >
        {{ t('common.cancel') }}
      </b-button>
    </div>
  </div>
</template>

<script setup lang="ts">
  /**
   * 标签库里的「就地改名」。
   *
   * 与 InlineTagCreate 同一个思路：这个场景只想把名字改对，不需要跳到标签编辑页
   * 去面对图标选择器和跨三类资源的批量关联表单。图标与关联仍留给标签管理页。
   *
   * 只提交 name —— updateTag 用 mergeExistingProperties 合并字段，
   * 且只有传了 bookmarkList/noteList/fileList 才会重写关联，所以不传就不动关联。
   */
  import { computed, nextTick, onMounted, ref } from 'vue';
  import { useI18n } from 'vue-i18n';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BInput from '@/components/base/BasicComponents/BInput.vue';
  import message from '@/components/base/BasicComponents/BMessage/BMessage';
  import { apiBasePost } from '@/http/request';
  import { blockGuestWrite } from '@/composables/useGuestGuard';
  import { bookmarkStore } from '@/store';

  export interface RenamableTag {
    id: string;
    name: string;
  }

  const props = defineProps<{
    tag: RenamableTag;
    /** 当前标签库全量列表，用于本地查重（排除自己） */
    existingTags: RenamableTag[];
    guardScene?: string;
  }>();

  const emit = defineEmits<{
    renamed: [tag: RenamableTag];
    cancel: [];
  }>();

  /** 与 InlineTagCreate 保持一致的实用上限 */
  const NAME_MAX_LENGTH = 50;

  const { t } = useI18n();
  const bookmark = bookmarkStore();
  const submitting = ref(false);
  const name = ref(props.tag.name);
  const inputRef = ref<InstanceType<typeof BInput> | null>(null);

  const canSubmit = computed(() => Boolean(name.value.trim()) && !submitting.value);

  onMounted(() => {
    // 桌面端自动聚焦省一次点击；移动端不聚焦，避免键盘弹起把弹框内容顶走
    if (!bookmark.isMobile) void nextTick(() => inputRef.value?.focus());
  });

  async function submit() {
    const trimmed = name.value.trim();
    if (!trimmed || submitting.value) return;
    // 名字没变就当取消，不发无意义的请求
    if (trimmed === props.tag.name.trim()) {
      emit('cancel');
      return;
    }
    if (blockGuestWrite(props.guardScene || 'rename-tag')) return;

    // 本地查重（排除自己）：撞名就直接提示，不必等后端那句「服务器内部错误: 标签已存在」
    const duplicated = props.existingTags.some(
      (item) => item.id !== props.tag.id && item.name.trim().toLowerCase() === trimmed.toLowerCase(),
    );
    if (duplicated) {
      message.warning(t('tagInlineRename.duplicate'));
      return;
    }

    submitting.value = true;
    try {
      const res = await apiBasePost('/api/bookmark/updateTag', { id: props.tag.id, name: trimmed });
      if (res.status === 200) {
        emit('renamed', { id: props.tag.id, name: trimmed });
        return;
      }
      if (res.status === 403) {
        message.error(t('tagInlineRename.forbidden'));
        return;
      }
      // 并发改名时后端仍会判重，错误码被拼进 msg，只能包含匹配
      if (String(res.msg || '').includes('标签已存在')) {
        message.warning(t('tagInlineRename.duplicate'));
        return;
      }
      message.error(t('tagInlineRename.failed'));
    } catch (error) {
      console.error('内联改名失败:', error);
      message.error(t('tagInlineRename.failed'));
    } finally {
      submitting.value = false;
    }
  }
</script>

<style lang="less" scoped>
  /*
   * 用 grid 而不是 flex-wrap：两列「输入框 + 按钮」的分配是确定的，
   * 不依赖 flex-basis 与换行时机的相互作用（flex 方案下输入框会吃满整行、
   * 把按钮挤到下一行，白占一行高度）。minmax(0, 1fr) 保证长名不撑破容器。
   */
  .inline-tag-rename {
    display: grid;
    width: 100%;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    gap: 6px;
  }
  .inline-tag-rename__input {
    min-width: 0;
  }
  .inline-tag-rename__actions {
    display: flex;
    gap: 6px;
  }

  @media (max-width: 767px) {
    /* 窄屏改单列：输入框独占一行，按钮并排在下面右对齐，避免输入框被压成一条缝 */
    .inline-tag-rename {
      grid-template-columns: minmax(0, 1fr);
    }
    .inline-tag-rename__actions {
      justify-content: flex-end;
    }
  }
</style>
