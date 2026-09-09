<template>
  <div class="suggestion-tag-editor">
    <BSelect
      ref="select"
      :value="selectedKeys"
      :options="options"
      mode="multiple"
      chip-tone="tag"
      dropdown-class-name="organize-suggestion-tag-options"
      show-search
      :aria-label="t('organize.aiSuggestions.chooseTags')"
      :placeholder="t('organize.aiSuggestions.chooseTags')"
      :disabled="disabled"
      :loading="loading"
      @search="keyword = $event"
      @change="changeSelection"
    >
      <template #dropdown-footer>
        <BButton
          class="suggestion-tag-editor__add"
          :disabled="disabled || loading || error || tags.length >= 3"
          @click="openCreate"
        >
          <SvgIcon :src="icon.common.add" size="16" />
          <span>{{ t('navigation.newTag') }}</span>
        </BButton>
      </template>
    </BSelect>
    <small>{{ t('organize.aiSuggestions.tagPickerHint') }}</small>
    <div v-if="error" class="suggestion-tag-editor__error" role="alert">
      <span>{{ t('organize.aiSuggestions.tagLoadFailed') }}</span>
      <BButton size="small" :disabled="disabled" @click="loadTags()">{{ t('common.retry') }}</BButton>
    </div>
    <BModal
      v-model:visible="createOpen"
      :title="t('navigation.newTag')"
      width="min(420px, calc(100vw - 32px))"
      content-class="suggestion-tag-create"
      initial-focus=".b-input"
    >
      <label class="suggestion-tag-create__field">
        <span>{{ t('tagManage.tagName') }}</span>
        <BInput v-model:value="createName" :maxlength="32" @enter="confirmCreate" />
      </label>
      <template #footer>
        <div class="suggestion-tag-create__actions">
          <BButton @click="createOpen = false">{{ t('common.cancel') }}</BButton>
          <BButton type="primary" :disabled="!canConfirmCreate" @click="confirmCreate">
            {{ t('common.confirm') }}
          </BButton>
        </div>
      </template>
    </BModal>
  </div>
</template>

<script setup lang="ts">
  import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
  import { useI18n } from 'vue-i18n';
  import BSelect from '@/components/base/BasicComponents/BSelect.vue';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BInput from '@/components/base/BasicComponents/BInput.vue';
  import BModal from '@/components/base/BasicComponents/BModal/BModal.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import icon from '@/config/icon';
  import { fetchSelectableTags } from '@/api/tagSpace';
  import type { OrganizeAiSuggestionTag } from '@/api/organizeApi';

  const props = defineProps<{ disabled?: boolean }>();
  const tags = defineModel<OrganizeAiSuggestionTag[]>('tags', { required: true });
  const { t } = useI18n();
  const select = ref<InstanceType<typeof BSelect> | null>(null);
  const items = ref<OrganizeAiSuggestionTag[]>([]);
  const keyword = ref('');
  const loading = ref(false);
  const error = ref(false);
  const createOpen = ref(false);
  const createName = ref('');
  let sequence = 0;
  const normalize = (name: string) => name.normalize('NFKC').trim();
  const keyOf = (tag: OrganizeAiSuggestionTag) =>
    tag.id ? `id:${tag.id}` : `new:${normalize(tag.name).toLocaleLowerCase()}`;
  const selectedKeys = computed(() => tags.value.map(keyOf));
  const candidates = computed(() => {
    const values = new Map(items.value.map((tag) => [keyOf(tag), tag]));
    tags.value.forEach((tag) => values.set(keyOf(tag), tag));
    return values;
  });
  const canConfirmCreate = computed(
    () =>
      !props.disabled &&
      !loading.value &&
      !error.value &&
      normalize(createName.value).length > 0 &&
      normalize(createName.value).length <= 32 &&
      tags.value.length < 3,
  );
  function openCreate() {
    if (props.disabled || loading.value || error.value || tags.value.length >= 3) return;
    createName.value = keyword.value;
    createOpen.value = true;
  }
  function confirmCreate() {
    if (!canConfirmCreate.value) return;
    const name = normalize(createName.value);
    const existing = [...candidates.value.values()].find(
      (tag) => normalize(tag.name).toLocaleLowerCase() === name.toLocaleLowerCase(),
    );
    const tag = existing || { id: null, name, source: 'new' as const };
    if (!selectedKeys.value.includes(keyOf(tag))) tags.value = [...tags.value, tag];
    createOpen.value = false;
  }
  const options = computed(() => {
    const values = [...candidates.value.entries()]
      .filter(
        ([value, tag]) =>
          selectedKeys.value.includes(value) ||
          !tags.value.some(
            (selected) => normalize(selected.name).toLocaleLowerCase() === normalize(tag.name).toLocaleLowerCase(),
          ),
      )
      .map(([value, tag]) => ({
        value,
        label: tag.id ? tag.name : `${tag.name} · ${t('organizeFile.tagSource.new')}`,
        disabled: tags.value.length >= 3 && !selectedKeys.value.includes(value),
      }));
    return values;
  });

  function changeSelection(keys: string[]) {
    if (props.disabled || keys.length > 3) return;
    tags.value = keys.flatMap((key) => {
      const tag = candidates.value.get(key);
      if (tag) return [tag];
      return [];
    });
  }
  async function loadTags() {
    const request = ++sequence;
    loading.value = true;
    error.value = false;
    try {
      const response = await fetchSelectableTags();
      if (request !== sequence) return;
      const incoming = response.map((tag) => ({
        id: String(tag.id),
        name: tag.name,
        source: 'existing' as const,
      }));
      items.value = incoming;
    } catch {
      if (request === sequence) error.value = true;
    } finally {
      if (request === sequence) loading.value = false;
    }
  }
  onMounted(() => {
    void loadTags();
    select.value?.$el?.querySelector('[role="combobox"]')?.focus();
  });
  onBeforeUnmount(() => {
    sequence += 1;
  });
</script>

<style scoped lang="less">
  :global(.organize-suggestion-tag-options .select-option.is-selected .select-option-label) {
    color: var(--text-color);
  }
  .suggestion-tag-editor {
    display: grid;
    gap: 8px;
    min-width: 0;
    width: min(520px, 100%);
  }
  .suggestion-tag-editor small {
    color: var(--desc-color);
    line-height: 1.6;
  }
  .suggestion-tag-editor__error {
    display: flex;
    align-items: center;
    gap: 10px;
    color: var(--danger-color);
  }
  .suggestion-tag-editor__add {
    width: 100%;
    height: 32px;
    justify-content: flex-start;
    gap: 7px;
    color: var(--primary-color);
    background: transparent;
  }
  .suggestion-tag-create__field {
    display: grid;
    gap: 10px;
  }
  .suggestion-tag-create__actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    padding: 0 20px 20px;
  }
</style>
