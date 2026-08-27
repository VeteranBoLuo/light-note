<template>
  <BModal
    v-model:visible="visible"
    :title="t('communityChat.poll.composerTitle')"
    width="min(560px, 94vw)"
    height="min(720px, 88vh)"
    content-class="chat-poll-composer-content"
    :show-footer="false"
    :mask-closable="!submitting"
    :close-disabled="submitting"
    initial-focus="#community-chat-poll-question"
    fullscreen-mobile
  >
    <div class="chat-poll-composer">
      <p class="chat-poll-composer__description">{{ t('communityChat.poll.composerDescription') }}</p>

      <section>
        <label for="community-chat-poll-question">{{ t('communityChat.poll.questionLabel') }}</label>
        <BInput
          id="community-chat-poll-question"
          v-model:value="question"
          class="chat-poll-composer__question"
          type="textarea"
          :rows="3"
          :maxlength="200"
          :disabled="submitting"
          :placeholder="t('communityChat.poll.questionPlaceholder')"
        />
        <small>{{ Array.from(question).length }}/200</small>
      </section>

      <section>
        <div class="chat-poll-composer__section-heading">
          <label>{{ t('communityChat.poll.optionsLabel') }}</label>
          <small>{{ t('communityChat.poll.optionCount', { count: options.length, max: 10 }) }}</small>
        </div>
        <div class="chat-poll-composer__options">
          <div v-for="(option, index) in options" :key="option.key">
            <span aria-hidden="true">{{ index + 1 }}</span>
            <BInput
              v-model:value="option.label"
              :maxlength="80"
              :disabled="submitting"
              :placeholder="t('communityChat.poll.optionPlaceholder', { index: index + 1 })"
              :aria-label="t('communityChat.poll.optionPlaceholder', { index: index + 1 })"
            />
            <BButton
              class="chat-poll-composer__remove"
              :disabled="submitting || options.length <= 2"
              :aria-label="t('communityChat.poll.removeOption', { index: index + 1 })"
              @click="removeOption(index)"
            >
              <SvgIcon :src="icon.common.close" size="14" aria-hidden="true" />
            </BButton>
          </div>
        </div>
        <BButton
          v-if="options.length < 10"
          size="small"
          class="chat-poll-composer__add"
          :disabled="submitting"
          @click="addOption"
        >
          <SvgIcon :src="icon.common.plus" size="15" aria-hidden="true" />
          {{ t('communityChat.poll.addOption') }}
        </BButton>
      </section>

      <section>
        <label id="community-chat-poll-deadline-label">{{ t('communityChat.poll.deadlineLabel') }}</label>
        <BDateTimePicker
          v-model:value="deadlineLocal"
          :disabled="submitting"
          :placeholder="t('communityChat.poll.deadlinePlaceholder')"
          aria-labelledby="community-chat-poll-deadline-label"
        />
        <small>{{ t('communityChat.poll.deadlineHint') }}</small>
      </section>

      <p v-if="validationMessage" class="chat-poll-composer__error" role="alert">{{ validationMessage }}</p>

      <footer>
        <BButton :disabled="submitting" @click="visible = false">{{ t('common.cancel') }}</BButton>
        <BButton type="primary" :loading="submitting" :disabled="submitting" @click="submit">
          <SvgIcon v-if="!submitting" :src="icon.communityChat.poll" size="16" aria-hidden="true" />
          {{ t('communityChat.poll.createAction') }}
        </BButton>
      </footer>
    </div>
  </BModal>
</template>

<script setup lang="ts">
  import { computed, ref, watch } from 'vue';
  import { useI18n } from 'vue-i18n';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BDateTimePicker from '@/components/base/BasicComponents/BDateTimePicker.vue';
  import BInput from '@/components/base/BasicComponents/BInput.vue';
  import BModal from '@/components/base/BasicComponents/BModal/BModal.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import icon from '@/config/icon';

  interface PollOptionDraft {
    key: number;
    label: string;
  }

  const props = withDefaults(defineProps<{ submitting?: boolean }>(), { submitting: false });
  const emit = defineEmits<{
    submit: [payload: { question: string; options: string[]; endsAt: string }];
  }>();
  const visible = defineModel<boolean>('visible', { default: false });
  const { t } = useI18n();
  const question = ref('');
  const deadlineLocal = ref('');
  const options = ref<PollOptionDraft[]>([]);
  const submitted = ref(false);
  const validationNow = ref(Date.now());
  let nextOptionKey = 0;

  function createOption(): PollOptionDraft {
    nextOptionKey += 1;
    return { key: nextOptionKey, label: '' };
  }

  function defaultDeadlineLocal() {
    const date = new Date(Date.now() + 24 * 60 * 60 * 1000);
    date.setSeconds(0, 0);
    const local = new Date(date.getTime() - date.getTimezoneOffset() * 60 * 1000);
    return local.toISOString().slice(0, 16).replace('T', ' ');
  }

  function deadlineTimestamp() {
    const source = String(deadlineLocal.value || '')
      .trim()
      .replace(' ', 'T');
    const timestamp = new Date(source).getTime();
    return Number.isFinite(timestamp) ? timestamp : NaN;
  }

  const validationKey = computed(() => {
    const normalizedQuestion = question.value.trim();
    if (!normalizedQuestion) return 'questionRequired';
    if (Array.from(normalizedQuestion).length > 200) return 'questionTooLong';
    const normalizedOptions = options.value.map((option) => option.label.normalize('NFKC').trim());
    if (normalizedOptions.some((option) => !option)) return 'optionRequired';
    if (normalizedOptions.some((option) => Array.from(option).length > 80)) return 'optionTooLong';
    const keys = normalizedOptions.map((option) => option.toLowerCase());
    if (new Set(keys).size !== keys.length) return 'optionDuplicate';
    const timestamp = deadlineTimestamp();
    if (!Number.isFinite(timestamp)) return 'deadlineRequired';
    if (timestamp < validationNow.value + 5 * 60 * 1000) return 'deadlineTooSoon';
    if (timestamp > validationNow.value + 30 * 24 * 60 * 60 * 1000) return 'deadlineTooLate';
    return '';
  });
  const canSubmit = computed(() => !props.submitting && !validationKey.value);
  const validationMessage = computed(() =>
    submitted.value && validationKey.value ? t(`communityChat.poll.validation.${validationKey.value}`) : '',
  );

  function addOption() {
    if (options.value.length >= 10) return;
    options.value.push(createOption());
  }

  function removeOption(index: number) {
    if (options.value.length <= 2) return;
    options.value.splice(index, 1);
  }

  function submit() {
    validationNow.value = Date.now();
    submitted.value = true;
    if (!canSubmit.value) return;
    emit('submit', {
      question: question.value.trim(),
      options: options.value.map((option) => option.label.normalize('NFKC').trim()),
      endsAt: new Date(deadlineTimestamp()).toISOString(),
    });
  }

  watch(
    visible,
    (nextVisible) => {
      if (!nextVisible) return;
      question.value = '';
      options.value = [createOption(), createOption()];
      deadlineLocal.value = defaultDeadlineLocal();
      validationNow.value = Date.now();
      submitted.value = false;
    },
    { immediate: true },
  );
</script>

<style scoped lang="less">
  :global(.chat-poll-composer-content) {
    overflow: auto;
  }

  :global(.modal-view.is-mobile-fullscreen .modal-content.chat-poll-composer-content) {
    overflow-x: hidden;
    overflow-y: auto;
  }

  .chat-poll-composer {
    display: grid;
    gap: 16px;
    color: var(--text-color);
  }

  .chat-poll-composer__description {
    margin: 0;
    color: var(--desc-color);
    font-size: 12px;
    line-height: 1.65;
  }

  .chat-poll-composer section {
    display: grid;
    gap: 7px;
  }

  .chat-poll-composer label {
    font-size: 12px;
    font-weight: 700;
  }

  .chat-poll-composer small {
    color: var(--desc-color);
    font-size: 10px;
    line-height: 1.5;
  }

  .chat-poll-composer section > small {
    justify-self: end;
  }

  .chat-poll-composer__section-heading {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
  }

  .chat-poll-composer__options {
    display: grid;
    gap: 7px;
  }

  .chat-poll-composer__options > div {
    min-width: 0;
    display: grid;
    grid-template-columns: 24px minmax(0, 1fr) 34px;
    align-items: center;
    gap: 7px;
  }

  .chat-poll-composer__options > div > span {
    width: 24px;
    height: 24px;
    display: grid;
    place-items: center;
    border: 1px solid var(--surface-border-color);
    border-radius: 50%;
    color: var(--desc-color);
    font-size: 10px;
  }

  .chat-poll-composer__remove {
    width: 34px;
    min-width: 34px;
    height: 34px;
    padding: 0;
    color: var(--danger-color);
  }

  .chat-poll-composer__add {
    gap: 5px;
    color: var(--primary-color);
  }

  .chat-poll-composer__error {
    margin: 0;
    padding: 8px 10px;
    border: 1px solid var(--danger-color);
    border-radius: 9px;
    color: var(--danger-color);
    background: var(--card-background);
    font-size: 11px;
  }

  .chat-poll-composer footer {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
  }

  .chat-poll-composer footer .b_btn {
    gap: 6px;
  }

  @media (max-width: 767px) {
    .chat-poll-composer {
      padding: 0 16px calc(8px + env(safe-area-inset-bottom));
    }

    .chat-poll-composer footer {
      margin-top: auto;
      position: sticky;
      bottom: 0;
      padding-top: 10px;
      background: var(--card-background);
    }

    .chat-poll-composer footer .b_btn {
      min-height: 44px;
      flex: 1 1 0;
    }
  }
</style>
