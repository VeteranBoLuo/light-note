<template>
  <span
    class="growth-task-icon"
    :class="[`growth-task-icon--${appearance.tone}`, { 'growth-task-icon--compact': compact }]"
    aria-hidden="true"
  >
    <SvgIcon :src="appearance.src" :size="compact ? 16 : 20" />
    <span v-if="completed" class="growth-task-icon__check">
      <SvgIcon :src="icon.filterPanel.check" size="9" />
    </span>
  </span>
</template>

<script setup lang="ts">
  import { computed } from 'vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import icon from '@/config/icon';

  const props = withDefaults(defineProps<{ taskKey: string; completed?: boolean; compact?: boolean }>(), {
    completed: false,
    compact: false,
  });

  // 同一行为在日常、每周和新手路线中保持相同图案与资源语义色。
  const groups = [
    { keys: ['daily', 'checkin', 'wk_checkin'], src: icon.growth.checkin, tone: 'amber' },
    {
      keys: ['daily_bookmark', 'first_bookmark', 'wk_bookmark', 'wk_collect'],
      src: icon.resource.bookmark,
      tone: 'purple',
    },
    { keys: ['daily_note', 'first_note', 'wk_note'], src: icon.resource.note, tone: 'green' },
    { keys: ['daily_file', 'first_file'], src: icon.resource.file, tone: 'amber' },
    {
      keys: ['daily_todo_create', 'daily_todo', 'first_todo', 'wk_todo', 'wk_progress'],
      src: icon.todoWorkspace.checkSquare,
      tone: 'blue',
    },
    { keys: ['daily_organize', 'first_organize', 'wk_organize'], src: icon.growth.organize, tone: 'purple' },
    { keys: ['knowledge_action_1', 'knowledge_action_2', 'wk_variety'], src: icon.ai.materials, tone: 'rose' },
    { keys: ['profile_avatar'], src: icon.communityChat.profileEdit, tone: 'rose' },
    { keys: ['wk_community'], src: icon.growth.achievement.community_post_1, tone: 'blue' },
    { keys: ['weekly', 'wk_active_days'], src: icon.common.calendar, tone: 'purple' },
    { keys: ['onboarding'], src: icon.growth.tenure, tone: 'green' },
    { keys: ['create'], src: icon.growth.create, tone: 'green' },
    { keys: ['exp30'], src: icon.growth.ai, tone: 'amber' },
    { keys: ['reward'], src: icon.growth.reward, tone: 'amber' },
  ];
  const appearance = computed(
    () => groups.find((group) => group.keys.includes(props.taskKey)) || { src: icon.growth.level, tone: 'purple' },
  );
</script>

<style scoped lang="less">
  .growth-task-icon {
    position: relative;
    display: inline-grid;
    place-items: center;
    flex: 0 0 auto;
    width: var(--ui-layout-34, 34px);
    height: var(--ui-layout-34, 34px);
    border-radius: 10px;
    color: var(--workspace-purple-text);
    background: var(--workspace-purple-selected);
  }

  .growth-task-icon--green {
    color: var(--workspace-note-text);
    background: var(--workspace-note-selected);
  }

  .growth-task-icon--amber {
    color: var(--workspace-file-text);
    background: var(--workspace-file-selected);
  }

  .growth-task-icon--blue {
    color: var(--chip-todo-fg);
    background: var(--chip-todo-bg);
  }

  .growth-task-icon--rose {
    color: var(--workspace-tag-text);
    background: var(--workspace-tag-selected);
  }

  .growth-task-icon--compact {
    width: var(--ui-layout-26, 26px);
    height: var(--ui-layout-26, 26px);
    border-radius: 8px;
  }

  .growth-task-icon__check {
    position: absolute;
    right: calc(-1 * var(--ui-space-2, 2px));
    bottom: calc(-1 * var(--ui-space-2, 2px));
    display: grid;
    place-items: center;
    width: var(--ui-layout-14, 14px);
    height: var(--ui-layout-14, 14px);
    box-sizing: border-box;
    border: 1px solid var(--success-color);
    border-radius: 50%;
    color: var(--success-color);
    background: var(--chip-success-bg);
  }
</style>
