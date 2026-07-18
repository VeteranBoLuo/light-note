import { computed, ref, type Ref } from 'vue';
import { apiBasePost } from '@/http/request';
import message from '@/components/base/BasicComponents/BMessage/BMessage';
import { recordOperation } from '@/api/commonApi';
import Alert from '@/components/base/BasicComponents/BModal/Alert';
import i18n from '@/i18n';
import { preflightBookmarkUrl } from '@/composables/useBookmarkUrlResolution';
import {
  requestBookmarkMetaOverwriteDecision,
  type BookmarkMetaOverwriteField,
  type BookmarkMetaOverwriteFieldId,
} from '@/utils/bookmarkMetaOverwriteDecision';

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
export const BOOKMARK_META_GENERATION_TIMEOUT_MS = 50_000;
const BOOKMARK_META_HTTP_TIMEOUT_MS = BOOKMARK_META_GENERATION_TIMEOUT_MS + 5_000;

interface ActiveGeneration {
  controller: AbortController;
  timeoutId: ReturnType<typeof setTimeout> | null;
}

type BookmarkMetaPhase = 'idle' | 'resolving-url' | 'generating';

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
  const phase = ref<BookmarkMetaPhase>('idle');
  const resolvingUrl = computed(() => phase.value === 'resolving-url');
  const generating = computed(() => phase.value === 'generating');
  let activeGeneration: ActiveGeneration | null = null;
  let activeOverwriteController: AbortController | null = null;

  async function selectFieldsToApply(
    name: string,
    description: string,
    signal?: AbortSignal,
  ): Promise<BookmarkMetaOverwriteFieldId[] | null> {
    const currentName = String(bookmarkData.value.name || '').trim();
    const currentDescription = String(bookmarkData.value.description || '').trim();
    const fields: BookmarkMetaOverwriteField[] = [];

    if (name && name !== currentName) {
      fields.push({ id: 'name', currentValue: currentName, generatedValue: name });
    }
    if (description && description !== currentDescription) {
      fields.push({ id: 'description', currentValue: currentDescription, generatedValue: description });
    }
    if (!fields.length) return [];

    // 当前两个字段都为空时直接补全；只要其中一项会覆盖已有内容，就完整展示本次变更，
    // 让用户逐项决定，同时也能看见另一个原本为空、即将被补全的字段。
    if (!fields.some((field) => field.currentValue)) return fields.map((field) => field.id);
    return requestBookmarkMetaOverwriteDecision(fields, { signal });
  }

  function clearActiveGeneration(controller: AbortController) {
    if (activeGeneration?.controller !== controller) return;
    if (activeGeneration.timeoutId) clearTimeout(activeGeneration.timeoutId);
    activeGeneration = null;
    phase.value = 'idle';
  }

  function isRequestCancelled(error: any, controller: AbortController) {
    return (
      controller.signal.aborted ||
      error?.code === 'ERR_CANCELED' ||
      error?.name === 'CanceledError' ||
      error?.name === 'AbortError'
    );
  }

  function stopBookmarkMetaGeneration({ notify = true }: { notify?: boolean } = {}) {
    const current = activeGeneration;
    const overwriteController = activeOverwriteController;
    let stopped = false;
    if (current && !current.controller.signal.aborted) {
      current.controller.abort();
      clearActiveGeneration(current.controller);
      stopped = true;
    }
    if (overwriteController && !overwriteController.signal.aborted) {
      overwriteController.abort();
      stopped = true;
    }
    if (stopped && notify) message.info(i18n.global.t('bookmarkMeta.generationStopped'));
  }

  // 合并勾选标签并去重，遵守后端 4 个上限
  function selectTags(ids: string[]) {
    const cur: string[] = bookmarkData.value.relatedTags || [];
    bookmarkData.value.relatedTags = Array.from(new Set([...cur, ...ids])).slice(0, MAX_RELATED_TAGS);
  }

  async function generateBookmarkMeta() {
    if (activeGeneration || phase.value !== 'idle') return;
    if (activeOverwriteController && !activeOverwriteController.signal.aborted) {
      activeOverwriteController.abort();
    }
    const rawUrl = String(bookmarkData.value.url || '').trim();
    if (!rawUrl) {
      message.warning(i18n.global.t('bookmarkMeta.fillUrlFirst'));
      return;
    }
    const controller = new AbortController();
    activeGeneration = { controller, timeoutId: null };
    phase.value = 'resolving-url';
    try {
      const urlResult = await preflightBookmarkUrl(rawUrl, {
        checkLiveness: false,
        signal: controller.signal,
      });
      if (!urlResult.ok || !urlResult.url) return;
      bookmarkData.value.url = urlResult.url;
      if (controller.signal.aborted) return;
      phase.value = 'generating';

      const currentGeneration = activeGeneration;
      if (currentGeneration?.controller === controller) {
        currentGeneration.timeoutId = setTimeout(() => {
          if (activeGeneration?.controller !== controller || controller.signal.aborted) return;
          message.error(i18n.global.t('bookmarkMeta.generationTimeout'));
          controller.abort();
        }, BOOKMARK_META_GENERATION_TIMEOUT_MS);
      }

      const res = await apiBasePost(
        '/api/chat/generateBookmarkMeta',
        { url: bookmarkData.value.url },
        {
          signal: controller.signal,
          timeout: BOOKMARK_META_HTTP_TIMEOUT_MS,
          silent: true,
        },
      );
      if (controller.signal.aborted) return;
      if (res.status !== 200) {
        message.error(res.msg || i18n.global.t('bookmarkMeta.generateFailed'));
        return;
      }

      const generatedData = res.data || {};
      const generatedName = String(generatedData.name || '').trim();
      const generatedDescription = String(generatedData.description || '').trim();
      // 远端工作已经结束，比较弹框属于用户决策阶段，不应继续显示“生成中”或触发超时。
      clearActiveGeneration(controller);
      const overwriteController = new AbortController();
      activeOverwriteController = overwriteController;
      let selectedFields: BookmarkMetaOverwriteFieldId[] | null;
      try {
        selectedFields = await selectFieldsToApply(
          generatedName,
          generatedDescription,
          overwriteController.signal,
        );
      } finally {
        if (activeOverwriteController === overwriteController) activeOverwriteController = null;
      }
      if (selectedFields === null) return;

      if (generatedName && selectedFields.includes('name')) {
        bookmarkData.value.name = generatedName;
      }
      if (generatedDescription && selectedFields.includes('description')) {
        bookmarkData.value.description = generatedDescription;
      }

      // 只勾选确实存在于候选里的标签（后端已保证，这里再兜底一次，避免勾中不存在的 id 无法显示）
      const validIds = new Set(tagOptions.value.map((o) => o.value));
      const matched: string[] = (generatedData.matchedTagIds || []).filter((id: string) => validIds.has(id));
      if (matched.length) {
        selectTags(matched);
      }

      recordOperation({ module: '书签详情', operation: `生成书签信息成功【${bookmarkData.value.url}】` });

      const newTags: string[] = generatedData.newTags || [];
      const inferred = generatedData.metadataSource === 'inferred';
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
      if (isRequestCancelled(error, controller)) return;
      // HTTP 5xx 已由统一拦截器展示服务端友好提示，避免这里再弹一次。
      if (String(error?.code || '').startsWith('HTTP_')) return;
      message.error(
        error?.code === 'NETWORK_ERROR' && error?.message
          ? error.message
          : i18n.global.t('bookmarkMeta.generateFailed'),
      );
    } finally {
      clearActiveGeneration(controller);
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

  return { resolvingUrl, generating, generateBookmarkMeta, stopBookmarkMetaGeneration };
}
