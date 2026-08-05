<template>
  <div class="inline-tag-create">
    <b-button
      v-if="!expanded"
      size="small"
      type="primary"
      class="inline-tag-create__entry"
      @click="expand"
    >
      {{ t('tagInlineCreate.entry') }}
    </b-button>

    <div v-else class="inline-tag-create__form">
      <BInput
        ref="inputRef"
        v-model:value="name"
        class="inline-tag-create__input"
        :maxlength="NAME_MAX_LENGTH"
        :placeholder="t('tagInlineCreate.placeholder')"
        :disabled="submitting"
        @enter="submit"
        @keydown.esc="collapse"
      />
      <div class="inline-tag-create__actions">
        <b-button
          size="small"
          type="primary"
          class="inline-tag-create__submit"
          :disabled="!canSubmit"
          @click="submit"
        >
          {{ submitting ? t('tagInlineCreate.creating') : t('common.confirm') }}
        </b-button>
        <b-button size="small" class="inline-tag-create__cancel" :disabled="submitting" @click="collapse">
          {{ t('common.cancel') }}
        </b-button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
  /**
   * 标签库里的「顺手新建一个标签」。
   *
   * 这里的用户意图很窄：正在给笔记/文件绑标签，发现缺一个，建完立刻要用上。
   * 因此只收标签名，图标、批量关联资源等完整字段留给标签管理页 ——
   * 原来这个入口 `window.open` 到标签编辑页，既离开了当前上下文（APK 里还会落进
   * 应用内浏览器），又要用户建完自己切回来、手动刷新、再手动点绑定。
   *
   * 组件只负责「创建出一个可用的标签」，绑定由父组件完成：笔记侧有 3 个标签上限、
   * 文件侧没有，绑定语义不同，不适合塞进这里。
   */
  import { computed, nextTick, ref } from 'vue';
  import { useI18n } from 'vue-i18n';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BInput from '@/components/base/BasicComponents/BInput.vue';
  import message from '@/components/base/BasicComponents/BMessage/BMessage';
  import { apiBasePost } from '@/http/request';
  import { blockGuestWrite } from '@/composables/useGuestGuard';
  import { bookmarkStore } from '@/store';

  export interface InlineCreatableTag {
    id: string;
    name: string;
  }

  const props = defineProps<{
    /** 当前标签库全量列表，用于本地查重 */
    existingTags: InlineCreatableTag[];
    /** 游客拦截用的场景标识 */
    guardScene?: string;
  }>();

  const emit = defineEmits<{
    /** 新标签创建成功，父组件负责刷新列表并绑定 */
    created: [tag: InlineCreatableTag];
    /** 输入的名字在标签库里已存在，直接复用它而不是报错 */
    reused: [tag: InlineCreatableTag];
    /** 服务端判定重名但本地列表里没有（并发或列表过期），父组件应刷新列表 */
    stale: [];
  }>();

  /**
   * 快速创建场景的实用上限。后端允许 255，但过长的名字在标签列表里只会被截断；
   * 确实需要长名可以到标签管理页改。
   */
  const NAME_MAX_LENGTH = 50;

  const { t } = useI18n();
  const bookmark = bookmarkStore();
  const expanded = ref(false);
  const submitting = ref(false);
  const name = ref('');
  const inputRef = ref<InstanceType<typeof BInput> | null>(null);

  const canSubmit = computed(() => Boolean(name.value.trim()) && !submitting.value);

  function expand() {
    // 早拦截：不让游客先输入一通再被拒
    if (blockGuestWrite(props.guardScene || 'create-tag')) return;
    expanded.value = true;
    name.value = '';
    // 桌面端自动聚焦省一次点击；移动端不聚焦，否则键盘突然弹起会把弹框内容顶走
    if (!bookmark.isMobile) void nextTick(() => inputRef.value?.focus());
  }

  function collapse() {
    if (submitting.value) return;
    expanded.value = false;
    name.value = '';
  }

  async function submit() {
    const trimmed = name.value.trim();
    if (!trimmed || submitting.value) return;

    /*
     * 先在本地查重。标签库是全量加载的，命中就直接复用已有标签：
     * 用户要的是「让这条资源带上这个标签」，标签已存在时报一个「已存在」的错
     * 只是把他推回去自己搜。同时也避开了后端 TAG_DUPLICATE 那条错误路径。
     */
    const duplicated = props.existingTags.find(
      (tag) => tag.name.trim().toLowerCase() === trimmed.toLowerCase(),
    );
    if (duplicated) {
      emit('reused', duplicated);
      collapse();
      return;
    }

    submitting.value = true;
    try {
      const res = await apiBasePost('/api/bookmark/addTag', { name: trimmed });
      if (res.status === 200 && res.data?.id) {
        emit('created', { id: String(res.data.id), name: trimmed });
        expanded.value = false;
        name.value = '';
        return;
      }
      /*
       * 并发创建或本地列表过期时仍会撞重名。后端把错误码拼进了 msg
       * （`'服务器内部错误: ' + error.message`），只能包含匹配；
       * 认出来就交给父组件刷新列表，别让用户对着一句「服务器内部错误」发愣。
       */
      if (String(res.msg || '').includes('TAG_DUPLICATE')) {
        message.warning(t('tagInlineCreate.duplicate'));
        emit('stale');
        return;
      }
      message.error(t('tagInlineCreate.failed'));
    } catch (error) {
      console.error('内联创建标签失败:', error);
      message.error(t('tagInlineCreate.failed'));
    } finally {
      submitting.value = false;
    }
  }

  defineExpose({ collapse });
</script>

<style lang="less" scoped>
  /*
   * 与 InlineTagRename 同一套：grid 两列的分配是确定的，flex-wrap 下
   * 输入框会吃满整行把按钮挤下去，白占一行高度。
   */
  .inline-tag-create__form {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    gap: 6px;
  }
  .inline-tag-create__input {
    min-width: 0;
  }
  .inline-tag-create__actions {
    display: flex;
    gap: 6px;
  }

  @media (max-width: 767px) {
    /* 窄屏改单列：输入框独占一行，两个按钮并排在下面右对齐 */
    .inline-tag-create__form {
      grid-template-columns: minmax(0, 1fr);
    }
    .inline-tag-create__actions {
      /* 触控高度由 b-button 的移动端样式保证，这里只管排布 */
      justify-content: flex-end;
    }
  }
</style>
