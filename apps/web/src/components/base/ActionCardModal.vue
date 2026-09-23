<template>
  <b-modal v-model:visible="visible" :maskClosable="maskClosable ?? false" :title="title" :showFooter="false">
    <div class="action-card-modal" :style="{ width: width ?? WIDTH }">
      <div v-for="section in sections" :key="section.key" class="section" :class="section.class">
        <div v-if="section.title || section.headerAction" class="section-header">
          <h3 v-if="section.title">{{ section.title }}</h3>
          <BButton
            v-if="section.headerAction"
            size="small"
            class="section-header-action"
            @click="section.headerAction.onClick?.()"
          >
            <SvgIcon v-if="section.headerAction.icon" :src="section.headerAction.icon" size="14" aria-hidden="true" />
            {{ section.headerAction.label }}
          </BButton>
        </div>
        <div v-if="!section.actions.length && section.hint" class="section-hint">{{ section.hint }}</div>
        <div v-else class="cards-grid" :style="{ gridTemplateColumns: bookmark.isMobile ? '1fr' : '1fr 1fr' }">
          <div
            v-for="action in section.actions"
            :key="action.key"
            class="action-card"
            :class="{
              'action-card--with-icon': Boolean(action.icon),
              'action-card--with-preview': Boolean(action.preview?.length),
            }"
            @click="action.onClick ? action.onClick() : handleActionClick(section.key, action.key, action)"
          >
            <div v-if="action.icon" class="card-icon">
              <SvgIcon :src="action.icon" size="20" />
            </div>
            <div class="card-content">
              <h4>
                {{ action.label }}
                <span v-if="action.tag" class="card-tag">{{ action.tag }}</span>
              </h4>
              <p v-if="action.description">{{ action.description }}</p>
              <div v-if="action.preview?.length" class="card-preview">
                <span v-for="line in action.preview ?? []" :key="line">{{ line }}</span>
              </div>
            </div>
            <div v-if="action.removable && action.onRemove" class="card-remove" @click.stop="action.onRemove()">
              <SvgIcon :src="icon.noteDetail.delete" size="14" />
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
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import icon from '@/config/icon.ts';
  import { bookmarkStore } from '@/store';

  const visible = defineModel<boolean>('visible');
  const bookmark = bookmarkStore();

  const WIDTH = bookmark.isMobile ? '80vw' : 'var(--ui-layout-600, 600px)';

  interface ActionItem {
    key: string;
    label: string;
    description?: string;
    /** 标题旁的小标签(如内容类型),低饱和中性样式 */
    tag?: string;
    /** 卡片左侧的语义图标，静态资源统一来自 icon.ts。 */
    icon?: string;
    /** 卡片内部的结构预览，用于帮助用户快速选择工作流模板。 */
    preview?: string[];
    onClick?: () => void;
    /** 可移除卡片（如用户自存模板）：显示右上角删除按钮，点击只触发 onRemove 不触发卡片本体 */
    removable?: boolean;
    onRemove?: () => void;
  }

  interface ActionSection {
    key: string;
    title?: string;
    class?: string;
    actions: ActionItem[];
    /** 区块级操作显示在标题右侧，不占用卡片网格。 */
    headerAction?: Pick<ActionItem, 'label' | 'icon' | 'onClick'>;
    /** actions 为空时显示的提示行(空态/加载中),无提示且无卡片则只渲染标题 */
    hint?: string;
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
      margin-bottom: var(--ui-space-12, 12px);
      .section-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: var(--ui-space-8, 8px);
        margin-bottom: var(--ui-space-16, 16px);

        h3 {
          margin: 0;
          color: var(--text-color);
          font-size: var(--ui-font-16, 16px);
          font-weight: 600;
        }

        .section-header-action {
          flex: 0 0 auto;
          gap: var(--ui-space-5, 5px);
          border: 1px solid var(--card-border-color) !important;
          background: transparent;
          color: var(--resource-note-color);
          font-weight: 600;

          &:hover {
            border-color: var(--resource-note-color) !important;
            background: var(--menu-item-h-bg-color);
          }
        }
      }

      .cards-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: var(--ui-space-16, 16px);
      }

      .section-hint {
        padding: var(--ui-space-12, 12px) var(--ui-space-14, 14px);
        border-radius: 10px;
        background-color: var(--menu-item-bg-color);
        color: var(--desc-color);
        font-size: var(--ui-font-12, 12px);
        line-height: 1.6;
      }

      .action-card {
        position: relative;
        display: flex;
        align-items: center;
        gap: var(--ui-space-12, 12px);
        padding: var(--ui-space-16, 16px);
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

        &.action-card--with-icon {
          align-items: flex-start;
          min-height: var(--ui-layout-132, 132px);
          padding: var(--ui-space-14, 14px);
        }

        .card-icon {
          flex: 0 0 auto;
          display: flex;
          align-items: center;
          justify-content: center;
          width: var(--ui-layout-36, 36px);
          height: var(--ui-layout-36, 36px);
          border: 1px solid color-mix(in srgb, var(--resource-note-color) 18%, var(--card-border-color));
          border-radius: 10px;
          background: color-mix(in srgb, var(--resource-note-color) 10%, var(--card-background));
          color: var(--resource-note-color);
          transition:
            background-color 0.2s ease,
            border-color 0.2s ease,
            transform 0.2s ease;
        }

        &:hover .card-icon {
          border-color: color-mix(in srgb, var(--resource-note-color) 34%, var(--card-border-color));
          background: color-mix(in srgb, var(--resource-note-color) 16%, var(--card-background));
          transform: scale(1.04);
        }

        .card-remove {
          position: absolute;
          top: var(--ui-space-6, 6px);
          right: var(--ui-space-6, 6px);
          display: flex;
          align-items: center;
          justify-content: center;
          width: var(--ui-layout-24, 24px);
          height: var(--ui-layout-24, 24px);
          border-radius: 6px;
          color: var(--sub-text-color);
          opacity: 0.6;
          transition: all 0.2s ease;

          &:hover {
            opacity: 1;
            color: var(--error-color, #e5484d);
            background-color: var(--menu-item-bg-color);
          }
        }

        .card-content {
          flex: 1;
          min-width: 0;

          h4 {
            display: flex;
            align-items: center;
            gap: var(--ui-space-6, 6px);
            margin: 0 0 var(--ui-space-4, 4px) 0;
            color: var(--text-color);
            font-size: var(--ui-font-14, 14px);
            font-weight: 500;
          }

          .card-tag {
            flex-shrink: 0;
            padding: var(--ui-space-1, 1px) var(--ui-space-7, 7px);
            border-radius: 999px;
            background-color: var(--menu-item-h-bg-color);
            color: var(--sub-text-color);
            font-size: var(--ui-font-11, 11px);
            font-weight: 400;
            line-height: 1.6;
          }

          p {
            margin: 0;
            color: var(--desc-color);
            font-size: var(--ui-font-12, 12px);
            line-height: 1.5;
          }

          .card-preview {
            display: grid;
            gap: var(--ui-space-4, 4px);
            margin-top: var(--ui-space-10, 10px);

            span {
              display: block;
              padding-left: var(--ui-space-8, 8px);
              border-left: 2px solid color-mix(in srgb, var(--resource-note-color) 45%, transparent);
              color: var(--sub-text-color);
              font-size: var(--ui-font-11, 11px);
              line-height: 1.35;
              overflow: hidden;
              text-overflow: ellipsis;
              white-space: nowrap;
            }
          }
        }
      }
    }

    .note-section {
      display: flex;
      align-items: flex-start;
      gap: var(--ui-space-8, 8px);
      margin-top: var(--ui-space-24, 24px);
      padding: var(--ui-space-12, 12px);
      background-color: var(--menu-item-h-bg-color);
      border-radius: 8px;
      border-left: 4px solid var(--primary-color);

      .note-icon {
        flex-shrink: 0;
        color: var(--primary-color);
        margin-top: var(--ui-space-2, 2px);
      }

      p {
        margin: 0;
        color: var(--desc-color);
        font-size: var(--ui-font-14, 14px);
        line-height: 1.5;
      }
    }
  }
</style>
