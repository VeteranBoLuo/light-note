import { computed, ref, type Ref } from 'vue';
import { apiBasePost } from '@/http/request';
import { createAiSkillRequest, executeAiSkill, getAiSkillPublicErrorMessage } from '@/api/aiSkillApi';
import { recordAiSkillApplied } from '@/api/aiTelemetry';
import message from '@/components/base/BasicComponents/BMessage/BMessage';
import { recordOperation } from '@/api/commonApi';
import Alert from '@/components/base/BasicComponents/BModal/Alert';
import i18n from '@/i18n';
import { preflightBookmarkUrl } from '@/composables/useBookmarkUrlResolution';
import { resolveBookmarkUrlInput } from '@lightnote/shared';
import {
  requestBookmarkMetaOverwriteDecision,
  type BookmarkMetaOverwriteField,
  type BookmarkMetaOverwriteFieldId,
} from '@/utils/bookmarkMetaOverwriteDecision';
import { appendSessionAiTagSelection, replaceSessionAiTagSelection } from '@/utils/aiTagSelection';

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
  // 只记录本次编辑会话中由 AI 新增到选择区的标签。再次识别时替换这些标签，
  // 已保存标签和用户手动选择的标签不做静默删除。
  let aiSelectedTagIds: string[] = [];

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

  function replaceGeneratedTags(ids: string[]) {
    const result = replaceSessionAiTagSelection({
      currentIds: bookmarkData.value.relatedTags || [],
      previousAiIds: aiSelectedTagIds,
      incomingAiIds: ids,
      cap: MAX_RELATED_TAGS,
    });
    bookmarkData.value.relatedTags = result.selectedIds;
    aiSelectedTagIds = result.aiSelectedIds;
    return result.changed;
  }

  function addGeneratedTags(ids: string[]) {
    const result = appendSessionAiTagSelection({
      currentIds: bookmarkData.value.relatedTags || [],
      previousAiIds: aiSelectedTagIds,
      incomingAiIds: ids,
      cap: MAX_RELATED_TAGS,
    });
    bookmarkData.value.relatedTags = result.selectedIds;
    aiSelectedTagIds = result.aiSelectedIds;
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
      const submittedUrl = bookmarkData.value.url;

      const currentGeneration = activeGeneration;
      if (currentGeneration?.controller === controller) {
        currentGeneration.timeoutId = setTimeout(() => {
          if (activeGeneration?.controller !== controller || controller.signal.aborted) return;
          message.error(i18n.global.t('bookmarkMeta.generationTimeout'));
          controller.abort();
        }, BOOKMARK_META_GENERATION_TIMEOUT_MS);
      }

      const skillResponse = await executeAiSkill(
        createAiSkillRequest({
          skillId: 'bookmark.parse_url',
          input: { url: bookmarkData.value.url },
          surface: 'bookmark.form',
        }),
        { signal: controller.signal },
      );
      if (controller.signal.aborted) return;
      if (skillResponse.result?.kind !== 'field_suggestions') {
        message.error(i18n.global.t('bookmarkMeta.generateFailed'));
        return;
      }

      const generatedData = (skillResponse.result.fields || {}) as Record<string, any>;
      const returnedUrl = resolveBookmarkUrlInput(generatedData.url, {
        allowTextExtraction: false,
      }).canonicalUrl;
      // 请求期间用户可能手动改过地址；只在输入仍是本次提交值时回写短链的真实落地地址。
      if (returnedUrl && bookmarkData.value.url === submittedUrl) {
        bookmarkData.value.url = returnedUrl;
      }
      const generatedName = String(generatedData.name || '').trim();
      const generatedDescription = String(generatedData.description || '').trim();
      // 远端工作已经结束，比较弹框属于用户决策阶段，不应继续显示“生成中”或触发超时。
      clearActiveGeneration(controller);
      const overwriteController = new AbortController();
      activeOverwriteController = overwriteController;
      let selectedFields: BookmarkMetaOverwriteFieldId[] | null;
      try {
        selectedFields = await selectFieldsToApply(generatedName, generatedDescription, overwriteController.signal);
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
      const tagsChanged = replaceGeneratedTags(matched);
      if (selectedFields.length || tagsChanged) {
        void recordAiSkillApplied({
          skillId: 'bookmark.parse_url',
          surface: 'bookmark.form',
          resourceType: 'bookmark',
        });
      }

      recordOperation({ module: '书签详情', operation: `生成书签信息成功【${bookmarkData.value.url}】` });

      const newTags: string[] = generatedData.newTags || [];
      const inferred = skillResponse.result.metadataSource === 'inferred';
      if (inferred) {
        message.warning(i18n.global.t('bookmarkMeta.inferredWarning'));
      } else if (matched.length) {
        message.success(i18n.global.t('bookmarkMeta.genWithTags'));
      } else if (newTags.length) {
        message.success(i18n.global.t('bookmarkMeta.genNoTags'));
      } else {
        message.success(i18n.global.t('bookmarkMeta.genOnly'));
      }
      const availableTagSlots = Math.max(0, MAX_RELATED_TAGS - bookmarkData.value.relatedTags.length);
      const creatableTags = [...new Set(newTags.map((name) => String(name || '').trim()).filter(Boolean))].slice(
        0,
        availableTagSlots,
      );
      if (creatableTags.length) confirmCreateTags(creatableTags);
    } catch (error: any) {
      if (isRequestCancelled(error, controller)) return;
      // Skill API 使用 silent 请求，页面必须展示其已经过服务端脱敏的公开错误；
      // preflight 或其他未知异常仍使用本地兜底，避免把技术细节直接暴露给用户。
      const publicMessage = getAiSkillPublicErrorMessage(error);
      message.error(publicMessage || i18n.global.t('bookmarkMeta.generateFailed'));
    } finally {
      clearActiveGeneration(controller);
    }
  }

  // 新标签属于账号级持久对象，必须显式确认；允许它与强相关已有标签同时出现。
  function confirmCreateTags(names: string[]) {
    const displayNames = names.join('、');
    Alert.alert({
      title: i18n.global.t('bookmarkMeta.suggestTagTitle'),
      content: i18n.global.t(
        names.length > 1 ? 'bookmarkMeta.suggestTagsContent' : 'bookmarkMeta.suggestTagContent',
        names.length > 1 ? { names: displayNames } : { name: names[0] },
      ),
      footer: [
        { label: i18n.global.t('bookmarkMeta.notNow'), type: 'dashed', function: () => Alert.destroy() },
        {
          label: i18n.global.t('bookmarkMeta.createAndLink'),
          type: 'primary',
          function: async () => {
            Alert.destroy();
            const createdNames: string[] = [];
            for (const name of names) {
              const res = await apiBasePost('/api/bookmark/addTag', { name }).catch(() => null);
              // 游客写拦截：request.ts 已统一弹注册引导，这里静默返回即可
              if (res?.status === 'preview') return;
              if (res?.status === 200) {
                createdNames.push(name);
                recordOperation({ module: '标签详情', operation: `新增标签成功【${name}】` });
              }
            }
            if (!createdNames.length) {
              message.error(i18n.global.t('bookmarkMeta.createTagFailed'));
              return;
            }
            await refreshTags();
            const createdIds = tagOptions.value
              .filter((option) => createdNames.includes(option.label))
              .map((option) => option.value);
            addGeneratedTags(createdIds);
            if (createdNames.length < names.length) message.warning(i18n.global.t('bookmarkMeta.createTagFailed'));
            message.success(
              i18n.global.t(
                createdNames.length > 1 ? 'bookmarkMeta.tagsCreatedSelected' : 'bookmarkMeta.tagCreatedSelected',
                { count: createdNames.length },
              ),
            );
          },
        },
      ],
    });
  }

  return { resolvingUrl, generating, generateBookmarkMeta, stopBookmarkMetaGeneration };
}
