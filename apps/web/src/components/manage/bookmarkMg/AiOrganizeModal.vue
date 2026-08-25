<template>
  <BModal v-model:visible="visible" :title="$t('bookmarkMg.aiOrganizeTitle')" :show-footer="false" width="600px">
    <div class="aio">
      <!-- 确认额度 -->
      <template v-if="step === 'confirm'">
        <p class="aio-hint">{{
          isSelectedScope
            ? $t(
                resourceType === 'note'
                  ? 'bookmarkMg.aiOrganizeSelectedIntroNote'
                  : 'bookmarkMg.aiOrganizeSelectedIntro',
                { n: selectedOriginalCount },
              )
            : resourceType === 'note'
              ? $t('bookmarkMg.aiOrganizeIntroNote')
              : $t('bookmarkMg.aiOrganizeIntro')
        }}</p>
        <div v-if="quoteLoading" class="aio-center aio-muted">…</div>
        <template v-else-if="quote">
          <div v-if="quote.candidateTotal === 0" class="aio-center aio-muted">
            {{ $t(isSelectedScope ? 'bookmarkMg.aiOrganizeSelectedNone' : 'bookmarkMg.aiOrganizeNone') }}
            <div v-if="isSelectedScope && quote.requestTruncated" class="aio-actions aio-actions--center">
              <BButton size="small" @click="skipSelectedBatch">
                {{ $t('bookmarkMg.aiOrganizeSelectedContinue', { n: selectedRemainingAfterQuote }) }}
              </BButton>
            </div>
          </div>
          <template v-else>
            <ul class="aio-stat">
              <li>
                {{
                  $t(isSelectedScope ? 'bookmarkMg.aiOrganizeSelectedCand' : 'bookmarkMg.aiOrganizeCand', {
                    n: quote.candidateTotal,
                  })
                }}
              </li>
              <li>
                {{ $t('bookmarkMg.aiOrganizeThisRunQuota', { n: quote.batchCap }) }}
                <span v-if="quote.candidateTotal > quote.batchCap || quote.requestTruncated" class="aio-muted">
                  ·
                  {{
                    isSelectedScope
                      ? $t('bookmarkMg.aiOrganizeSelectedBatchHint', { n: selectedRemainingAfterQuote })
                      : $t('bookmarkMg.aiOrganizeBatchHint')
                  }}</span
                >
              </li>
            </ul>
            <div class="aio-actions">
              <BButton type="primary" :disabled="!quote.canRun" @click="run">{{
                $t('bookmarkMg.aiOrganizeStart')
              }}</BButton>
            </div>
          </template>
        </template>
        <div v-else class="aio-center aio-muted">
          <p>{{ $t('bookmarkMg.aiOrganizeQuoteFailed') }}</p>
          <div class="aio-actions aio-actions--center">
            <BButton size="small" @click="loadQuote">{{ $t('bookmarkMg.aiOrganizeRetry') }}</BButton>
          </div>
        </div>
      </template>

      <!-- 运行中 -->
      <div v-else-if="step === 'running'" class="aio-center">
        <div class="aio-spin"></div>
        <p>{{ $t('bookmarkMg.aiOrganizeRunning') }}</p>
      </div>

      <!-- 复审 -->
      <template v-else-if="step === 'review'">
        <div v-if="isReadonlyAdminContext" class="aio-admin-notice">
          {{ $t('bookmarkMg.aiOrganizeReadonlyNotice') }}
        </div>
        <div class="aio-review-head">
          <span>{{ $t('bookmarkMg.aiOrganizeReview', { n: chosenCount }) }}</span>
          <BCheckbox v-if="resourceType === 'bookmark'" v-model:checked="fillMeta" class="aio-fill">
            {{ $t('bookmarkMg.aiOrganizeFillMeta') }}
          </BCheckbox>
        </div>
        <p v-if="hasSelectedNewTags" class="aio-new-tag-hint">
          {{ $t('bookmarkMg.aiOrganizeNewTagHint') }}
        </p>
        <div class="aio-list">
          <div v-for="s in suggestions" :key="s.id" class="aio-item" :class="{ off: !s.include }">
            <BCheckbox v-model:checked="s.include" class="aio-item-head">
              <span class="aio-item-name" :title="s.url">{{ s.currentName || s.suggestName || s.url }}</span>
            </BCheckbox>
            <div class="aio-tags">
              <ResourceTagChip
                v-for="mt in s.matchedTags"
                :key="mt.id"
                class="aio-tag"
                :tag="mt"
                size="medium"
                interactive
                :selected="s.pickTags.includes(mt.id)"
                @click="toggle(s.pickTags, mt.id)"
              />
              <ResourceTagChip
                v-for="nt in s.newTags"
                :key="'n' + nt"
                class="aio-tag aio-tag--new"
                :tag="{ name: `＋ ${nt}` }"
                size="medium"
                interactive
                :selected="s.pickNew.includes(nt)"
                @click="toggle(s.pickNew, nt)"
              />
              <span v-if="!s.matchedTags.length && !s.newTags.length" class="aio-muted">{{
                $t('bookmarkMg.aiOrganizeNoTag')
              }}</span>
            </div>
          </div>
        </div>
        <div class="aio-actions">
          <BButton
            type="primary"
            :loading="applying"
            :disabled="isReadonlyAdminContext || applying || !chosenCount"
            @click="apply"
          >
            {{ $t('bookmarkMg.aiOrganizeApply', { n: chosenCount }) }}
          </BButton>
        </div>
      </template>

      <!-- 完成 -->
      <div v-else-if="step === 'done'" class="aio-center aio-done">
        <div class="aio-check">✓</div>
        <p>{{
          $t(resourceType === 'note' ? 'bookmarkMg.aiOrganizeDoneMsgNote' : 'bookmarkMg.aiOrganizeDoneMsg', {
            n: appliedCount,
          })
        }}</p>
        <div class="aio-actions" style="justify-content: center">
          <BButton v-if="!isSelectedScope || selectedQueue.length" size="small" @click="continueOrganize">
            {{
              $t(isSelectedScope ? 'bookmarkMg.aiOrganizeSelectedContinue' : 'bookmarkMg.aiOrganizeContinue', {
                n: selectedQueue.length,
              })
            }}
          </BButton>
          <BButton size="small" type="primary" @click="close">{{ $t('bookmarkMg.aiOrganizeClose') }}</BButton>
        </div>
      </div>
    </div>
  </BModal>
</template>

<script lang="ts" setup>
  import { computed, ref, watch } from 'vue';
  import { useI18n } from 'vue-i18n';
  import { apiBasePost } from '@/http/request.ts';
  import message from '@/components/base/BasicComponents/BMessage/BMessage.ts';
  import BModal from '@/components/base/BasicComponents/BModal/BModal.vue';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BCheckbox from '@/components/base/BasicComponents/BCheckbox.vue';
  import { recordOperation } from '@/api/commonApi.ts';
  import { useUserStore } from '@/store';
  import ResourceTagChip from '@/components/tag/ResourceTagChip.vue';

  const visible = defineModel<boolean>('visible');
  const props = defineProps<{ initType?: 'bookmark' | 'note'; selectedIds?: string[] }>();
  const emit = defineEmits<{ (e: 'applied'): void }>();
  const { t } = useI18n();
  const user = useUserStore();
  const isReadonlyAdminContext = computed(() => user.adminContext?.mode === 'readonly');

  const resourceType = ref<'bookmark' | 'note'>('bookmark');

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
  const selectedMode = ref(false);
  const selectedOriginalCount = ref(0);
  const selectedQueue = ref<string[]>([]);

  const chosenCount = computed(() => suggestions.value.filter((s) => s.include).length);
  const hasSelectedNewTags = computed(() =>
    suggestions.value.some((suggestion) => suggestion.include && suggestion.pickNew.length > 0),
  );
  const isSelectedScope = computed(() => selectedMode.value);
  const selectedRemainingAfterQuote = computed(() =>
    Math.max(0, Number(quote.value?.requestedTotal || 0) - Number(quote.value?.requestIds?.length || 0)),
  );

  function normalizeSelectedIds(value: string[] | undefined) {
    return [...new Set((value || []).map((id) => String(id || '').trim()).filter(Boolean))];
  }

  function toggle(arr: string[], v: string) {
    const i = arr.indexOf(v);
    if (i >= 0) arr.splice(i, 1);
    else arr.push(v);
  }

  function useSuggestions(rows: unknown) {
    suggestions.value = (Array.isArray(rows) ? rows : []).map((s: any) => ({
      ...s,
      include: true,
      pickTags: (s.matchedTags || []).map((tag: any) => tag.id),
      pickNew: [...(s.newTags || [])],
    }));
    if (!suggestions.value.length) {
      appliedCount.value = 0;
      consumeSelectedRequest();
      step.value = 'done';
      return;
    }
    step.value = 'review';
  }

  async function loadQuote() {
    quote.value = null;
    quoteLoading.value = true;
    try {
      const res = await apiBasePost(
        '/api/bookmark/ai/organize/quote',
        {
          scope: isSelectedScope.value ? 'selected' : 'untagged',
          ids: isSelectedScope.value ? selectedQueue.value : undefined,
          resourceType: resourceType.value,
        },
        { silent: true },
      );
      if (res?.status === 200) quote.value = res.data;
    } catch {
      quote.value = null;
      message.error(t('bookmarkMg.aiOrganizeQuoteFailed'));
    } finally {
      quoteLoading.value = false;
    }
  }

  async function run() {
    if (!quote.value?.batchIds?.length) return;
    step.value = 'running';
    try {
      const res = await apiBasePost(
        '/api/bookmark/ai/organize/run',
        {
          ids: quote.value.batchIds,
          resourceType: resourceType.value,
        },
        { silent: true },
      );
      if (res?.status === 200 && res.data?.ok) {
        const processed = Number(res.data?.processed || 0);
        recordOperation({
          module: resourceType.value === 'note' ? '笔记库' : '书签管理',
          operation: res.data?.partial
            ? `智能打标签部分完成【建议${processed}项，失败${Number(res.data?.failedItems || 0)}项】`
            : `智能打标签生成建议成功【${processed}项】`,
        });
        useSuggestions(res.data.suggestions);
        if (res.data?.partial) {
          message.warning(t('bookmarkMg.aiOrganizePartialFailure', { n: Number(res.data?.failedItems || 0) }));
        }
      } else {
        message.info(res?.data?.msg || res?.msg || t('bookmarkMg.aiOrganizeRunFailed'));
        step.value = 'confirm';
      }
    } catch (e: any) {
      const partialSuggestions = Array.isArray(e?.data?.suggestions) ? e.data.suggestions : [];
      if (e?.status === 429 && partialSuggestions.length) {
        useSuggestions(partialSuggestions);
        message.warning(t('bookmarkMg.aiOrganizePartialQuota', { n: partialSuggestions.length }));
        return;
      }
      message.info(e?.message || t('bookmarkMg.aiOrganizeRunFailed'));
      step.value = 'confirm';
    }
  }

  async function apply() {
    if (isReadonlyAdminContext.value || applying.value) return;
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
      const res = await apiBasePost(
        '/api/bookmark/ai/organize/apply',
        { items, resourceType: resourceType.value },
        { silent: true },
      );
      if (res?.status === 200) {
        appliedCount.value = res.data?.applied || 0;
        if (appliedCount.value > 0) {
          recordOperation({
            module: resourceType.value === 'note' ? '笔记库' : '书签管理',
            operation: `应用智能打标签结果成功【${appliedCount.value}项】`,
          });
        }
        consumeSelectedRequest();
        step.value = 'done';
        emit('applied');
      } else {
        message.info(res?.msg || t('bookmarkMg.aiOrganizeApplyFailed'));
      }
    } catch {
      message.error(t('bookmarkMg.aiOrganizeApplyFailed'));
    } finally {
      applying.value = false;
    }
  }

  function close() {
    visible.value = false;
  }

  function consumeSelectedRequest() {
    if (!isSelectedScope.value) return;
    const consumedIds = new Set(
      (Array.isArray(quote.value?.requestIds) ? quote.value.requestIds : []).map((id: unknown) => String(id)),
    );
    if (!consumedIds.size) return;
    selectedQueue.value = selectedQueue.value.filter((id) => !consumedIds.has(id));
  }

  function skipSelectedBatch() {
    consumeSelectedRequest();
    continueOrganize();
  }

  // 完成后继续整理下一批(重新预估,反映已减少的未打标签数)
  function continueOrganize() {
    step.value = 'confirm';
    quote.value = null;
    suggestions.value = [];
    appliedCount.value = 0;
    void loadQuote();
  }

  watch(
    visible,
    (v) => {
      if (v) {
        resourceType.value = props.initType || 'bookmark';
        selectedQueue.value = normalizeSelectedIds(props.selectedIds);
        selectedMode.value = selectedQueue.value.length > 0;
        selectedOriginalCount.value = selectedQueue.value.length;
        step.value = 'confirm';
        quote.value = null;
        suggestions.value = [];
        appliedCount.value = 0;
        fillMeta.value = true;
        void loadQuote();
      }
    },
    { immediate: true },
  );
</script>

<style lang="less" scoped>
  /* BModal 外框固定为桌面 600px、窄屏由其 max-width 自动收缩；内容只填充可用内宽，不能反向撑大外框。 */
  .aio {
    width: 100%;
    max-width: 100%;
    min-width: 0;
    box-sizing: border-box;
  }
  .aio-admin-notice {
    margin-bottom: 12px;
    padding: 10px 12px;
    border: 1px solid color-mix(in srgb, var(--primary-color) 30%, transparent);
    border-radius: 10px;
    background: color-mix(in srgb, var(--primary-color) 7%, var(--workbench-subcard-bg));
    color: var(--desc-color);
    font-size: 13px;
    line-height: 1.55;
  }
  .aio-hint {
    margin: 0 0 12px;
    font-size: 13px;
    line-height: 1.6;
    color: var(--desc-color);
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
    width: 100%;
    min-width: 0;
    display: flex;
    align-items: center;
    justify-content: flex-end;
    flex-wrap: wrap;
    gap: 12px;
    margin-top: 12px;
    box-sizing: border-box;
  }
  .aio-actions :deep(.b_btn) {
    max-width: 100%;
  }
  .aio-actions--center {
    justify-content: center;
  }

  @media (max-width: 767px) {
    .aio-actions {
      padding-top: 10px;
      border-top: 1px solid var(--surface-divider-color);
    }

    .aio-actions :deep(.b_btn) {
      min-height: var(--mobile-touch-size, 44px);
    }
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
    min-width: 0;
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 8px;
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
  .aio-new-tag-hint {
    margin: 0 0 8px;
    color: var(--desc-color);
    font-size: 12px;
    line-height: 1.5;
  }
  .aio-list {
    width: 100%;
    min-width: 0;
    max-height: 46vh;
    overflow-y: auto;
    overflow-x: hidden;
    display: flex;
    flex-direction: column;
    gap: 8px;
    box-sizing: border-box;
  }
  .aio-item {
    width: 100%;
    min-width: 0;
    // 必须禁止收缩：父级是 column flex + max-height，默认 flex-shrink:1 会在建议条数多到
    // 超过 46vh 时把每一项等比压扁，再被下面的 overflow:hidden 裁掉——现象是标签行整行消失、
    // 标题也被切掉半截。条数少时不触发，所以很容易被当成数据没返回标签。
    flex-shrink: 0;
    border: 1px solid var(--card-border-color);
    border-radius: 10px;
    padding: 10px 12px;
    box-sizing: border-box;
    overflow: hidden;
    transition: opacity 0.15s;
  }
  .aio-item.off {
    opacity: 0.45;
  }
  .aio-item-head {
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 8px;
    cursor: pointer;
    margin-bottom: 8px;
  }
  .aio-item-name {
    font-size: 13px;
    font-weight: 600;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .aio-tags {
    min-width: 0;
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    padding-left: 22px;
    box-sizing: border-box;
  }
  .aio-tag {
    max-width: 100%;
    height: 26px;
  }
  .aio-tag--new {
    border-style: dashed;
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
