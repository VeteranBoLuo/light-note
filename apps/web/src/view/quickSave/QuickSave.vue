<template>
  <div class="qs-wrap">
    <div class="qs-card">
      <div class="qs-head">
        <img class="qs-logo" src="/favicon.svg?v=7" alt="轻笺" @error="onLogoErr" />
        <span class="qs-title">{{ $t('quickSave.title') }}</span>
      </div>

      <!-- 加载登录态 -->
      <div v-if="loadingUser" class="qs-state">{{ $t('quickSave.loading') }}</div>

      <!-- 未登录 -->
      <div v-else-if="!isLoggedIn" class="qs-state">
        <p class="qs-tip">{{ $t('quickSave.needLogin') }}</p>
        <BButton type="primary" @click="goLogin">{{ $t('quickSave.goLogin') }}</BButton>
      </div>

      <!-- 已保存 -->
      <div v-else-if="saved" class="qs-state qs-done">
        <div class="qs-check">✓</div>
        <p>{{ $t(mode === 'inbox' ? 'quickSave.savedInbox' : 'quickSave.savedFormal') }}</p>
        <BButton size="small" @click="closeWin">{{ $t('quickSave.close') }}</BButton>
      </div>

      <!-- 表单 -->
      <div v-else class="qs-form">
        <div class="qs-mode" role="group" :aria-label="$t('quickSave.modeLabel')">
          <BButton
            class="qs-mode-btn"
            :class="{ active: mode === 'inbox' }"
            :type="mode === 'inbox' ? 'primary' : undefined"
            :aria-pressed="mode === 'inbox'"
            :disabled="saving"
            @click="mode = 'inbox'"
          >
            <strong>{{ $t('quickSave.modeInbox') }}</strong>
            <small>{{ $t('quickSave.modeInboxShort') }}</small>
          </BButton>
          <BButton
            class="qs-mode-btn"
            :class="{ active: mode === 'formal' }"
            :type="mode === 'formal' ? 'primary' : undefined"
            :aria-pressed="mode === 'formal'"
            :disabled="saving"
            @click="mode = 'formal'"
          >
            <strong>{{ $t('quickSave.modeFormal') }}</strong>
            <small>{{ $t('quickSave.modeFormalShort') }}</small>
          </BButton>
        </div>
        <p class="qs-mode-hint">
          {{ $t(mode === 'inbox' ? 'quickSave.modeInboxHint' : 'quickSave.modeFormalHint') }}
        </p>

        <label class="qs-label">{{ $t('quickSave.name') }}</label>
        <BInput v-model:value="form.name" :placeholder="$t('quickSave.namePh')" />

        <label class="qs-label">{{ $t('quickSave.url') }}</label>
        <BInput v-model:value="form.url" :placeholder="$t('quickSave.urlPh')" />

        <label class="qs-label">{{ $t('quickSave.desc') }}</label>
        <BInput v-model:value="form.description" :placeholder="$t('quickSave.descPh')" />

        <template v-if="mode === 'formal'">
          <div class="qs-label-row">
            <label class="qs-label" style="margin: 0">{{ $t('quickSave.tags') }}</label>
            <span v-if="aiRunning" class="qs-ai-hint">
              <SvgIcon :src="icon.message.loading" size="13" aria-hidden="true" />
              {{ $t('quickSave.aiRunning') }}
            </span>
            <BButton v-else class="qs-ai-btn" size="small" @click="runAi">
              <SvgIcon :src="icon.common.magicWand" size="13" aria-hidden="true" />
              {{ $t('quickSave.aiSuggest') }}
            </BButton>
          </div>
          <BSelect
            mode="multiple"
            chip-tone="tag"
            :max-tag-count="4"
            :options="tagOptions"
            :placeholder="$t('quickSave.tagsPh')"
            :show-search="true"
            v-model:value="form.relatedTags"
          />
          <div v-if="aiNewTags.length" class="qs-newtags">
            <span class="qs-newtags-label">{{ $t('quickSave.aiNewTags') }}</span>
            <BChip
              v-for="nt in aiNewTags"
              :key="nt"
              class="qs-newtag"
              tone="tag"
              size="medium"
              interactive
              :disabled="creatingTag === nt"
              @click="createAndSelect(nt)"
            >
              ＋ {{ nt }}
            </BChip>
          </div>

          <BCheckbox v-model="form.saveSnapshot" class="qs-check-line">
            {{ $t('quickSave.saveSnapshot') }}
          </BCheckbox>
        </template>

        <BButton class="qs-save" type="primary" :loading="saving" :disabled="saving" @click="save">
          {{ saving ? $t('quickSave.saving') : $t(mode === 'inbox' ? 'quickSave.saveInbox' : 'quickSave.saveFormal') }}
        </BButton>
      </div>
    </div>
  </div>
</template>

<script lang="ts" setup>
  import { onMounted, reactive, ref } from 'vue';
  import { apiBaseGet, apiBasePost, apiQueryPost } from '@/http/request.ts';
  import message from '@/components/base/BasicComponents/BMessage/BMessage.ts';
  import BInput from '@/components/base/BasicComponents/BInput.vue';
  import BSelect from '@/components/base/BasicComponents/BSelect.vue';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BChip from '@/components/base/BasicComponents/BChip.vue';
  import BCheckbox from '@/components/base/BasicComponents/BCheckbox.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import icon from '@/config/icon.ts';
  import { useI18n } from 'vue-i18n';
  import { recordOperation } from '@/api/commonApi.ts';
  import { OPERATION_LOG_MAP } from '@/config/logMap.ts';
  import { preflightBookmarkUrl } from '@/composables/useBookmarkUrlResolution';
  import { rememberQuickSaveAuthReturnPath } from '@/utils/quickSaveAuthReturn.ts';
  import { createAiSkillRequest, executeAiSkill } from '@/api/aiSkillApi';
  import { recordAiSkillApplied } from '@/api/aiTelemetry';
  import { appendSessionAiTagSelection, replaceSessionAiTagSelection } from '@/utils/aiTagSelection';
  import {
    buildBookmarkCapturePayload,
    resolveBookmarkCaptureReceipt,
    type BookmarkCaptureMode,
    type BookmarkCaptureOperationReceipt,
  } from '@/utils/bookmarkCapture.ts';

  const { t } = useI18n();
  const MAX_TAGS = 4; // 与后端 addBookmark 上限一致

  const loadingUser = ref(true);
  const isLoggedIn = ref(false);
  const userId = ref('');
  const saving = ref(false);
  const saved = ref(false);
  const aiRunning = ref(false);
  const creatingTag = ref('');
  const tagOptions = ref<{ label: string; value: string }[]>([]);
  const aiNewTags = ref<string[]>([]);
  // 保留原入口的正式收藏默认值，避免升级后用户在未留意模式时静默改变保存结果。
  const mode = ref<BookmarkCaptureMode>('formal');
  const operationReceipts = reactive<Partial<Record<BookmarkCaptureMode, BookmarkCaptureOperationReceipt>>>({});
  let aiSelectedTagIds: string[] = [];

  const form = reactive({
    name: '',
    url: '',
    description: '',
    relatedTags: [] as string[],
    saveSnapshot: true,
  });

  function getSafeBookmarkLabel(url: string) {
    if (form.name.trim()) return form.name.trim();
    try {
      return new URL(url).hostname || '未命名书签';
    } catch {
      return '未命名书签';
    }
  }

  function q(name: string) {
    return new URLSearchParams(window.location.search).get(name) || '';
  }
  function onLogoErr(e: Event) {
    (e.target as HTMLImageElement).style.display = 'none';
  }
  function closeWin() {
    window.close();
  }
  function goLogin() {
    const returnPath = window.location.pathname + window.location.search + window.location.hash;
    rememberQuickSaveAuthReturnPath(returnPath);
    window.location.href = '/login?redirect=' + encodeURIComponent(returnPath);
  }

  async function loadTags() {
    try {
      const res = await apiQueryPost('/api/bookmark/queryTagList', { filters: { userId: userId.value } });
      if (res?.status === 200 && Array.isArray(res.data)) {
        tagOptions.value = res.data.map((t: any) => ({ label: t.name, value: t.id }));
      }
    } catch {
      /* 忽略,标签非必填 */
    }
  }

  // AI 建议:抓网页 → 生成名称/描述 + 从已有标签匹配 + 建议新标签(复用现成接口)
  async function runAi() {
    if (mode.value !== 'formal') return;
    const url = String(form.url || '').trim();
    if (!url || aiRunning.value) return;
    aiRunning.value = true;
    try {
      const urlResult = await preflightBookmarkUrl(url, { checkLiveness: false });
      if (!urlResult.ok || !urlResult.url) return;
      form.url = urlResult.url;
      const skillResponse = await executeAiSkill(
        createAiSkillRequest({
          skillId: 'bookmark.parse_url',
          input: { url: form.url },
          surface: 'bookmark.quick_save',
        }),
      );
      if (skillResponse.result?.kind === 'field_suggestions') {
        const generated = (skillResponse.result.fields || {}) as Record<string, any>;
        let applied = false;
        if (!form.name && generated.name) {
          form.name = String(generated.name);
          applied = true;
        }
        if (!form.description && generated.description) {
          form.description = String(generated.description);
          applied = true;
        }
        const valid = new Set(tagOptions.value.map((o) => o.value));
        const matched = (generated.matchedTagIds || []).filter((id: string) => valid.has(id));
        const selection = replaceSessionAiTagSelection({
          currentIds: form.relatedTags,
          previousAiIds: aiSelectedTagIds,
          incomingAiIds: matched,
          cap: MAX_TAGS,
        });
        form.relatedTags = selection.selectedIds;
        aiSelectedTagIds = selection.aiSelectedIds;
        if (selection.changed) {
          applied = true;
        }
        aiNewTags.value = (generated.newTags || []).slice(0, 3);
        if (applied) {
          void recordAiSkillApplied({
            skillId: 'bookmark.parse_url',
            surface: 'bookmark.quick_save',
            resourceType: 'bookmark',
          });
        }
        recordOperation({
          ...OPERATION_LOG_MAP.quickSave.generateMeta,
          operation: `智能识别书签信息成功【${getSafeBookmarkLabel(url)}】`,
        });
        if (skillResponse.result.metadataSource === 'inferred') message.warning(t('bookmarkMeta.inferredWarning'));
      }
    } catch (error: any) {
      if (error?.code === 'AI_QUOTA_EXCEEDED') message.warning(t('quickSave.aiQuotaExceeded'));
      else message.info(t('quickSave.aiFailed'));
    } finally {
      aiRunning.value = false;
    }
  }

  // 建议的新标签:一键创建并选中
  async function createAndSelect(name: string) {
    if (creatingTag.value) return;
    if (form.relatedTags.length >= MAX_TAGS) {
      message.warning(t('quickSave.tagMax'));
      return;
    }
    creatingTag.value = name;
    try {
      const res = await apiBasePost('/api/bookmark/addTag', { name });
      if (res?.status === 200) {
        await loadTags();
        const created = tagOptions.value.find((o) => o.label === name);
        if (created && !form.relatedTags.includes(created.value)) {
          const selection = appendSessionAiTagSelection({
            currentIds: form.relatedTags,
            previousAiIds: aiSelectedTagIds,
            incomingAiIds: [created.value],
            cap: MAX_TAGS,
          });
          form.relatedTags = selection.selectedIds;
          aiSelectedTagIds = selection.aiSelectedIds;
        }
        aiNewTags.value = aiNewTags.value.filter((t) => t !== name);
        recordOperation({
          ...OPERATION_LOG_MAP.quickSave.createSuggestedTag,
          operation: `创建 AI 建议标签成功【${name}】`,
        });
      } else {
        message.info(res?.msg || '新建标签失败');
      }
    } finally {
      creatingTag.value = '';
    }
  }

  async function save() {
    if (saving.value) return;
    if (!form.url.trim()) return message.warning(t('quickSave.needUrl'));
    const selectedMode = mode.value;
    saving.value = true;
    try {
      const urlResult = await preflightBookmarkUrl(form.url, { checkLiveness: true });
      if (!urlResult.ok || !urlResult.url) return;
      form.url = urlResult.url;
      const name = getSafeBookmarkLabel(form.url);
      form.name = name;
      const payload = {
        ...buildBookmarkCapturePayload({
          mode: selectedMode,
          source: 'quick_capture',
          name,
          url: form.url,
          description: form.description,
          relatedTags: form.relatedTags,
          saveSnapshot: form.saveSnapshot,
        }),
        userId: userId.value,
      };
      const receipt = await resolveBookmarkCaptureReceipt({
        current: operationReceipts[selectedMode],
        mode: selectedMode,
        source: 'quick_capture',
        payload,
      });
      operationReceipts[selectedMode] = receipt;
      const res = await apiBasePost('/api/bookmark/addBookmark', { ...payload, idempotencyKey: receipt.key });
      if (res?.status === 200) {
        delete operationReceipts[selectedMode];
        saved.value = true;
        recordOperation({
          ...OPERATION_LOG_MAP.quickSave.save,
          operation:
            selectedMode === 'inbox'
              ? `书签栏快速加入待整理成功【${name}】`
              : `书签栏正式收藏成功【${name}】${form.saveSnapshot ? '（含网页存档）' : ''}`,
        });
        setTimeout(() => window.close(), 1500); // 弹窗由脚本打开,可自动关闭
      } else if (res?.status === 401 || res?.status === 403) {
        isLoggedIn.value = false; // 打开时还在、保存时过期 → 回到登录提示
        message.info(t('quickSave.expired'));
      } else {
        message.info(res?.msg || t('quickSave.failed'));
      }
    } catch (e: any) {
      message.info(e?.message || t('quickSave.failed'));
    } finally {
      saving.value = false;
    }
  }

  onMounted(async () => {
    form.url = q('u');
    form.name = q('t');
    form.description = q('d');
    try {
      const res = await apiBaseGet('/api/user/me');
      const u = res?.data;
      if (u?.id && u.role !== 'visitor') {
        isLoggedIn.value = true;
        userId.value = u.id;
      }
    } catch {
      /* 未登录 */
    } finally {
      loadingUser.value = false;
    }
    if (isLoggedIn.value) {
      await loadTags();
    }
  });
</script>

<style lang="less" scoped>
  .qs-wrap {
    min-height: 100vh;
    display: flex;
    align-items: flex-start;
    justify-content: center;
    background: var(--background-color, #f5f6f8);
    padding: 16px;
    box-sizing: border-box;
  }
  .qs-card {
    width: 100%;
    max-width: 460px;
    background: var(--menu-body-bg-color, #fff);
    border: 1px solid var(--card-border-color, #eee);
    border-radius: 14px;
    padding: 18px 18px 20px;
    box-sizing: border-box;
    color: var(--text-color, #222);
  }
  .qs-head {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 14px;
  }
  .qs-logo {
    width: 24px;
    height: 24px;
    border-radius: 6px;
  }
  .qs-title {
    font-size: 16px;
    font-weight: 700;
  }
  .qs-state {
    padding: 24px 6px;
    text-align: center;
    color: var(--desc-color, #888);
    font-size: 14px;
  }
  .qs-done .qs-check {
    width: 44px;
    height: 44px;
    margin: 0 auto 10px;
    border-radius: 50%;
    background: color-mix(in srgb, var(--primary-color) 16%, transparent);
    color: var(--primary-color);
    font-size: 24px;
    line-height: 44px;
    font-weight: 700;
  }
  .qs-tip {
    margin: 0 0 14px;
  }
  .qs-form {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .qs-mode {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
    margin-bottom: 2px;
  }
  .qs-mode-btn.b_btn {
    width: 100%;
    min-height: 58px;
    height: auto;
    padding: 9px 10px;
    border: 1px solid var(--card-border-color, #e6e9f2);
    border-radius: 11px;
    display: flex;
    flex-direction: column;
    gap: 2px;
    line-height: 1.35;
  }
  .qs-mode-btn strong {
    font-size: 13px;
  }
  .qs-mode-btn small {
    color: var(--desc-color, #888);
    font-size: 11px;
  }
  .qs-mode-btn.active small {
    color: rgba(255, 255, 255, 0.82);
  }
  .qs-mode-hint {
    margin: 0 0 4px;
    padding: 8px 10px;
    border-left: 3px solid var(--primary-color, #615ced);
    border-radius: 8px;
    color: var(--desc-color, #777);
    background: var(--surface-panel-bg, #f6f7fb);
    font-size: 11px;
    line-height: 1.55;
  }
  .qs-label {
    font-size: 12px;
    font-weight: 600;
    color: var(--desc-color, #888);
    margin-top: 4px;
  }
  .qs-label-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-top: 4px;
  }
  .qs-ai-hint {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-size: 12px;
    color: var(--primary-color);
  }
  .qs-ai-btn {
    border: 0;
    background: transparent;
    color: var(--primary-color);
    font-size: 12px;
    cursor: pointer;
    padding: 0;
    height: auto;
    line-height: 1;
    gap: 4px;
  }
  .qs-newtags {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
  }
  .qs-newtags-label {
    font-size: 11px;
    color: var(--desc-color, #999);
  }
  .qs-check-line {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 13px;
    margin-top: 8px;
    cursor: pointer;
  }
  .qs-save {
    margin-top: 14px;
    width: 100%;
  }
</style>
