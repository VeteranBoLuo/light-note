<template>
  <div class="admin-opinion-detail">
    <div class="admin-opinion-detail__identity">
      <div>
        <strong>{{ record.alias || t('adminUserOpinion.unknownUser') }}</strong>
        <span>{{ record.type || '-' }}</span>
      </div>
      <BChip :tone="statusMeta.tone">{{ statusMeta.label }}</BChip>
    </div>

    <dl class="admin-opinion-detail__grid">
      <div class="admin-opinion-detail__wide">
        <dt>{{ t('adminUserOpinion.detail.content') }}</dt>
        <dd>{{ record.content || '-' }}</dd>
      </div>
      <div>
        <dt>{{ t('adminUserOpinion.detail.submittedAt') }}</dt>
        <dd>{{ record.createTime || '-' }}</dd>
      </div>
      <div>
        <dt>{{ t('adminUserOpinion.detail.contact') }}</dt>
        <dd>{{ record.phone || '-' }}</dd>
      </div>
      <div>
        <dt>{{ t('adminUserOpinion.detail.viewStatus') }}</dt>
        <dd>{{ viewStatus }}</dd>
      </div>
      <div v-if="record.replyTime">
        <dt>{{ t('adminUserOpinion.detail.lastReplyAt') }}</dt>
        <dd>{{ record.replyTime }}</dd>
      </div>
    </dl>

    <section class="admin-opinion-detail__images">
      <h4>{{ t('adminUserOpinion.detail.images') }}</h4>
      <div v-if="images.length" class="admin-opinion-detail__image-list">
        <BButton
          v-for="(src, index) in images"
          :key="`${src}-${index}`"
          class="admin-opinion-detail__image-button"
          :aria-label="t('adminUserOpinion.detail.openImage', { index: index + 1 })"
          @click="emit('openImage', src)"
        >
          <img :src="src" alt="" />
        </BButton>
      </div>
      <p v-else>-</p>
    </section>

    <section class="admin-opinion-detail__reply">
      <label for="admin-opinion-reply">{{ t('adminUserOpinion.detail.adminReply') }}</label>
      <BInput
        id="admin-opinion-reply"
        type="textarea"
        :value="draft"
        :rows="4"
        :maxlength="2000"
        :disabled="replying"
        :placeholder="record.replyContent || t('adminUserOpinion.detail.replyPlaceholder')"
        @update:value="emit('update:draft', String($event || ''))"
      />
      <div class="admin-opinion-detail__footer">
        <span>{{ t('adminUserOpinion.detail.replyHint') }}</span>
        <BButton type="primary" :loading="replying" @click="emit('submit')">{{ submitLabel }}</BButton>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
  import { computed } from 'vue';
  import { useI18n } from 'vue-i18n';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BChip from '@/components/base/BasicComponents/BChip.vue';
  import BInput from '@/components/base/BasicComponents/BInput.vue';
  import {
    parseAdminOpinionImages,
    type AdminOpinionRecord,
  } from '@/view/admin/components/userOpinion/useAdminUserOpinion.ts';

  const props = defineProps<{
    record: AdminOpinionRecord;
    draft: string;
    replying: boolean;
    submitLabel: string;
  }>();
  const emit = defineEmits<{
    'update:draft': [value: string];
    submit: [];
    openImage: [src: string];
  }>();
  const { t } = useI18n();

  const images = computed(() => parseAdminOpinionImages(props.record.imgArray));
  const statusMeta = computed(() => {
    const status = props.record.status || 'pending';
    return {
      label: t(`adminUserOpinion.filters.${status}`),
      tone:
        status === 'pending' ? ('pending' as const) : status === 'viewed' ? ('success' as const) : ('neutral' as const),
    };
  });
  const viewStatus = computed(() => {
    if (props.record.status === 'viewed') return t('adminUserOpinion.detail.userViewed');
    if (props.record.status === 'replied') return t('adminUserOpinion.detail.awaitingUser');
    return t('adminUserOpinion.detail.notReplied');
  });
</script>

<style scoped lang="less">
  .admin-opinion-detail {
    min-width: 0;
    display: grid;
    gap: 16px;
  }

  .admin-opinion-detail__identity {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
  }

  .admin-opinion-detail__identity > div {
    min-width: 0;
    display: grid;
    gap: 3px;
  }

  .admin-opinion-detail__identity strong {
    overflow: hidden;
    color: var(--text-color);
    font-size: 16px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .admin-opinion-detail__identity span,
  .admin-opinion-detail__footer span {
    color: var(--desc-color);
    font-size: 12px;
  }

  .admin-opinion-detail__grid {
    margin: 0;
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 12px 20px;
  }

  .admin-opinion-detail__wide {
    grid-column: 1 / -1;
  }

  .admin-opinion-detail dt,
  .admin-opinion-detail__images h4,
  .admin-opinion-detail__reply label {
    margin: 0 0 6px;
    color: var(--desc-color);
    font-size: 12px;
    font-weight: 500;
  }

  .admin-opinion-detail dd,
  .admin-opinion-detail__images p {
    margin: 0;
    overflow-wrap: anywhere;
    color: var(--text-color);
    line-height: 1.55;
    white-space: pre-wrap;
  }

  .admin-opinion-detail__image-list {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
  }

  .admin-opinion-detail__image-button.b_btn {
    width: 88px;
    height: 88px;
    padding: 0;
    overflow: hidden;
    border: 1px solid var(--surface-border-color);
    border-radius: 12px;
    background: var(--card-background);
  }

  .admin-opinion-detail__image-button img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .admin-opinion-detail__reply {
    display: grid;
    gap: 8px;
  }

  .admin-opinion-detail__footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }

  @media (max-width: 767px) {
    .admin-opinion-detail__grid {
      grid-template-columns: minmax(0, 1fr);
    }

    .admin-opinion-detail__wide {
      grid-column: auto;
    }

    .admin-opinion-detail__image-button.b_btn {
      width: 72px;
      height: 72px;
    }

    .admin-opinion-detail__footer {
      align-items: stretch;
      flex-direction: column;
    }

    .admin-opinion-detail__footer .b_btn {
      min-height: 44px;
    }
  }
</style>
