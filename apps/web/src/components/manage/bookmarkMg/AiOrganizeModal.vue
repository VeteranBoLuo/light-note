<template>
  <BModal v-model:visible="visible" :title="$t('bookmarkMg.aiOrganizeTitle')" :show-footer="false" width="auto">
    <div class="aio">
      <!-- 确认额度 -->
      <template v-if="step === 'confirm'">
        <div class="aio-seg">
          <button type="button" class="aio-seg-btn" :class="{ active: resourceType === 'bookmark' }" @click="switchType('bookmark')">
            {{ $t('bookmarkMg.aiOrganizeBookmarks') }}
          </button>
          <button type="button" class="aio-seg-btn" :class="{ active: resourceType === 'note' }" @click="switchType('note')">
            {{ $t('bookmarkMg.aiOrganizeNotes') }}
          </button>
        </div>
        <p class="aio-hint">{{ resourceType === 'note' ? $t('bookmarkMg.aiOrganizeIntroNote') : $t('bookmarkMg.aiOrganizeIntro') }}</p>
        <div v-if="quoteLoading" class="aio-center aio-muted">…</div>
        <template v-else-if="quote">
          <div v-if="quote.candidateTotal === 0" class="aio-center aio-muted">{{ $t('bookmarkMg.aiOrganizeNone') }}</div>
          <template v-else>
            <ul class="aio-stat">
              <li>{{ $t('bookmarkMg.aiOrganizeCand', { n: quote.candidateTotal }) }}</li>
              <li>
                {{ $t('bookmarkMg.aiOrganizeThisRunFree', { n: quote.batchCap }) }}
                <span v-if="quote.candidateTotal > quote.batchCap" class="aio-muted"> · {{ $t('bookmarkMg.aiOrganizeBatchHint') }}</span>
              </li>
            </ul>
            <div class="aio-actions">
              <BButton type="primary" :disabled="!quote.canRun" @click="run">{{ $t('bookmarkMg.aiOrganizeStart') }}</BButton>
            </div>
          </template>
        </template>
      </template>

      <!-- 运行中 -->
      <div v-else-if="step === 'running'" class="aio-center">
        <div class="aio-spin"></div>
        <p>{{ $t('bookmarkMg.aiOrganizeRunning') }}</p>
      </div>

      <!-- 复审 -->
      <template v-else-if="step === 'review'">
        <div class="aio-review-head">
          <span>{{ $t('bookmarkMg.aiOrganizeReview', { n: chosenCount }) }}</span>
          <label v-if="resourceType === 'bookmark'" class="aio-fill"><input type="checkbox" v-model="fillMeta" /> {{ $t('bookmarkMg.aiOrganizeFillMeta') }}</label>
        </div>
        <div class="aio-list">
          <div v-for="s in suggestions" :key="s.id" class="aio-item" :class="{ off: !s.include }">
            <label class="aio-item-head">
              <input type="checkbox" v-model="s.include" />
              <span class="aio-item-name" :title="s.url">{{ s.currentName || s.suggestName || s.url }}</span>
            </label>
            <div class="aio-tags">
              <button
                v-for="mt in s.matchedTags"
                :key="mt.id"
                type="button"
                class="aio-tag"
                :class="{ sel: s.pickTags.includes(mt.id) }"
                @click="toggle(s.pickTags, mt.id)"
              >
                {{ mt.name }}
              </button>
              <button
                v-for="nt in s.newTags"
                :key="'n' + nt"
                type="button"
                class="aio-tag aio-tag--new"
                :class="{ sel: s.pickNew.includes(nt) }"
                @click="toggle(s.pickNew, nt)"
              >
                {{ nt }}
              </button>
              <span v-if="!s.matchedTags.length && !s.newTags.length" class="aio-muted">{{ $t('bookmarkMg.aiOrganizeNoTag') }}</span>
            </div>
          </div>
        </div>
        <div class="aio-actions">
          <BButton type="primary" :loading="applying" :disabled="applying || !chosenCount" @click="apply">
            {{ $t('bookmarkMg.aiOrganizeApply', { n: chosenCount }) }}
          </BButton>
        </div>
      </template>

      <!-- 完成 -->
      <div v-else-if="step === 'done'" class="aio-center aio-done">
        <div class="aio-check">✓</div>
        <p>{{ $t('bookmarkMg.aiOrganizeDoneMsg', { n: appliedCount }) }}</p>
        <div class="aio-actions" style="justify-content: center">
          <BButton size="small" @click="continueOrganize">{{ $t('bookmarkMg.aiOrganizeContinue') }}</BButton>
          <BButton size="small" type="primary" @click="close">{{ $t('bookmarkMg.aiOrganizeClose') }}</BButton>
        </div>
      </div>
    </div>
  </BModal>
</template>

<script lang="ts" setup>
  import { computed, ref, watch } from 'vue';
  import { apiBasePost } from '@/http/request.ts';
  import message from '@/components/base/BasicComponents/BMessage/BMessage.ts';
  import BModal from '@/components/base/BasicComponents/BModal/BModal.vue';
  import BButton from '@/components/base/BasicComponents/BButton.vue';

  const visible = defineModel<boolean>('visible');
  const props = defineProps<{ initType?: 'bookmark' | 'note' }>();
  const emit = defineEmits<{ (e: 'applied'): void }>();

  const resourceType = ref<'bookmark' | 'note'>('bookmark');
  function switchType(t: 'bookmark' | 'note') {
    if (t === resourceType.value) return;
    resourceType.value = t;
    quote.value = null;
    suggestions.value = [];
    loadQuote();
  }

  type Sug = {
    id: string;
    url: string;
    currentName: string;
    currentDesc: string;
    suggestName: string;
    suggestDesc: string;
    matchedTags: { id: string; name: string }[];
    newTags: string[];
    include: boolean;
    pickTags: string[];
    pickNew: string[];
  };

  const step = ref<'confirm' | 'running' | 'review' | 'done'>('confirm');
  const quoteLoading = ref(false);
  const quote = ref<any>(null);
  const suggestions = ref<Sug[]>([]);
  const fillMeta = ref(true);
  const applying = ref(false);
  const appliedCount = ref(0);

  const chosenCount = computed(() => suggestions.value.filter((s) => s.include).length);

  function toggle(arr: string[], v: string) {
    const i = arr.indexOf(v);
    if (i >= 0) arr.splice(i, 1);
    else arr.push(v);
  }

  async function loadQuote() {
    quoteLoading.value = true;
    try {
      const res = await apiBasePost('/api/bookmark/ai/organize/quote', { scope: 'untagged', resourceType: resourceType.value });
      if (res?.status === 200) quote.value = res.data;
    } finally {
      quoteLoading.value = false;
    }
  }

  async function run() {
    if (!quote.value?.batchIds?.length) return;
    step.value = 'running';
    try {
      const res = await apiBasePost('/api/bookmark/ai/organize/run', { ids: quote.value.batchIds, resourceType: resourceType.value });
      if (res?.status === 200 && res.data?.ok) {
        suggestions.value = (res.data.suggestions || []).map((s: any) => ({
          ...s,
          include: true,
          pickTags: (s.matchedTags || []).map((t: any) => t.id),
          pickNew: [...(s.newTags || [])],
        }));
        if (!suggestions.value.length) {
          appliedCount.value = 0;
          step.value = 'done';
        } else {
          step.value = 'review';
        }
      } else {
        message.info(res?.data?.msg || res?.msg || 'AI 整理失败');
        step.value = 'confirm';
      }
    } catch (e: any) {
      message.info(e?.message || 'AI 整理失败');
      step.value = 'confirm';
    }
  }

  async function apply() {
    if (applying.value) return;
    const items = suggestions.value
      .filter((s) => s.include)
      .map((s) => ({
        id: s.id,
        tagIds: s.pickTags,
        newTagNames: s.pickNew,
        name: fillMeta.value && !s.currentName ? s.suggestName : undefined,
        description: fillMeta.value && !s.currentDesc ? s.suggestDesc : undefined,
      }));
    if (!items.length) return;
    applying.value = true;
    try {
      const res = await apiBasePost('/api/bookmark/ai/organize/apply', { items, resourceType: resourceType.value });
      if (res?.status === 200) {
        appliedCount.value = res.data?.applied || 0;
        step.value = 'done';
        emit('applied');
      } else {
        message.info(res?.msg || '应用失败');
      }
    } finally {
      applying.value = false;
    }
  }

  function close() {
    visible.value = false;
  }

  // 完成后继续整理下一批(重新预估,反映已减少的未打标签数)
  function continueOrganize() {
    step.value = 'confirm';
    quote.value = null;
    suggestions.value = [];
    appliedCount.value = 0;
    loadQuote();
  }

  watch(visible, (v) => {
    if (v) {
      resourceType.value = props.initType || 'bookmark';
      step.value = 'confirm';
      quote.value = null;
      suggestions.value = [];
      appliedCount.value = 0;
      fillMeta.value = true;
      loadQuote();
    }
  });
</script>

<style lang="less" scoped>
  /* 定宽约束 BModal 的 min-width:max-content,防长内容撑爆 */
  .aio {
    width: 560px;
    max-width: 88vw;
    box-sizing: border-box;
  }
  .aio-hint {
    margin: 0 0 12px;
    font-size: 13px;
    line-height: 1.6;
    color: var(--desc-color);
  }
  .aio-seg {
    display: inline-flex;
    background: var(--bl-input-noBorder-bg-color, rgba(0, 0, 0, 0.05));
    border-radius: 8px;
    padding: 3px;
    margin-bottom: 12px;
  }
  .aio-seg-btn {
    border: 0;
    background: transparent;
    color: var(--desc-color);
    padding: 5px 18px;
    font-size: 13px;
    border-radius: 6px;
    cursor: pointer;
    transition: all 0.15s;
  }
  .aio-seg-btn.active {
    background: var(--menu-body-bg-color, #fff);
    color: var(--text-color);
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
    font-weight: 600;
  }
  .aio-muted {
    color: var(--desc-color);
    font-size: 12px;
  }
  .aio-center {
    text-align: center;
    padding: 24px 8px;
  }
  .aio-stat {
    margin: 0 0 14px;
    padding-left: 18px;
    font-size: 14px;
    line-height: 1.9;
  }
  .aio-actions {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 12px;
    margin-top: 12px;
  }
  .aio-spin {
    width: 34px;
    height: 34px;
    margin: 0 auto 12px;
    border-radius: 50%;
    border: 3px solid color-mix(in srgb, var(--primary-color) 18%, transparent);
    border-top-color: var(--primary-color);
    animation: aio-rot 0.9s linear infinite;
  }
  @keyframes aio-rot {
    to {
      transform: rotate(360deg);
    }
  }
  .aio-review-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 8px;
    font-size: 13px;
    font-weight: 600;
  }
  .aio-fill {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    font-weight: 400;
    font-size: 12px;
    color: var(--desc-color);
    cursor: pointer;
  }
  .aio-fill input {
    accent-color: var(--primary-color);
  }
  .aio-list {
    max-height: 46vh;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .aio-item {
    border: 1px solid var(--card-border-color);
    border-radius: 10px;
    padding: 10px 12px;
    transition: opacity 0.15s;
  }
  .aio-item.off {
    opacity: 0.45;
  }
  .aio-item-head {
    display: flex;
    align-items: center;
    gap: 8px;
    cursor: pointer;
    margin-bottom: 8px;
  }
  .aio-item-head input {
    accent-color: var(--primary-color);
    flex-shrink: 0;
  }
  .aio-item-name {
    font-size: 13px;
    font-weight: 600;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .aio-tags {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    padding-left: 22px;
  }
  .aio-tag {
    border: 1px solid var(--card-border-color);
    background: transparent;
    color: var(--desc-color);
    border-radius: 20px;
    padding: 3px 12px;
    font-size: 12px;
    cursor: pointer;
    transition: all 0.15s;
  }
  .aio-tag--new {
    border-style: dashed;
  }
  .aio-tag.sel {
    color: var(--resource-bookmark-color);
    border-color: var(--resource-bookmark-color);
    background: color-mix(in srgb, var(--resource-bookmark-color) 14%, transparent);
    font-weight: 600;
  }
  .aio-tag--new.sel {
    color: var(--primary-color);
    border-color: var(--primary-color);
    background: color-mix(in srgb, var(--primary-color) 14%, transparent);
  }
  .aio-done .aio-check {
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
</style>
