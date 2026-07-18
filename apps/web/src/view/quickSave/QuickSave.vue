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
        <p>{{ $t('quickSave.saved') }}</p>
        <BButton size="small" @click="closeWin">{{ $t('quickSave.close') }}</BButton>
      </div>

      <!-- 表单 -->
      <div v-else class="qs-form">
        <label class="qs-label">{{ $t('quickSave.name') }}</label>
        <BInput v-model:value="form.name" :placeholder="$t('quickSave.namePh')" />

        <label class="qs-label">{{ $t('quickSave.url') }}</label>
        <BInput v-model:value="form.url" :placeholder="$t('quickSave.urlPh')" />

        <label class="qs-label">{{ $t('quickSave.desc') }}</label>
        <BInput v-model:value="form.description" :placeholder="$t('quickSave.descPh')" />

        <div class="qs-label-row">
          <label class="qs-label" style="margin: 0">{{ $t('quickSave.tags') }}</label>
          <span v-if="aiRunning" class="qs-ai-hint">🤖 {{ $t('quickSave.aiRunning') }}</span>
          <BButton v-else class="qs-ai-btn" @click="runAi('manual')">🤖 {{ $t('quickSave.aiRedo') }}</BButton>
        </div>
        <BSelect
          mode="multiple"
          :max-tag-count="4"
          :options="tagOptions"
          :placeholder="$t('quickSave.tagsPh')"
          :show-search="true"
          v-model:value="form.relatedTags"
        />
        <div v-if="aiNewTags.length" class="qs-newtags">
          <span class="qs-newtags-label">{{ $t('quickSave.aiNewTags') }}</span>
          <BButton
            v-for="nt in aiNewTags"
            :key="nt"
            class="qs-newtag"
            :disabled="creatingTag === nt"
            @click="createAndSelect(nt)"
          >
            ＋ {{ nt }}
          </BButton>
        </div>

        <BCheckbox v-model="form.saveSnapshot" class="qs-check-line">
          {{ $t('quickSave.saveSnapshot') }}
        </BCheckbox>

        <BButton class="qs-save" type="primary" :loading="saving" :disabled="saving" @click="save">
          {{ saving ? $t('quickSave.saving') : $t('quickSave.save') }}
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
  import BCheckbox from '@/components/base/BasicComponents/BCheckbox.vue';
  import { useI18n } from 'vue-i18n';
  import { recordOperation } from '@/api/commonApi.ts';
  import { OPERATION_LOG_MAP } from '@/config/logMap.ts';
  import { preflightBookmarkUrl } from '@/composables/useBookmarkUrlResolution';

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
    // 记住回跳目标,登录后可手动再点收藏(或返回此页)
    window.location.href = '/login?redirect=' + encodeURIComponent(window.location.pathname + window.location.search);
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
  async function runAi(source: 'auto' | 'manual' = 'manual') {
    const url = String(form.url || '').trim();
    if (!url || aiRunning.value) return;
    aiRunning.value = true;
    try {
      const urlResult = await preflightBookmarkUrl(url, { checkLiveness: false });
      if (!urlResult.ok || !urlResult.url) return;
      form.url = urlResult.url;
      const res = await apiBasePost('/api/chat/generateBookmarkMeta', { url: form.url });
      if (res?.status === 200 && res.data) {
        if (!form.name && res.data.name) form.name = res.data.name;
        if (!form.description && res.data.description) form.description = res.data.description;
        const valid = new Set(tagOptions.value.map((o) => o.value));
        const matched = (res.data.matchedTagIds || []).filter((id: string) => valid.has(id));
        if (matched.length) {
          form.relatedTags = Array.from(new Set([...form.relatedTags, ...matched])).slice(0, MAX_TAGS);
        }
        aiNewTags.value = (res.data.newTags || []).slice(0, 3);
        recordOperation({
          ...OPERATION_LOG_MAP.quickSave.generateMeta,
          operation: `${source === 'auto' ? '自动' : '重新'}智能识别书签信息成功【${getSafeBookmarkLabel(url)}】`,
        });
        if (res.data.metadataSource === 'inferred') message.warning(t('bookmarkMeta.inferredWarning'));
      }
    } catch {
      /* AI 失败静默,用户仍可手动填 */
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
          form.relatedTags = [...form.relatedTags, created.value].slice(0, MAX_TAGS);
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
    if (!form.name.trim()) return message.warning(t('quickSave.needName'));
    if (!form.url.trim()) return message.warning(t('quickSave.needUrl'));
    saving.value = true;
    try {
      const urlResult = await preflightBookmarkUrl(form.url, { checkLiveness: true });
      if (!urlResult.ok || !urlResult.url) return;
      form.url = urlResult.url;
      const res = await apiBasePost('/api/bookmark/addBookmark', {
        name: form.name.trim(),
        url: form.url.trim(),
        description: form.description.trim(),
        relatedTags: form.relatedTags,
        userId: userId.value,
        saveSnapshot: form.saveSnapshot,
      });
      if (res?.status === 200) {
        saved.value = true;
        recordOperation({
          ...OPERATION_LOG_MAP.quickSave.save,
          operation: `一键收藏书签成功【${form.name.trim()}】${form.saveSnapshot ? '（含网页存档）' : ''}`,
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
      runAi('auto');
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
  .qs-newtag {
    border: 1px dashed color-mix(in srgb, var(--primary-color) 40%, transparent);
    background: color-mix(in srgb, var(--primary-color) 8%, transparent);
    color: var(--primary-color);
    border-radius: 20px;
    padding: 2px 10px;
    font-size: 12px;
    cursor: pointer;
  }
  .qs-newtag:disabled {
    opacity: 0.5;
    cursor: default;
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
