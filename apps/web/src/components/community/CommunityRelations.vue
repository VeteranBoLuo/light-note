<template>
  <BModal
    :visible="true"
    :title="t('community.feed.' + kind)"
    width="min(480px, 92vw)"
    :show-footer="false"
    @close="$emit('close')"
  >
    <div class="community-relations">
      <BLoading :loading="loading && !members.length" :title="t('community.feed.loading')">
        <BVirtualList
          v-if="members.length"
          class="relations-list"
          :style="{ height: Math.min(380, members.length * 68 + (cursor ? 40 : 0)) + 'px' }"
          :items="members"
          item-key="userPublicId"
          :item-height="68"
          :loading="loading"
          :has-more="Boolean(cursor) && !failed"
          :loading-text="t('community.feed.loading')"
          @load-more="load"
        >
          <template #default="{ item }">
            <BButton v-if="item.profileEnabled" class="member-row" @click="visit(item.userPublicId)">
              <span class="member-initial" aria-hidden="true">{{ Array.from(item.name || '?')[0] }}</span>
              <span class="member-copy"
                ><strong>{{ item.name }}</strong
                ><small v-if="item.communityId">@{{ item.communityId }}</small></span
              ><span aria-hidden="true">→</span>
            </BButton>
            <div v-else class="member-row"
              ><span class="member-copy">{{ item.name }}</span></div
            >
          </template>
        </BVirtualList>
        <p v-else-if="!loading && !failed" class="relations-empty">{{ t('community.feed.relationsEmpty') }}</p>
      </BLoading>
      <p v-if="failed" role="alert"
        >{{ t('community.feed.loadError') }} <BButton @click="load">{{ t('community.feed.retry') }}</BButton></p
      >
    </div>
  </BModal>
</template>
<script setup lang="ts">
  import { onBeforeUnmount, onMounted, ref } from 'vue';
  import { useI18n } from 'vue-i18n';
  import { useRouter } from 'vue-router';
  import { feedGet } from '@/api/communityFeedApi';
  import BModal from '@/components/base/BasicComponents/BModal/BModal.vue';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BLoading from '@/components/base/BasicComponents/BLoading.vue';
  import BVirtualList from '@/components/base/BasicComponents/BVirtualList.vue';
  const props = defineProps<{ userPublicId: string; kind: string }>();
  const emit = defineEmits<{ close: [] }>();
  const { t } = useI18n();
  const router = useRouter();
  const members = ref<any[]>([]),
    cursor = ref<string | null>(null),
    loading = ref(false),
    failed = ref(false);
  let disposed = false;
  async function load() {
    if (loading.value) return;
    loading.value = true;
    failed.value = false;
    try {
      const page = await feedGet<{ items: any[]; nextCursor: string | null }>('relations', {
        userPublicId: props.userPublicId,
        kind: props.kind,
        ...(cursor.value ? { after: cursor.value } : {}),
      });
      if (disposed) return;
      members.value = [
        ...new Map([...members.value, ...page.items].map((member) => [member.userPublicId, member])).values(),
      ];
      cursor.value = page.nextCursor;
    } catch {
      if (!disposed) failed.value = true;
    } finally {
      if (!disposed) loading.value = false;
    }
  }
  function visit(id: string) {
    emit('close');
    void router.push('/community/people/' + id);
  }
  onMounted(load);
  onBeforeUnmount(() => {
    disposed = true;
  });
</script>
<style scoped>
  .community-relations {
    min-height: 80px;
  }
  .relations-list {
    height: 380px;
    max-height: 55vh;
  }
  .member-row.b_btn,
  .member-row {
    display: flex;
    align-items: center;
    width: 100%;
    height: 68px;
    padding: 10px 4px;
    gap: 14px;
    background: transparent;
    text-align: left;
  }
  .member-row.b_btn:hover {
    background: var(--workspace-hover);
  }
  .member-initial {
    display: grid;
    place-items: center;
    width: 40px;
    height: 40px;
    flex-shrink: 0;
    border-radius: 50%;
    color: var(--primary-color);
    background: var(--workspace-hover);
  }
  .member-copy {
    display: flex;
    flex: 1;
    min-width: 0;
    flex-direction: column;
    gap: 4px;
  }
  .member-copy strong {
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .member-copy small,
  .relations-empty {
    color: var(--desc-color);
  }
  .relations-empty {
    padding: 40px 0;
    text-align: center;
  }
</style>
