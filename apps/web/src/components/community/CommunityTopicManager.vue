<template>
  <BModal
    :visible="true"
    :title="t('community.feed.manageTopics')"
    width="min(var(--ui-layout-720, 720px), 94vw)"
    :show-footer="false"
    :mask-closable="!busy"
    :close-disabled="busy"
    @close="$emit('close')"
  >
    <div class="topic-manager">
      <p class="topic-manager-hint">{{ t('community.feed.manageTopicsHint') }}</p>
      <p v-if="error" role="alert"
        >{{ t('community.feed.error') }}
        <BButton v-if="!draft" @click="load">{{ t('community.feed.retry') }}</BButton></p
      >
      <BLoading :loading="loading" :title="t('community.feed.loading')">
        <template v-if="!draft">
          <div class="topic-list-toolbar">
            <div class="topic-list-summary">
              <BButton @click="campaignManager = true">{{ t('community.feed.rechargeManagement') }}</BButton>
              <span class="topic-state is-public"
                >{{ t('community.feed.topicPublic') }} {{ topics.filter((item) => item.enabled).length }}</span
              >
              <span class="topic-state is-hidden"
                >{{ t('community.feed.topicDisabled') }} {{ topics.filter((item) => !item.enabled).length }}</span
              >
            </div>
            <BButton type="primary" :disabled="!writable" @click="edit()">{{ t('community.feed.newTopic') }}</BButton>
          </div>
          <div v-for="topic in topics" :key="topic.slug" class="topic-manager-row">
            <div class="topic-row-copy">
              <div class="topic-row-title">
                <strong># {{ locale.startsWith('en') ? topic.nameEn : topic.nameZh }}</strong>
                <span class="topic-state" :class="topic.enabled ? 'is-public' : 'is-hidden'">
                  <i aria-hidden="true"></i
                  >{{ t(topic.enabled ? 'community.feed.topicPublic' : 'community.feed.topicDisabled') }}
                </span>
              </div>
              <div class="topic-row-meta">
                <span>{{ locale.startsWith('en') ? topic.nameZh : topic.nameEn }}</span>
                <small v-if="topic.postTask">{{ t('community.feed.postTask') }}</small>
                <small v-if="topic.officialPinned">{{ t('community.feed.officialPinned') }}</small>
              </div>
            </div>
            <BButton class="topic-row-edit" :disabled="!writable" @click="edit(topic)">{{
              t('community.feed.edit')
            }}</BButton>
          </div>
        </template>
        <form v-else class="topic-form" @submit.prevent="save">
          <img
            v-if="communityTopicCover(draft.slug)"
            class="topic-cover-preview"
            :src="communityTopicCover(draft.slug)"
            alt=""
          />
          <label
            >{{ t('community.feed.topicSlug') }}<BInput v-model:value="draft.slug" :disabled="busy || existing"
          /></label>
          <div class="topic-form-pair"
            ><label>{{ t('community.feed.topicNameZh') }}<BInput v-model:value="draft.nameZh" :disabled="busy" /></label
            ><label>{{ t('community.feed.topicNameEn') }}<BInput v-model:value="draft.nameEn" :disabled="busy" /></label
          ></div>
          <label
            >{{ t('community.feed.topicDescriptionZh')
            }}<BInput v-model:value="draft.descriptionZh" type="textarea" :rows="3" :disabled="busy"
          /></label>
          <label
            >{{ t('community.feed.topicDescriptionEn')
            }}<BInput v-model:value="draft.descriptionEn" type="textarea" :rows="3" :disabled="busy"
          /></label>
          <label v-for="field in switches" :key="field.key" class="topic-toggle"
            ><span>{{ t(field.label) }}</span
            ><BSwitch
              :aria-label="t(field.label)"
              :checked="draft[field.key]"
              :disabled="busy"
              @change="draft[field.key] = $event"
          /></label>
          <p class="topic-visibility-hint">{{ t('community.feed.topicVisibilityHint') }}</p>
          <section v-if="draft.postTask" class="topic-reward-config">
            <label class="topic-toggle"
              ><span>{{ t('community.feed.activityReward') }}</span
              ><BSwitch
                :checked="Boolean(draft.reward)"
                :disabled="busy || draft.reward?.locked"
                @change="toggleReward"
            /></label>
            <template v-if="draft.reward">
              <p>{{
                t(draft.reward.locked ? 'community.feed.rewardConfigLocked' : 'community.feed.rewardConfigHint')
              }}</p>
              <div class="topic-form-pair"
                ><label
                  >{{ t('community.feed.rewardStarts')
                  }}<BDateTimePicker
                    :value="pickerDate(draft.reward.startsAt)"
                    :disabled="busy || draft.reward.locked"
                    @update:value="setRewardDate('startsAt', $event)" /></label
                ><label
                  >{{ t('community.feed.rewardEnds')
                  }}<BDateTimePicker
                    :value="pickerDate(draft.reward.endsAt)"
                    :disabled="busy || draft.reward.locked"
                    @update:value="setRewardDate('endsAt', $event)" /></label
              ></div>
              <div class="topic-form-pair"
                ><label
                  >{{ t('community.feed.rewardExp')
                  }}<BInput
                    :value="String(draft.reward.exp)"
                    type="number"
                    :disabled="busy || draft.reward.locked"
                    @update:value="draft.reward.exp = Number($event)" /></label
                ><label
                  >{{ t('community.feed.rewardPoints')
                  }}<BInput
                    :value="String(draft.reward.points)"
                    type="number"
                    :disabled="busy || draft.reward.locked"
                    @update:value="draft.reward.points = Number($event)" /></label
              ></div>
            </template>
          </section>
          <footer
            ><BButton :disabled="busy" @click="draft = null">{{ t('community.feed.cancel') }}</BButton
            ><BButton type="primary" :loading="busy" :disabled="!valid || !writable" @click="save">{{
              t('community.feed.save')
            }}</BButton></footer
          >
        </form>
      </BLoading>
    </div>
  </BModal>
  <CommunityCampaignManager v-if="campaignManager" @close="campaignManager = false" />
</template>
<script setup lang="ts">
  import CommunityCampaignManager from './CommunityCampaignManager.vue';
  const campaignManager = ref(false);
  import { communityTopicCover } from '@/config/communityTopicCovers';
  import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
  import { useI18n } from 'vue-i18n';
  import { feedGet, feedOperation, type FeedTopic } from '@/api/communityFeedApi';
  import BModal from '@/components/base/BasicComponents/BModal/BModal.vue';
  import BInput from '@/components/base/BasicComponents/BInput.vue';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BDateTimePicker from '@/components/base/BasicComponents/BDateTimePicker.vue';
  import BSwitch from '@/components/base/BasicComponents/BSwitch.vue';
  import BLoading from '@/components/base/BasicComponents/BLoading.vue';
  const props = defineProps<{ writable: boolean }>();
  const emit = defineEmits<{ close: []; saved: [] }>();
  const { t, locale } = useI18n();
  const topics = ref<FeedTopic[]>([]),
    loading = ref(false),
    busy = ref(false),
    error = ref(false),
    existing = ref(false);
  const draft = ref<FeedTopic | null>(null);
  const switches = [
    { key: 'enabled', label: 'community.feed.topicEnabled' },
    { key: 'officialPinned', label: 'community.feed.officialPinned' },
    { key: 'postTask', label: 'community.feed.postTask' },
  ] as const;
  const valid = computed(
    () =>
      draft.value &&
      /^[a-z0-9][a-z0-9-]{0,39}$/.test(draft.value.slug) &&
      [draft.value.nameZh, draft.value.nameEn].every((x) => x.trim() && Array.from(x.trim()).length <= 80) &&
      [draft.value.descriptionZh, draft.value.descriptionEn].every((x) => Array.from(x.trim()).length <= 600) &&
      (!draft.value.reward ||
        (Number.isFinite(Date.parse(draft.value.reward.startsAt)) &&
          Date.parse(draft.value.reward.endsAt) > Date.parse(draft.value.reward.startsAt) &&
          Number.isInteger(draft.value.reward.exp) &&
          draft.value.reward.exp >= 0 &&
          draft.value.reward.exp <= 1000 &&
          Number.isInteger(draft.value.reward.points) &&
          draft.value.reward.points >= 0 &&
          draft.value.reward.points <= 10000 &&
          draft.value.reward.exp + draft.value.reward.points > 0)),
  );
  let generation = 0,
    operation: (() => Promise<any>) | null = null,
    fingerprint = '';
  async function load() {
    const current = ++generation;
    loading.value = true;
    error.value = false;
    try {
      const data = await feedGet<FeedTopic[]>('moderation/topics');
      if (current === generation) topics.value = data;
    } catch {
      if (current === generation) error.value = true;
    } finally {
      if (current === generation) loading.value = false;
    }
  }
  function edit(topic?: FeedTopic) {
    error.value = false;
    existing.value = Boolean(topic);
    draft.value = topic
      ? {
          ...topic,
          reward: topic.reward
            ? {
                ...topic.reward,
                exp: topic.reward.configuredExp ?? topic.reward.exp,
                points: topic.reward.configuredPoints ?? topic.reward.points,
              }
            : null,
        }
      : {
          slug: '',
          nameZh: '',
          nameEn: '',
          descriptionZh: '',
          descriptionEn: '',
          enabled: true,
          officialPinned: false,
          postTask: false,
          sortOrder: 0,
          revision: 0,
        };
    operation = null;
    fingerprint = '';
  }
  function pickerDate(value: string) {
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) return '';
    return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  }
  function setRewardDate(key: 'startsAt' | 'endsAt', value: string) {
    if (draft.value?.reward)
      draft.value.reward[key] = value && Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : '';
  }
  function toggleReward(enabled: boolean) {
    if (!draft.value) return;
    draft.value.reward = enabled
      ? {
          startsAt: new Date().toISOString(),
          endsAt: new Date(Date.now() + 7 * 86400000).toISOString(),
          exp: 0,
          points: 0,
        }
      : null;
  }
  async function save() {
    if (!props.writable || !draft.value || !valid.value || busy.value) return;
    const current = generation;
    const { revision, reward, ...fields } = draft.value;
    const body = {
      ...fields,
      reward: reward
        ? {
            startsAt: new Date(reward.startsAt).toISOString(),
            endsAt: new Date(reward.endsAt).toISOString(),
            exp: reward.exp,
            points: reward.points,
          }
        : null,
      expectedRevision: revision,
    };
    const next = JSON.stringify(body);
    if (!operation || fingerprint !== next) {
      operation = feedOperation('moderation/topics', body);
      fingerprint = next;
    }
    busy.value = true;
    error.value = false;
    try {
      await operation();
      if (current !== generation) return;
      draft.value = null;
      operation = null;
      emit('saved');
      await load();
    } catch {
      if (current === generation) error.value = true;
    } finally {
      if (current === generation || !draft.value) busy.value = false;
    }
  }
  onMounted(load);
  onBeforeUnmount(() => generation++);
</script>
<style scoped>
  .topic-cover-preview {
    width: 100%;
    aspect-ratio: 3 / 1;
    object-fit: cover;
    border-radius: 12px;
  }
  .topic-visibility-hint {
    margin: 0;
    color: var(--desc-color);
    font-size: var(--ui-font-13, 13px);
    line-height: 1.6;
  }
  .topic-reward-config {
    border-top: 1px solid var(--surface-border-color);
    padding-top: var(--ui-space-16, 16px);
    display: grid;
    gap: var(--ui-space-16, 16px);
  }
  .topic-reward-config p {
    font-size: var(--ui-font-12, 12px);
    line-height: 1.7;
    color: var(--desc-color);
    margin: 0;
  }
  .topic-manager-hint {
    color: var(--desc-color);
    line-height: 1.7;
    margin: 0 0 var(--ui-space-20, 20px);
    font-size: var(--ui-font-13, 13px);
  }
  .topic-list-toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: var(--ui-space-12, 12px);
    padding-bottom: var(--ui-space-16, 16px);
    border-bottom: 1px solid var(--workspace-border);
  }
  .topic-list-summary {
    display: flex;
    gap: var(--ui-space-8, 8px);
    flex-wrap: wrap;
  }
  .topic-manager-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: var(--ui-space-18, 18px) 0;
    border-bottom: 1px solid var(--workspace-divider);
    gap: var(--ui-space-16, 16px);
  }
  .topic-row-copy {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: var(--ui-space-8, 8px);
  }
  .topic-row-title {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: var(--ui-space-8, 8px) var(--ui-space-12, 12px);
  }
  .topic-row-title strong {
    font-size: var(--ui-font-15, 15px);
    line-height: 1.5;
    overflow-wrap: anywhere;
  }
  .topic-state {
    display: inline-flex;
    align-items: center;
    gap: var(--ui-space-5, 5px);
    border: 1px solid currentColor;
    border-radius: 5px;
    padding: var(--ui-space-2, 2px) var(--ui-space-7, 7px);
    font-size: var(--ui-font-12, 12px);
    line-height: 1.5;
    font-weight: 600;
    white-space: nowrap;
  }
  .topic-state.is-public {
    color: var(--success-color);
  }
  .topic-state.is-hidden {
    color: var(--warning-color);
  }
  .topic-state i {
    width: 6px;
    height: 6px;
    border: 1px solid currentColor;
    border-radius: 50%;
    box-sizing: border-box;
  }
  .topic-state.is-public i {
    background: currentColor;
  }
  .topic-row-meta {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: var(--ui-space-6, 6px) var(--ui-space-12, 12px);
    color: var(--desc-color);
    font-size: var(--ui-font-12, 12px);
    line-height: 1.5;
  }
  .topic-row-meta small {
    font-size: inherit;
    padding-left: var(--ui-space-12, 12px);
    border-left: 1px solid var(--workspace-border);
  }
  .topic-row-edit {
    flex-shrink: 0;
  }
  .topic-form {
    display: flex;
    flex-direction: column;
    gap: var(--ui-space-18, 18px);
  }
  .topic-form label {
    display: flex;
    flex-direction: column;
    gap: var(--ui-space-8, 8px);
    font-size: var(--ui-font-13, 13px);
  }
  .topic-form-pair {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--ui-space-16, 16px);
  }
  .topic-form label.topic-toggle {
    flex-direction: row;
    justify-content: space-between;
    align-items: center;
  }
  .topic-form footer {
    display: flex;
    justify-content: flex-end;
    gap: var(--ui-space-10, 10px);
    padding-top: var(--ui-space-16, 16px);
    border-top: 1px solid var(--workspace-divider);
  }
  @media (max-width: 767px) {
    .topic-form-pair {
      grid-template-columns: 1fr;
    }
  }
</style>
