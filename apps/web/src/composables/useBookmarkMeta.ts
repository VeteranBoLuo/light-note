import { computed, ref, watch, type Ref } from 'vue';
import { apiBasePost } from '@/http/request';
import { createAiSkillRequest, executeAiSkill, getAiSkillPublicErrorMessage } from '@/api/aiSkillApi';
import { recordAiSkillApplied } from '@/api/aiTelemetry';
import message from '@/components/base/BasicComponents/BMessage/BMessage';
import { recordOperation } from '@/api/commonApi';
import Alert from '@/components/base/BasicComponents/BModal/Alert';
import i18n from '@/i18n';
import { preflightBookmarkUrl } from '@/composables/useBookmarkUrlResolution';
import { resolveBookmarkUrlInput } from '@lightnote/shared';
import { appendSessionAiTagSelection, replaceSessionAiTagSelection } from '@/utils/aiTagSelection';
import { getAiQuotaErrorPresentation } from '@/utils/aiQuotaErrorPresentation';

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
  type TextField = 'name' | 'description';
  const undoSnapshot = ref<Partial<Record<TextField, string>> | null>(null);
  const updatedFields = computed(() => Object.keys(undoSnapshot.value || {}) as TextField[]);
  const canUndoMeta = computed(() => updatedFields.value.length > 0 && phase.value === 'idle');
  let internalWrite = false;
  let editedFields = new Set<TextField>();
  let sessionVersion = 0;

  function writeInternally(write: () => void) {
    internalWrite = true;
    try {
      write();
    } finally {
      internalWrite = false;
    }
  }
  function clearMetaUndo() {
    undoSnapshot.value = null;
  }
  function undoBookmarkMeta() {
    if (!canUndoMeta.value || !undoSnapshot.value) return;
    const snapshot = undoSnapshot.value;
    writeInternally(() => {
      for (const field of updatedFields.value) bookmarkData.value[field] = snapshot[field];
    });
    clearMetaUndo();
  }
  for (const field of ['name', 'description'] as const) {
    watch(
      () => bookmarkData.value[field],
      () => {
        if (internalWrite) return;
        editedFields.add(field);
        clearMetaUndo();
      },
      { flush: 'sync' },
    );
  }
  watch(
    () => [bookmarkData.value.id, bookmarkData.value.url],
    () => {
      if (internalWrite) return;
      sessionVersion++;
      stopBookmarkMetaGeneration({ notify: false });
      clearMetaUndo();
    },
    { flush: 'sync' },
  );
  // 只记录本次编辑会话中由 AI 新增到选择区的标签。再次识别时替换这些标签，
  // 已保存标签和用户手动选择的标签不做静默删除。
  let aiSelectedTagIds: string[] = [];

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
    let stopped = false;
    if (current && !current.controller.signal.aborted) {
      current.controller.abort();
      clearActiveGeneration(current.controller);
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
    const rawUrl = String(bookmarkData.value.url || '').trim();
    if (!rawUrl) {
      message.warning(i18n.global.t('bookmarkMeta.fillUrlFirst'));
      return;
    }
    const controller = new AbortController();
    const version = ++sessionVersion;
    editedFields = new Set();
    activeGeneration = { controller, timeoutId: null };
    phase.value = 'resolving-url';
    try {
      const urlResult = await preflightBookmarkUrl(rawUrl, {
        checkLiveness: false,
        signal: controller.signal,
      });
      if (controller.signal.aborted || version !== sessionVersion || !urlResult.ok || !urlResult.url) return;
      writeInternally(() => {
        bookmarkData.value.url = urlResult.url;
      });
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
        writeInternally(() => {
          bookmarkData.value.url = returnedUrl;
        });
      }
      const generatedName = String(generatedData.name || '').trim();
      const generatedDescription = String(generatedData.description || '').trim();
      const selectedFields: TextField[] = [];
      const snapshot: Partial<Record<TextField, string>> = {};
      const generated = { name: generatedName, description: generatedDescription };
      writeInternally(() => {
        for (const field of ['name', 'description'] as const) {
          if (editedFields.has(field) || !generated[field] || generated[field] === bookmarkData.value[field]) continue;
          snapshot[field] = bookmarkData.value[field];
          bookmarkData.value[field] = generated[field];
          selectedFields.push(field);
        }
      });
      if (selectedFields.length) undoSnapshot.value = snapshot;
      if (editedFields.size) message.info(i18n.global.t('bookmarkMeta.manualEditsKept'));

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
      if (creatableTags.length) confirmCreateTags(creatableTags, version);
    } catch (error: any) {
      if (isRequestCancelled(error, controller)) return;
      // Skill API 使用 silent 请求，页面必须展示其已经过服务端脱敏的公开错误；
      // preflight 或其他未知异常仍使用本地兜底，避免把技术细节直接暴露给用户。
      const quotaFailure = getAiQuotaErrorPresentation(error, (key, params) => i18n.global.t(key, params as any));
      const publicMessage = getAiSkillPublicErrorMessage(error);
      message.error(quotaFailure?.message || publicMessage || i18n.global.t('bookmarkMeta.generateFailed'));
    } finally {
      clearActiveGeneration(controller);
    }
  }

  // 新标签属于账号级持久对象，必须显式确认；允许它与强相关已有标签同时出现。
  function confirmCreateTags(names: string[], version: number) {
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
            if (version !== sessionVersion) return;
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
            if (version !== sessionVersion) return;
            await refreshTags();
            if (version !== sessionVersion) return;
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

  function disposeBookmarkMeta() {
    sessionVersion++;
    stopBookmarkMetaGeneration({ notify: false });
    clearMetaUndo();
  }

  return {
    resolvingUrl,
    generating,
    generateBookmarkMeta,
    stopBookmarkMetaGeneration,
    updatedFields,
    canUndoMeta,
    undoBookmarkMeta,
    clearMetaUndo,
    disposeBookmarkMeta,
  };
}
