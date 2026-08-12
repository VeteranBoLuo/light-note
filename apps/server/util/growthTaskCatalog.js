// 成长任务定义的单一事实源。
// titleKey/descriptionKey 存 i18n key，不存展示文案；展示层在 PR3 通过前端 locale 翻译。
export const GROWTH_TASK_DEFINITIONS = Object.freeze([
  Object.freeze({
    id: 'growth-task-profile-avatar',
    taskKey: 'profile_avatar',
    titleKey: 'growth.tasks.profileAvatar.title',
    descriptionKey: 'growth.tasks.profileAvatar.description',
    rewardExp: 50,
    enabled: true,
    sortOrder: 10,
  }),
  Object.freeze({
    id: 'growth-task-first-note',
    taskKey: 'first_note',
    titleKey: 'growth.tasks.firstNote.title',
    descriptionKey: 'growth.tasks.firstNote.description',
    rewardExp: 50,
    enabled: true,
    sortOrder: 20,
  }),
  Object.freeze({
    id: 'growth-task-first-bookmark',
    taskKey: 'first_bookmark',
    titleKey: 'growth.tasks.firstBookmark.title',
    descriptionKey: 'growth.tasks.firstBookmark.description',
    rewardExp: 30,
    enabled: true,
    sortOrder: 30,
  }),
  Object.freeze({
    id: 'growth-task-first-todo',
    taskKey: 'first_todo',
    titleKey: 'growth.tasks.firstTodo.title',
    descriptionKey: 'growth.tasks.firstTodo.description',
    rewardExp: 30,
    enabled: true,
    sortOrder: 40,
  }),
  Object.freeze({
    id: 'growth-task-first-file',
    taskKey: 'first_file',
    titleKey: 'growth.tasks.firstFile.title',
    descriptionKey: 'growth.tasks.firstFile.description',
    rewardExp: 30,
    enabled: true,
    sortOrder: 50,
  }),
  Object.freeze({
    id: 'growth-task-first-organize',
    taskKey: 'first_organize',
    titleKey: 'growth.tasks.firstOrganize.title',
    descriptionKey: 'growth.tasks.firstOrganize.description',
    rewardExp: 40,
    enabled: true,
    sortOrder: 60,
  }),
  Object.freeze({
    id: 'growth-task-first-reuse',
    taskKey: 'first_reuse',
    titleKey: 'growth.tasks.firstReuse.title',
    descriptionKey: 'growth.tasks.firstReuse.description',
    rewardExp: 50,
    enabled: true,
    sortOrder: 70,
  }),
]);

// 已下线任务只用于把既有数据库定义置为禁用；历史完成状态与已发经验保留，不做回收。
export const RETIRED_GROWTH_TASK_KEYS = Object.freeze(['first_review']);
