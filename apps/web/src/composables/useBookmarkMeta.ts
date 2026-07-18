import { ref, type Ref } from 'vue';
import { apiBasePost } from '@/http/request';
import message from '@/components/base/BasicComponents/BMessage/BMessage';
import { recordOperation } from '@/api/commonApi';
import Alert from '@/components/base/BasicComponents/BModal/Alert';
import i18n from '@/i18n';
import { preflightBookmarkUrl } from '@/composables/useBookmarkUrlResolution';

interface TagOption {
  label: string;
  value: string;
}

interface UseBookmarkMetaOptions {
  /** 书签表单数据（含 name / description / url / relatedTags） */
  bookmarkData: Ref<any>;
  /** 标签下拉候选，与 BSelect 的 options 同源 */
  tagOptions: Ref<TagOption[]>;
  /** 重新拉取标签候选（新建标签后刷新用） */
  refreshTags: () => Promise<TagOption[]>;
}

// 书签最多关联 4 个标签（后端 addBookmark / updateBookmark 强制上限，超出会回滚）
const MAX_RELATED_TAGS = 4;

/**
 * 书签「AI 生成名称/描述 + 推荐关联标签」逻辑，PC 端与移动端共用。
 *
 * 点击一次按钮：
 * 1. 生成书签名称、描述并回填；
 * 2. 自动勾选 AI 从「你已有标签」中匹配到的标签（仅预选，点保存后才真正关联）；
 * 3. 已有标签都不合适时，弹框确认是否新建 AI 建议的标签，确认后创建并勾选。
 *
 * 标签只预选、不落库，真正的关联发生在书签保存时（addBookmark / updateBookmark）。
 */
export function useBookmarkMeta({ bookmarkData, tagOptions, refreshTags }: UseBookmarkMetaOptions) {
  const generating = ref(false);

  function confirmOverwrite(name: string, description: string): Promise<boolean> {
    const currentName = String(bookmarkData.value.name || '').trim();
    const currentDescription = String(bookmarkData.value.description || '').trim();
    const replacesName = !!currentName && !!name && currentName !== name.trim();
    const replacesDescription =
      !!currentDescription && !!description && currentDescription !== description.trim();
    if (!replacesName && !replacesDescription) return Promise.resolve(true);

    return new Promise((resolve) => {
      Alert.alert({
        title: i18n.global.t('bookmarkEditor.overwriteTitle'),
        content: i18n.global.t('bookmarkEditor.overwriteContent'),
        footer: [
          {
            label: i18n.global.t('bookmarkEditor.keepExisting'),
            function: () => {
              Alert.destroy();
              resolve(false);
            },
          },
          {
            label: i18n.global.t('bookmarkEditor.applyResult'),
            type: 'primary',
            function: () => {
              Alert.destroy();
              resolve(true);
            },
          },
        ],
      });
    });
  }

  // 合并勾选标签并去重，遵守后端 4 个上限
  function selectTags(ids: string[]) {
    const cur: string[] = bookmarkData.value.relatedTags || [];
    bookmarkData.value.relatedTags = Array.from(new Set([...cur, ...ids])).slice(0, MAX_RELATED_TAGS);
  }

  async function generateBookmarkMeta() {
    if (generating.value) return;
    const rawUrl = String(bookmarkData.value.url || '').trim();
    if (!rawUrl) {
      message.warning(i18n.global.t('bookmarkMeta.fillUrlFirst'));
      return;
    }
    generating.value = true;
    try {
      const urlResult = await preflightBookmarkUrl(rawUrl, { checkLiveness: false });
      if (!urlResult.ok || !urlResult.url) return;
      bookmarkData.value.url = urlResult.url;
      const res = await apiBasePost('/api/chat/generateBookmarkMeta', {
        url: bookmarkData.value.url,
      });
      if (res.status !== 200) return;

      const generatedName = String(res.data.name || '').trim();
      const generatedDescription = String(res.data.description || '').trim();
      if (!(await confirmOverwrite(generatedName, generatedDescription))) return;

      if (generatedName) {
        bookmarkData.value.name = generatedName;
      }
      if (generatedDescription) {
        bookmarkData.value.description = generatedDescription;
      }

      // 只勾选确实存在于候选里的标签（后端已保证，这里再兜底一次，避免勾中不存在的 id 无法显示）
      const validIds = new Set(tagOptions.value.map((o) => o.value));
      const matched: string[] = (res.data.matchedTagIds || []).filter((id: string) => validIds.has(id));
      if (matched.length) {
        selectTags(matched);
      }

      recordOperation({ module: '书签详情', operation: `生成书签信息成功【${bookmarkData.value.url}】` });

      const newTags: string[] = res.data.newTags || [];
      const inferred = res.data.metadataSource === 'inferred';
      if (inferred) {
        message.warning(i18n.global.t('bookmarkMeta.inferredWarning'));
      } else if (matched.length) {
        message.success(i18n.global.t('bookmarkMeta.genWithTags'));
      } else if (newTags.length) {
        message.success(i18n.global.t('bookmarkMeta.genNoTags'));
      } else {
        message.success(i18n.global.t('bookmarkMeta.genOnly'));
      }
      // 已有标签都不合适：只建议第一个新标签，问用户是否新建
      if (!matched.length && newTags.length) confirmCreateTag(newTags[0]);
    } catch (error: any) {
      message.error(error?.message || i18n.global.t('bookmarkMeta.generateFailed'));
    } finally {
      generating.value = false;
    }
  }

  // 已有标签都不合适时，确认是否新建 AI 建议的标签，创建成功后插入候选并勾选
  function confirmCreateTag(name: string) {
    Alert.alert({
      title: i18n.global.t('bookmarkMeta.suggestTagTitle'),
      content: i18n.global.t('bookmarkMeta.suggestTagContent', { name }),
      footer: [
        { label: i18n.global.t('bookmarkMeta.notNow'), type: 'dashed', function: () => Alert.destroy() },
        {
          label: i18n.global.t('bookmarkMeta.createAndLink'),
          type: 'primary',
          function: async () => {
            Alert.destroy();
            const res = await apiBasePost('/api/bookmark/addTag', { name }).catch(() => null);
            // 游客写拦截：request.ts 已统一弹注册引导，这里静默返回即可
            if (res?.status === 'preview') {
              return;
            }
            if (!res || res.status !== 200) {
              message.error(i18n.global.t('bookmarkMeta.createTagFailed'));
              return;
            }
            // 刷新候选，拿到后端生成的标签 id（时间戳 UUID）后再勾选
            await refreshTags();
            const created = tagOptions.value.find((o) => o.label === name);
            if (created) {
              selectTags([created.value]);
            }
            recordOperation({ module: '标签详情', operation: `新增标签成功【${name}】` });
            message.success(i18n.global.t('bookmarkMeta.tagCreatedSelected'));
          },
        },
      ],
    });
  }

  return { generating, generateBookmarkMeta };
}
