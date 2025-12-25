<template>
  <b-modal v-model:visible="visible" :maskClosable="maskClosable ?? false" :title="title">
    <div class="action-card-modal" :style="{ width: width ?? WIDTH }">
      <div v-for="section in sections" :key="section.key" class="section" :class="section.class">
        <div v-if="section.title" class="section-header">
          <h3>{{ section.title }}</h3>
        </div>
        <div class="cards-grid" :style="{ gridTemplateColumns: bookmark.isMobile ? '1fr' : '1fr 1fr' }">
          <div
            v-for="action in section.actions"
            :key="action.key"
            class="action-card"
            @click="action.onClick ? action.onClick() : handleActionClick(section.key, action.key, action)"
          >
            <div class="card-content">
              <h4>{{ action.label }}</h4>
              <p v-if="action.description">{{ action.description }}</p>
            </div>
          </div>
        </div>
      </div>
      <div v-if="note" class="note-section">
        <p>{{ note }}</p>
      </div>
    </div>
  </b-modal>
</template>

<script setup lang="ts">
  import BModal from '@/components/base/BasicComponents/BModal/BModal.vue';
  import { bookmarkStore } from '@/store';

  const visible = defineModel<boolean>('visible');
  const bookmark = bookmarkStore();

  const WIDTH = bookmark.isMobileDevice ? '80vw' : '600px';

  interface ActionItem {
    key: string;
    label: string;
    description?: string;
    onClick?: () => void;
  }

  interface ActionSection {
    key: string;
    title?: string;
    class?: string;
    actions: ActionItem[];
  }

  const props = defineProps<{
    title: string;
    width?: string | number;
    maskClosable?: boolean;
    sections: ActionSection[];
    note?: string;
  }>();

  const emit = defineEmits<{
    (e: 'action', payload: { sectionKey: string; actionKey: string; action: ActionItem }): void;
  }>();

  const handleActionClick = (sectionKey: string, actionKey: string, action: ActionItem) => {
    emit('action', { sectionKey, actionKey, action });
  };
</script>

<style scoped lang="less">
  .action-card-modal {
    .section {
      margin-bottom: 12px;
      .section-header {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-bottom: 16px;

        h3 {
          margin: 0;
          color: var(--text-color);
          font-size: 16px;
          font-weight: 600;
        }
      }

      .cards-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 16px;
      }

      .action-card {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 16px;
        background-color: var(--menu-item-bg-color);
        border: 1px solid var(--menu-item-h-bg-color);
        border-radius: 12px;
        cursor: pointer;
        transition: all 0.2s ease;

        &:hover {
          background-color: var(--menu-item-h-bg-color);
          border-color: var(--primary-color);
          transform: translateY(-2px);
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
        }

        .card-content {
          h4 {
            margin: 0 0 4px 0;
            color: var(--text-color);
            font-size: 14px;
            font-weight: 500;
          }

          p {
            margin: 0;
            color: var(--desc-color);
            font-size: 12px;
          }
        }
      }
    }

    .note-section {
      display: flex;
      align-items: flex-start;
      gap: 8px;
      margin-top: 24px;
      padding: 12px;
      background-color: var(--menu-item-h-bg-color);
      border-radius: 8px;
      border-left: 4px solid var(--primary-color);

      .note-icon {
        flex-shrink: 0;
        color: var(--primary-color);
        margin-top: 2px;
      }

      p {
        margin: 0;
        color: var(--desc-color);
        font-size: 14px;
        line-height: 1.5;
      }
    }
  }
</style>
