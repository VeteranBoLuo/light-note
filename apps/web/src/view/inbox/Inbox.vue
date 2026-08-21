<template>
  <main
    class="inbox-page"
    :class="{
      'inbox-page--todo-focused': isTodoFocused,
      'inbox-page--mobile-todo': isMobileTodoPrimary,
      'inbox-page--mobile-resources': isMobileResourceInbox,
      'inbox-page--resource-workspace': !isTodoFocused && !bookmark.isMobile,
      'is-selection-mode': todoSelectionMode,
    }"
  >
    <!-- 待整理属于资源中心，顶栏与「全部资源」共用同一常驻搜索入口；
         待办是底部一级入口，继续使用共享顶栏（带 Logo）。 -->
    <ResourceCenterTopBar
      v-if="isMobileResourceInbox"
      :keyword="inbox.keyword"
      input-id="mobile-inbox-page-input"
      show-menu
      :selection-mode="resourceSelectionMode"
      :selected-count="selectedItems.length"
      :allow-batch="inbox.items.length > 0"
      :allow-sort="inbox.items.length > 0"
      :create-label="t('inbox.quickCapture')"
      @update:keyword="setMobileInboxKeyword"
      @submit="search"
      @back="leaveResourceInbox"
      @create="openCapture"
      @batch="enterResourceSelection"
      @sort="toggleMobileResourceSort"
      @filter="cycleMobileResourceFilter"
      @cancel-selection="leaveResourceSelection"
      @complete-selected="completeSelected"
      @delete-selected="confirmDelete(selectedItems, true)"
    />

    <header v-if="!bookmark.isMobile" class="inbox-hero">
      <div class="inbox-hero__heading">
        <div class="inbox-hero__title-row">
          <span class="inbox-hero__accent" aria-hidden="true"></span>
          <h1>{{ isTodoFocused ? t('inbox.todoPageTitle') : t('inbox.title') }}</h1>
        </div>
        <p>{{ isTodoFocused ? t('inbox.todoPageSubtitle') : t('inbox.subtitle') }}</p>
      </div>
      <ResourceCenterSectionNav v-if="!isTodoFocused" class="section-switcher section-switcher--hero" />
      <BButton v-if="isTodoFocused" type="primary" @click="openTodoEditor()">
        {{ t('inbox.createTodo') }}
      </BButton>
    </header>

    <header v-if="isMobileTodoPrimary" class="mobile-todo-heading">
      <h1>{{ t('inbox.todoPageTitle') }}</h1>
      <p>{{ t('inbox.todoPageSubtitle') }}</p>
    </header>

    <section
      v-if="isTodoFocused && !bookmark.isMobile"
      class="todo-summary-grid"
      :aria-label="t('inbox.todoSummaryLabel')"
    >
      <article class="todo-summary-card is-overdue">
        <span class="todo-summary-card__icon"
          ><SvgIcon :src="icon.todoSummary.overdue" color="var(--todo-summary-icon-fg)" size="21" aria-hidden="true"
        /></span>
        <div
          ><span>{{ t('inbox.todoSummaryOverdue') }}</span
          ><strong>{{ inbox.todoOverdueTotal }}</strong></div
        >
      </article>
      <article class="todo-summary-card">
        <span class="todo-summary-card__icon"
          ><SvgIcon :src="icon.todoSummary.today" color="var(--todo-summary-icon-fg)" size="21" aria-hidden="true"
        /></span>
        <div
          ><span>{{ t('inbox.todoSummaryToday') }}</span
          ><strong>{{ inbox.todoDueTodayTotal }}</strong></div
        >
      </article>
      <article class="todo-summary-card">
        <span class="todo-summary-card__icon"
          ><SvgIcon :src="icon.todoSummary.week" color="var(--todo-summary-icon-fg)" size="21" aria-hidden="true"
        /></span>
        <div
          ><span>{{ t('inbox.todoSummaryWeek') }}</span
          ><strong>{{ inbox.todoDueWeekTotal }}</strong></div
        >
      </article>
    </section>

    <ResourceCenterSectionNav v-if="!isTodoFocused && isMobileResourceInbox" class="section-switcher" />

    <aside
      v-if="!isTodoFocused && !bookmark.isMobile"
      class="resource-inbox-scope"
      :aria-label="t('inbox.pendingScopeTitle')"
    >
      <span class="resource-inbox-scope__title">{{ t('inbox.pendingScopeTitle') }}</span>
      <BButton
        v-for="item in filterOptions"
        :key="item.key"
        class="resource-inbox-scope__item"
        :class="{ active: inbox.filterType === item.key }"
        :aria-pressed="inbox.filterType === item.key"
        @click="changeInboxScope(item.key)"
      >
        <span class="resource-inbox-scope__dot" :class="`is-${item.key}`" aria-hidden="true"></span>
        <span class="resource-inbox-scope__label">{{ item.label }}</span>
        <span class="resource-inbox-scope__count">{{ item.badge }}</span>
      </BButton>
      <div class="resource-inbox-scope__divider"></div>
      <span class="resource-inbox-scope__title">{{ t('inbox.sortTitle') }}</span>
      <BButton
        v-for="item in sortOptions"
        :key="item.value"
        class="resource-inbox-scope__item resource-inbox-scope__item--sort"
        :class="{ active: inbox.sort === item.value }"
        :aria-pressed="inbox.sort === item.value"
        @click="changeInboxSort(item.value)"
      >
        <span class="resource-inbox-scope__dot" aria-hidden="true"></span>
        <span class="resource-inbox-scope__label">{{ item.label }}</span>
      </BButton>
    </aside>

    <section
      class="inbox-toolbar"
      :class="{
        'inbox-toolbar--todo-primary': isMobileTodoPrimary,
        'inbox-toolbar--todo-desktop': isTodoFocused && !isMobileTodoPrimary,
      }"
    >
      <template v-if="isTodoFocused">
        <template v-if="isMobileTodoPrimary">
          <!-- 移动端待办不放第二个文本搜索框：查找待办统一走顶栏全局搜索，
               这里只保留状态、排序、视图等结构化筛选。 -->
          <BTabs
            v-model:active-tab="todo.status"
            :options="todoStatusTabOptions"
            variant="pill"
            @change="changeTodoStatus"
          />
          <BSelect
            v-if="showTodoSort && (todo.items.length || pageLoading)"
            class="mobile-todo-sort"
            v-model:value="todo.sort"
            :options="sortOptions"
            @change="search"
          />
        </template>
        <template v-else>
          <div class="inbox-toolbar__todo-tabs">
            <BTabs
              v-if="todoView === 'list' || todoView === 'matrix'"
              v-model:active-tab="todo.status"
              class="inbox-toolbar__todo-status"
              :options="todoStatusTabOptions"
              variant="pill"
              :aria-label="t('inbox.todoStatusGroupLabel')"
              @change="changeTodoStatus"
            />
            <BTabs
              v-model:active-tab="todoView"
              class="inbox-toolbar__todo-views"
              :options="todoViewOptions"
              variant="line"
              :aria-label="t('inbox.todoViewGroupLabel')"
            />
          </div>
          <div class="inbox-toolbar__right inbox-toolbar__right--todo">
            <BInput
              v-model:value="inbox.keyword"
              :placeholder="t('inbox.todoSearchPlaceholder')"
              clearable
              @enter="search"
            />
            <BSelect v-if="showTodoSort" v-model:value="todo.sort" :options="sortOptions" @change="search" />
            <BButton
              v-if="todoView === 'list' && !todoSelectionMode && (todo.items.length || pageLoading)"
              size="small"
              @click="toggleTodoSelectionMode"
            >
              {{ t('inbox.todoBatchSelect') }}
            </BButton>
          </div>
        </template>
      </template>
      <template v-else>
        <BTabs
          v-if="bookmark.isMobile"
          v-model:active-tab="inbox.filterType"
          :options="filterOptions"
          variant="pill"
          @change="changeFilter"
        />
        <div class="inbox-toolbar__right inbox-toolbar__right--resources">
          <BInput
            v-if="!bookmark.isMobile"
            v-model:value="inbox.keyword"
            :placeholder="t('inbox.searchPlaceholder')"
            clearable
            @enter="search"
          />
          <BSelect v-if="bookmark.isMobile" v-model:value="inbox.sort" :options="sortOptions" @change="search" />
          <BButton v-if="!bookmark.isMobile" type="primary" class="inbox-resource-capture" @click="openCapture">
            <SvgIcon :src="icon.common.plus" size="16" aria-hidden="true" />
            {{ t('inbox.quickCapture') }}
          </BButton>
        </div>
      </template>
    </section>

    <!-- 快速创建输入行已移除:与「新建待办」编辑器重复,移动端顶栏加号与桌面主按钮足够覆盖创建入口。
         「批量选择」并入视图切换行,不再单独占一行;进入批量态后才展开完整操作条。 -->
    <section v-if="isTodoFocused && bookmark.isMobile" class="todo-workspace-toolbar">
      <BTabs
        v-model:active-tab="todoView"
        class="todo-workspace-toolbar__views"
        :options="todoViewOptions"
        variant="pill"
      />
      <BButton
        v-if="todoView === 'list' && !todoSelectionMode && (todo.items.length || pageLoading)"
        class="todo-workspace-toolbar__select"
        size="small"
        @click="toggleTodoSelectionMode"
      >
        {{ t('inbox.todoBatchSelect') }}
      </BButton>
    </section>

    <section v-if="isTodoFocused && todoView === 'list' && todoSelectionMode" class="todo-list-toolbar">
      <BCheckbox
        :model-value="selectedTodoIds.length === todo.items.length"
        :indeterminate="selectedTodoIds.length > 0 && selectedTodoIds.length < todo.items.length"
        @update:model-value="toggleSelectAllTodos"
      >
        {{ t('inbox.selectedCount', { count: selectedTodoIds.length }) }}
      </BCheckbox>
      <div v-if="!bookmark.isMobile" class="todo-list-toolbar__actions">
        <BButton
          v-if="todo.status !== 'completed'"
          size="small"
          type="primary"
          :loading="todoBatchMutating"
          :disabled="!selectedTodoIds.length"
          @click="completeSelectedTodos"
        >
          {{ t('inbox.completeSelected') }}
        </BButton>
        <BButton
          size="small"
          type="danger"
          :loading="todoBatchMutating"
          :disabled="!selectedTodoIds.length"
          @click="confirmDeleteSelectedTodos"
        >
          {{ t('inbox.deleteSelected') }}
        </BButton>
        <BButton size="small" @click="toggleTodoSelectionMode">{{ t('inbox.todoBatchCancel') }}</BButton>
      </div>
      <BButton v-else size="small" class="todo-list-toolbar__cancel" @click="toggleTodoSelectionMode">
        {{ t('common.cancel') }}
      </BButton>
    </section>
    <MobileStickyActionBar v-if="isMobileTodoPrimary && todoView === 'list' && todoSelectionMode">
      <BButton
        v-if="todo.status !== 'completed'"
        type="primary"
        :loading="todoBatchMutating"
        :disabled="!selectedTodoIds.length"
        @click="completeSelectedTodos"
      >
        {{ t('inbox.completeSelected') }}
      </BButton>
      <BButton
        type="danger"
        :loading="todoBatchMutating"
        :disabled="!selectedTodoIds.length"
        @click="confirmDeleteSelectedTodos"
      >
        {{ t('inbox.deleteSelected') }}
      </BButton>
    </MobileStickyActionBar>

    <section v-if="todoUndo" class="todo-undo-banner" role="status">
      <span>{{
        todoUndo.kind === 'delete'
          ? t('inbox.todoDeletedCount', { count: todoUndo.ids.length })
          : t('inbox.todoCompletedCount', { count: todoUndo.ids.length })
      }}</span>
      <BButton size="small" :loading="todoUndoing" @click="undoTodoAction">{{ t('common.undo') }}</BButton>
      <BButton size="small" :aria-label="t('common.close')" @click="clearTodoUndo">{{ t('common.close') }}</BButton>
    </section>

    <section
      v-if="inbox.filterType !== 'todo' && inbox.items.length && (!isMobileResourceInbox || resourceSelectionMode)"
      class="inbox-batch"
    >
      <BCheckbox
        :model-value="allItemsSelected"
        :indeterminate="someItemsSelected"
        @update:model-value="toggleSelectAll"
      >
        {{ t('inbox.selectAll', { count: inbox.items.length }) }}
      </BCheckbox>
      <div class="inbox-batch__actions">
        <span>{{ t('inbox.selectedCount', { count: selectedItems.length }) }}</span>
        <BButton
          size="small"
          type="primary"
          :disabled="!selectedItems.length || hasPendingOperation"
          :loading="batchCompleting"
          @click="completeSelected"
        >
          {{ t('inbox.completeSelected') }}
        </BButton>
        <BButton
          size="small"
          type="danger"
          :disabled="!selectedItems.length || hasPendingOperation"
          :loading="batchDeleting"
          @click="confirmDelete(selectedItems, true)"
        >
          {{ t('inbox.deleteSelected') }}
        </BButton>
      </div>
    </section>

    <section v-if="pageLoadFailed && actionItems.length" class="inbox-error-banner">
      <span>{{ t('inbox.loadFailedDesc') }}</span>
      <BButton size="small" @click="refreshList()">{{ t('inbox.retry') }}</BButton>
    </section>

    <section
      class="inbox-content"
      :class="{
        'has-top-fade': showTopFade && !isTodoFocused,
        'has-bottom-fade': showBottomFade && !isTodoFocused,
      }"
    >
      <div
        ref="scrollContainer"
        class="inbox-scroll"
        @scroll="handleInboxScroll"
        @touchstart.passive="pullRefresh.onTouchStart"
        @touchmove="pullRefresh.onTouchMove"
        @touchend.passive="pullRefresh.onTouchEnd"
        @touchcancel.passive="pullRefresh.onTouchCancel"
      >
        <BLoading :loading="pageLoading" class="inbox-loading">
          <div v-if="!pageLoading && pageLoadFailed && actionItems.length === 0" class="inbox-empty inbox-error">
            <div class="inbox-empty__icon">!</div>
            <h2>{{ t('inbox.loadFailedTitle') }}</h2>
            <p>{{ t('inbox.loadFailedDesc') }}</p>
            <BButton type="primary" @click="refreshList()">{{ t('inbox.retry') }}</BButton>
          </div>
          <div
            v-else-if="!pageLoading && actionItems.length === 0"
            class="inbox-empty"
            :class="{ 'inbox-empty--filtered': !isInboxGloballyEmpty || inbox.filterType === 'todo' }"
          >
            <div class="inbox-empty__icon">{{ isInboxGloballyEmpty ? '✓' : '0' }}</div>
            <h2>{{ emptyStateTitle }}</h2>
            <p>{{ emptyStateDesc }}</p>
            <BButton type="primary" @click="handleEmptyStateAction">{{ emptyStateAction }}</BButton>
          </div>
          <TodoMatrixView
            v-else-if="isTodoFocused && todoView === 'matrix'"
            :items="todo.items"
            :mobile="bookmark.isMobile"
            :disabled="hasPendingOperation || todoBatchMutating"
            :deleting-id="deletingTodoId"
            @preview="openTodoPreview"
            @toggle-complete="toggleTodo"
            @update-checklist="updateTodoChecklist"
            @edit="openTodoEditor"
            @delete="confirmDeleteTodo"
            @add-to-calendar="openTodoCalendar"
            @snooze="snoozeTodoItem"
            @update-priority="updateTodoPriority"
            @series-action="handleTodoSeriesAction"
          />
          <TodoScheduleView
            v-else-if="isTodoFocused && (todoView === 'agenda' || todoView === 'calendar')"
            ref="scheduleViewRef"
            :items="todo.items"
            :view="todoView"
            :swipe-enabled="bookmark.isMobile"
            :disabled="hasPendingOperation || todoBatchMutating"
            :deleting-id="deletingTodoId"
            @preview="openTodoPreview"
            @edit="openTodoEditor"
            @delete="confirmDeleteTodo"
            @range-change="ensureCalendarRange"
          />
          <div v-else-if="isTodoFocused" class="todo-group-list">
            <section v-for="group in todoGroupLists" :key="group.key" class="todo-group">
              <header>
                <strong>{{ t(`inbox.todoGroups.${group.key}`) }}</strong>
                <span>{{ group.count }}</span>
              </header>
              <div class="todo-group__items">
                <template v-for="node in group.items" :key="node.key">
                  <TodoSeriesGroup
                    v-if="node.kind === 'series'"
                    :series-id="node.seriesId"
                    :representative="node.representative"
                    :items="node.items"
                    :series-items="node.seriesItems"
                    :selectable="todoSelectionMode"
                    :selected-ids="selectedTodoIds"
                    :disabled="hasPendingOperation || todoBatchMutating"
                    :deleting-id="deletingTodoId"
                    :swipe-enabled="bookmark.isMobile"
                    :open-swipe-id="openSwipeTodoId"
                    @swipe-start="beginTodoSwipe"
                    @update-swipe-open="(item, open) => updateTodoSwipe(item.id, open)"
                    @select="(item, selected) => toggleTodoSelected(item.id, selected)"
                    @toggle-complete="toggleTodo"
                    @update-checklist="updateTodoChecklist"
                    @preview="openTodoPreview"
                    @edit="openTodoEditor"
                    @delete="confirmDeleteTodo"
                    @add-to-calendar="openTodoCalendar"
                    @snooze="snoozeTodoItem"
                    @update-priority="updateTodoPriority"
                    @series-action="handleTodoSeriesAction"
                  />
                  <TodoItem
                    v-else
                    :item="node.item"
                    :selectable="todoSelectionMode"
                    :selected="selectedTodoIds.includes(node.item.id)"
                    :disabled="hasPendingOperation || todoBatchMutating"
                    :deleting="deletingTodoId === node.item.id"
                    :swipe-enabled="bookmark.isMobile"
                    :swipe-open="openSwipeTodoId === node.item.id"
                    @swipe-start="beginTodoSwipe(node.item.id)"
                    @update:swipe-open="updateTodoSwipe(node.item.id, $event)"
                    @select="toggleTodoSelected(node.item.id, $event)"
                    @toggle-complete="toggleTodo(node.item, $event)"
                    @update-checklist="updateTodoChecklist(node.item, $event)"
                    @preview="openTodoPreview(node.item)"
                    @edit="openTodoEditor(node.item)"
                    @delete="confirmDeleteTodo(node.item)"
                    @add-to-calendar="openTodoCalendar(node.item)"
                    @snooze="snoozeTodoItem(node.item, $event)"
                    @update-priority="updateTodoPriority(node.item, $event)"
                    @series-action="handleTodoSeriesAction(node.item, $event)"
                  />
                </template>
              </div>
            </section>
          </div>
          <div v-else class="inbox-list">
            <!-- 资源中心只展示资源；待办由独立工作区承载。 -->
            <template v-for="action in actionItems" :key="action.key">
              <div
                v-if="action.actionType === 'resource'"
                class="resource-inbox-entry"
                :class="{
                  'is-inspected': !bookmark.isMobile && activeInspectedInboxKey === inbox.resourceKey(action.item),
                }"
              >
                <InboxItem
                  :item="action.item"
                  :selectable="!isMobileResourceInbox || resourceSelectionMode"
                  :selected="inbox.selectedKeys.includes(inbox.resourceKey(action.item))"
                  :completing="completingKey === inbox.resourceKey(action.item)"
                  :deleting="deletingKey === inbox.resourceKey(action.item)"
                  :disabled="hasPendingOperation"
                  :selection-mode="resourceSelectionMode"
                  :swipe-enabled="bookmark.isMobile"
                  :swipe-open="openSwipeResourceKey === inbox.resourceKey(action.item)"
                  @swipe-start="beginResourceSwipe(action.item)"
                  @update:swipe-open="updateResourceSwipe(action.item, $event)"
                  @select="toggleSelected(action.item, $event)"
                  @open="handleInboxItemOpen(action.item)"
                  @complete="completeOne(action.item)"
                  @delete="confirmDelete([action.item])"
                />
              </div>
              <TodoItem
                v-else
                :item="action.item"
                :disabled="hasPendingOperation"
                :deleting="deletingTodoId === action.item.id"
                :swipe-enabled="bookmark.isMobile"
                :swipe-open="openSwipeTodoId === action.item.id"
                @swipe-start="beginTodoSwipe(action.item.id)"
                @update:swipe-open="updateTodoSwipe(action.item.id, $event)"
                @toggle-complete="toggleTodo(action.item, $event)"
                @update-checklist="updateTodoChecklist(action.item, $event)"
                @preview="openTodoPreview(action.item)"
                @edit="openTodoEditor(action.item)"
                @delete="confirmDeleteTodo(action.item)"
                @add-to-calendar="openTodoCalendar(action.item)"
                @snooze="snoozeTodoItem(action.item, $event)"
                @update-priority="updateTodoPriority(action.item, $event)"
                @series-action="handleTodoSeriesAction(action.item, $event)"
              />
            </template>
          </div>
        </BLoading>
      </div>
    </section>

    <aside v-if="!isTodoFocused && !bookmark.isMobile" class="resource-inbox-inspector">
      <template v-if="inspectedInboxItem">
        <div class="resource-inbox-inspector__eyebrow">{{ t('inbox.currentPendingResource') }}</div>
        <span class="resource-inbox-inspector__type">{{ t(`inbox.${inspectedInboxItem.resourceType}`) }}</span>
        <h2>{{ inspectedInboxItem.title || t('inbox.untitled') }}</h2>
        <p>{{ inspectedInboxSummary }}</p>
        <dl class="resource-inbox-inspector__meta">
          <div>
            <dt>{{ t('inbox.collectedAt') }}</dt>
            <dd>{{ inspectedInboxItem.collectedAt || '-' }}</dd>
          </div>
          <div>
            <dt>{{ t('inbox.resourceLocation') }}</dt>
            <dd>{{ inspectedInboxItem.detail || inspectedInboxItem.source || '-' }}</dd>
          </div>
        </dl>
        <div class="resource-inbox-inspector__actions">
          <BButton block size="large" type="primary" @click="openResource(inspectedInboxItem)">
            {{ t('inbox.organize') }}
          </BButton>
          <BButton
            block
            size="large"
            class="resource-inbox-inspector__action--complete"
            :loading="completingKey === inbox.resourceKey(inspectedInboxItem)"
            @click="completeOne(inspectedInboxItem)"
          >
            {{ t('inbox.complete') }}
          </BButton>
          <BButton
            block
            size="large"
            class="resource-inbox-inspector__action--delete"
            :loading="deletingKey === inbox.resourceKey(inspectedInboxItem)"
            @click="confirmDelete([inspectedInboxItem])"
          >
            {{ t('inbox.deleteResource') }}
          </BButton>
        </div>
      </template>
      <div v-else class="resource-inbox-inspector__empty">
        <strong>{{ t('inbox.inspectorEmptyTitle') }}</strong>
        <p>{{ t('inbox.inspectorEmptyDesc') }}</p>
      </div>
    </aside>
    <TodoPreviewDrawer
      v-if="previewTodo"
      v-model:visible="todoPreviewVisible"
      :item="previewTodo"
      :disabled="hasPendingOperation || todoBatchMutating"
      @edit="openTodoEditor"
      @update-checklist="updateTodoChecklist"
    />
    <TodoEditorModal v-model:visible="todoEditorVisible" :item="editingTodo" @saved="afterTodoSaved" />
    <TodoCalendarModal
      v-model:visible="todoCalendarVisible"
      :item="calendarTodo"
      :exporting="exportingCalendar"
      :inserting="insertingCalendar"
      @confirm="exportTodoCalendar"
      @insert="addTodoToSystemCalendar"
    />
  </main>
</template>

<script setup lang="ts">
  import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
  import { useI18n } from 'vue-i18n';
  import { useRoute, useRouter } from 'vue-router';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import MobileStickyActionBar from '@/components/mobile/MobileStickyActionBar.vue';
  import BCheckbox from '@/components/base/BasicComponents/BCheckbox.vue';
  import BInput from '@/components/base/BasicComponents/BInput.vue';
  import BLoading from '@/components/base/BasicComponents/BLoading.vue';
  import BSelect from '@/components/base/BasicComponents/BSelect.vue';
  import BTabs from '@/components/base/BasicComponents/BTabs.vue';
  import message from '@/components/base/BasicComponents/BMessage/BMessage';
  import Alert from '@/components/base/BasicComponents/BModal/Alert';
  import InboxItem from '@/components/inbox/InboxItem.vue';
  import TodoItem from '@/components/todo/TodoItem.vue';
  import TodoSeriesGroup from '@/components/todo/TodoSeriesGroup.vue';
  import TodoEditorModal from '@/components/todo/TodoEditorModal.vue';
  import TodoPreviewDrawer from '@/components/todo/TodoPreviewDrawer.vue';
  import TodoCalendarModal from '@/components/todo/TodoCalendarModal.vue';
  import TodoMatrixView from '@/components/todo/TodoMatrixView.vue';
  import TodoScheduleView from '@/components/todo/TodoScheduleView.vue';
  import { buildIcsFileName, buildTodoCalendarEvent, buildTodoIcs, deliverIcsFile } from '@/utils/ics';
  import { deliverIcsViaAndroidBridge, insertAndroidCalendarEvent } from '@/utils/androidCalendar';
  import { hasAndroidBridge } from '@/utils/androidBridge';
  import { bookmarkStore, inboxStore, todoStore, useUserStore } from '@/store';
  import type { InboxItem as InboxItemType } from '@/api/inboxApi';
  import { blockGuestWrite } from '@/composables/useGuestGuard';
  import { recordOperation } from '@/api/commonApi';
  import { OPERATION_LOG_MAP } from '@/config/logMap';
  import { isMobileResourceInboxTab } from '@/config/mobileNavigation';
  import ResourceCenterSectionNav from '@/components/searchCenter/ResourceCenterSectionNav.vue';
  import ResourceCenterTopBar from '@/components/searchCenter/ResourceCenterTopBar.vue';
  import { getMobileResourceEntryPath } from '@/composables/useMobileNavigationState';
  import { batchDeleteSearchResources, clearGlobalSearchCache } from '@/api/search';
  import type {
    TodoChecklistItem,
    TodoFilterStatus,
    TodoItem as TodoItemType,
    TodoPriority,
    TodoSeriesAction,
    TodoSort,
  } from '@/api/todoApi';
  import {
    deleteTodoPlanV2,
    ensureTodoCalendarRangeV2,
    pauseTodoSeriesV2,
    resumeTodoSeriesV2,
    skipTodoInstanceV2,
    type TodoPlanScope,
  } from '@/api/todoApi';
  import { useMobileTopBar } from '@/composables/useMobileTopBar';
  import { useAndroidPullRefresh } from '@/composables/useAndroidPullRefresh';
  import { useForegroundRefresh } from '@/composables/useForegroundRefresh';
  import { todoSnoozeAt, type TodoGroupKey, type TodoSnoozePreset } from '@/utils/todoPlanning';
  import { buildTodoListNodes, type TodoListNode } from '@/utils/todoSeriesGrouping';
  import { updatePreference } from '@/utils/savePreference';
  import { generateUUID } from '@/utils/common';
  import icon from '@/config/icon';

  const { t } = useI18n();
  const bookmark = bookmarkStore();
  const router = useRouter();
  const route = useRoute();
  const inbox = inboxStore();
  const todo = todoStore();
  const user = useUserStore();
  const completingKey = ref('');
  const deletingKey = ref('');
  const batchCompleting = ref(false);
  const batchDeleting = ref(false);
  const todoEditorVisible = ref(false);
  const editingTodo = ref<TodoItemType | null>(null);
  const todoPreviewVisible = ref(false);
  const previewTodoId = ref('');
  const previewTodoSeed = ref<TodoItemType | null>(null);
  const previewTodo = computed(
    () => todo.items.find((item) => item.id === previewTodoId.value) || previewTodoSeed.value,
  );
  const calendarTodo = ref<TodoItemType | null>(null);
  const todoCalendarVisible = ref(false);
  const exportingCalendar = ref(false);
  const insertingCalendar = ref(false);
  const updatingTodoId = ref('');
  const deletingTodoId = ref('');
  const openSwipeTodoId = ref('');
  const openSwipeResourceKey = ref('');
  const scheduleViewRef = ref<{ closeSwipe: () => void } | null>(null);
  type TodoView = 'list' | 'agenda' | 'calendar' | 'matrix';
  const normalizeTodoView = (value: unknown): TodoView =>
    value === 'agenda' || value === 'calendar' || value === 'matrix' ? value : 'list';
  const todoViewUsesStatusFilter = (view: TodoView) => view === 'list' || view === 'matrix';
  const todoView = ref<TodoView>(normalizeTodoView(user.preferences.todoView));
  const todoSelectionMode = ref(false);
  const resourceSelectionMode = ref(false);
  const selectedTodoIds = ref<string[]>([]);
  const todoBatchMutating = ref(false);
  const todoUndo = ref<{ kind: 'complete' | 'delete'; ids: string[] } | null>(null);
  const todoUndoing = ref(false);
  const todoGroupLists = ref<Array<{ key: TodoGroupKey; count: number; items: TodoListNode[] }>>([]);
  let todoUndoTimer = 0;
  let todoMidnightTimer = 0;
  const ensuredCalendarRanges = new Set<string>();
  const scrollContainer = ref<HTMLElement | null>(null);
  const showTopFade = ref(false);
  const showBottomFade = ref(false);
  const inspectedInboxKey = ref('');
  let resizeObserver: ResizeObserver | null = null;

  const isMobileResourceInbox = computed(() => bookmark.isMobile && isMobileResourceInboxTab(route.query.tab));
  const isMobileTodoPrimary = computed(() => bookmark.isMobile && !isMobileResourceInbox.value);
  const isTodoFocused = computed(() => isMobileTodoPrimary.value || inbox.filterType === 'todo');

  function resolveRequestedFilter(value: unknown) {
    const tab = String(value || '');
    if (tab === 'todo') return 'todo' as const;
    if (isMobileResourceInboxTab(tab)) return tab;
    return bookmark.isMobile ? ('todo' as const) : ('all' as const);
  }

  const selectedItems = computed(() =>
    inbox.items.filter((item) => inbox.selectedKeys.includes(inbox.resourceKey(item))),
  );
  const inspectedInboxItem = computed(
    () => inbox.items.find((item) => inbox.resourceKey(item) === inspectedInboxKey.value) || inbox.items[0] || null,
  );
  const activeInspectedInboxKey = computed(() =>
    inspectedInboxItem.value ? inbox.resourceKey(inspectedInboxItem.value) : '',
  );
  const inspectedInboxSummary = computed(() => {
    const raw = inspectedInboxItem.value?.summary || '';
    const text = raw
      .replace(/<br\s*\/?>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    return text || t('inbox.noSummary');
  });
  const allItemsSelected = computed(() => inbox.items.length > 0 && selectedItems.value.length === inbox.items.length);
  const someItemsSelected = computed(
    () => selectedItems.value.length > 0 && selectedItems.value.length < inbox.items.length,
  );
  const hasPendingOperation = computed(() =>
    Boolean(
      completingKey.value ||
      deletingKey.value ||
      batchCompleting.value ||
      batchDeleting.value ||
      updatingTodoId.value ||
      deletingTodoId.value,
    ),
  );
  const pageLoading = computed(() => {
    if (isMobileTodoPrimary.value) return todo.loading;
    if (isMobileResourceInbox.value) return inbox.loading;
    return inbox.filterType === 'todo' ? todo.loading : inbox.loading;
  });
  const pageLoadFailed = computed(() => {
    if (isMobileTodoPrimary.value) return todo.loadFailed;
    if (isMobileResourceInbox.value) return inbox.loadFailed;
    return inbox.filterType === 'todo' ? todo.loadFailed : inbox.loadFailed;
  });
  const pullRefresh = useAndroidPullRefresh({
    // 批量选择模式下顶部是操作条,下拉手势与勾选滑动容易互相误触,直接停用。
    enabled: computed(() => !todoSelectionMode.value && !resourceSelectionMode.value),
    externalBusy: pageLoading,
    getScrollContainer: () => scrollContainer.value,
    // 已有左滑面板展开时不允许下拉:此时用户的意图是操作那一项,不是刷新。
    canStart: () => !openSwipeTodoId.value && !openSwipeResourceKey.value,
    onRefresh: async () => {
      // 日程视图的滑动状态在子组件内部,外部只能命令它收起。
      scheduleViewRef.value?.closeSwipe();
      // refreshList 用返回值而非异常表达失败,且失败已由 loadFailed 的顶部横幅呈现,
      // 这里不再转成 reject,避免和横幅重复提示。
      await refreshList(false, true);
    },
  });
  /* 从后台切回来时补一次数据,走同一条静默路径。提示条由顶栏统一负责,页面不必接线。 */
  useForegroundRefresh({
    refresh: () => refreshList(false, true),
    canRefresh: () =>
      !todoSelectionMode.value && !resourceSelectionMode.value && !pageLoading.value && !todoBatchMutating.value,
  });
  const isInboxGloballyEmpty = computed(() =>
    inbox.filterType === 'todo' ? todo.pendingTotal === 0 : inbox.pendingTotal === 0,
  );
  const currentTypeLabel = computed(() =>
    inbox.filterType === 'all' ? t('inbox.all') : t(`inbox.${inbox.filterType}`),
  );
  const emptyStateTitle = computed(() => {
    if (inbox.filterType === 'todo') {
      return todo.status === 'completed' ? t('inbox.todoCompletedEmptyTitle') : t('inbox.todoEmptyTitle');
    }
    if (isInboxGloballyEmpty.value) return t('inbox.emptyTitle');
    if (inbox.filterType === 'all') return t('inbox.filterEmptyTitle');
    return t('inbox.typeEmptyTitle', { type: currentTypeLabel.value });
  });
  const emptyStateDesc = computed(() => {
    if (inbox.filterType === 'todo') {
      return isMobileTodoPrimary.value ? t('inbox.todoPrimaryEmptyDesc') : t('inbox.todoEmptyDesc');
    }
    if (isInboxGloballyEmpty.value) return t('inbox.emptyDesc');
    if (inbox.filterType === 'all') {
      return t('inbox.filterEmptyDesc', {
        count: inbox.pendingTotal,
      });
    }
    return t('inbox.typeEmptyDesc', {
      type: currentTypeLabel.value,
      count: inbox.pendingTotal,
    });
  });
  const emptyStateAction = computed(() => {
    if (inbox.filterType === 'all') return t('inbox.collectFirst');
    if (inbox.filterType === 'todo') return t('inbox.createTodo');
    return t('inbox.collectType', { type: currentTypeLabel.value });
  });

  const filterOptions = computed(() => {
    return [
      {
        key: 'all',
        label: t('inbox.all'),
        badge: inbox.pendingTotal,
      },
      { key: 'bookmark', label: t('inbox.bookmark'), badge: inbox.typeTotals.bookmark },
      { key: 'note', label: t('inbox.note'), badge: inbox.typeTotals.note },
      { key: 'file', label: t('inbox.file'), badge: inbox.typeTotals.file },
    ];
  });
  const sortOptions = computed(() =>
    inbox.filterType === 'todo'
      ? [
          { label: t('inbox.todoSmartSort'), value: 'smart' },
          { label: t('inbox.todoActionSort'), value: 'action' },
          { label: t('inbox.todoPrioritySort'), value: 'priority' },
          { label: t('inbox.newest'), value: 'newest' },
        ]
      : [
          { label: t('inbox.newest'), value: 'newest' },
          { label: t('inbox.oldest'), value: 'oldest' },
        ],
  );
  const showTodoSort = computed(() => todoView.value === 'list' && todo.status !== 'completed');
  function applyDefaultTodoSort() {
    const validSorts: TodoSort[] = ['smart', 'action', 'priority', 'newest'];
    if (!validSorts.includes(todo.sort)) todo.sort = 'smart';
  }
  // 桌面与移动端共用的待办状态切换页签(未完成/已完成/全部)。
  const todoPendingDisplayTotal = computed(() => {
    if (todo.keyword || !['pending', 'all'].includes(todo.effectiveStatus)) return todo.pendingTotal;
    const scheduledSeries = new Set<string>();
    let standaloneCount = 0;
    for (const item of todo.items) {
      if (item.status !== 'pending') continue;
      if (item.seriesId && item.series?.repeatMode === 'scheduled') scheduledSeries.add(item.seriesId);
      else standaloneCount += 1;
    }
    return standaloneCount + scheduledSeries.size;
  });
  const todoStatusTabOptions = computed<Array<{ key: TodoFilterStatus; label: string; badge?: number }>>(() => [
    { key: 'pending', label: t('inbox.todoPending'), badge: todoPendingDisplayTotal.value },
    { key: 'completed', label: t('inbox.todoCompleted') },
    { key: 'all', label: t('inbox.all') },
  ]);
  const todoViewOptions = computed(() => [
    { key: 'list', label: t('inbox.todoViewList') },
    { key: 'agenda', label: t('inbox.todoViewAgenda') },
    { key: 'calendar', label: t('inbox.todoViewCalendar') },
    { key: 'matrix', label: t(bookmark.isMobile ? 'inbox.todoViewMatrixCompact' : 'inbox.todoViewMatrix') },
  ]);
  const actionItems = computed(() => {
    if (inbox.filterType === 'todo') {
      return todo.items.map((item) => ({ actionType: 'todo' as const, key: `todo:${item.id}`, item }));
    }
    const resources = inbox.items.map((item) => ({
      actionType: 'resource' as const,
      key: inbox.resourceKey(item),
      item,
    }));
    // 资源中心的“全部”只展示资源；待办拥有独立的列表 / 议程 / 日历 / 四象限工作区。
    return resources;
  });

  watch(
    () => user.id,
    async (id) => {
      todoPreviewVisible.value = false;
      previewTodoId.value = '';
      previewTodoSeed.value = null;
      todoView.value = normalizeTodoView(user.preferences.todoView);
      inbox.resetForOwner(id || 'visitor');
      todo.resetForOwner(id || 'visitor');
      ensuredCalendarRanges.clear();
      resourceSelectionMode.value = false;
      syncRequestedMobileMode();
      if (isTodoFocused.value) applyDefaultTodoSort();
      await refreshList();
    },
  );

  onMounted(async () => {
    inbox.resetForOwner(user.id || 'visitor');
    todo.resetForOwner(user.id || 'visitor');
    resourceSelectionMode.value = false;
    if (bookmark.isMobile) syncRequestedMobileMode();
    else inbox.filterType = resolveRequestedFilter(route.query.tab);
    if (isTodoFocused.value) applyDefaultTodoSort();
    const requestedTodoId = String(route.query.todoId || '');
    if (isTodoFocused.value) todo.status = requestedTodoId ? 'all' : 'pending';
    await refreshList();
    await openRequestedTodo(requestedTodoId, { listReady: true });
    if (scrollContainer.value) {
      resizeObserver = new ResizeObserver(updateScrollFade);
      resizeObserver.observe(scrollContainer.value);
    }
    scheduleTodoMidnightRefresh();
  });
  onBeforeUnmount(() => {
    resizeObserver?.disconnect();
    window.clearTimeout(todoUndoTimer);
    window.clearTimeout(todoMidnightTimer);
  });

  watch(
    () => [inbox.items.length, todo.items.length, inbox.loading, todo.loading],
    () => {
      syncTodoGroups();
      void nextTick(updateScrollFade);
    },
  );
  watch(
    () => todo.items,
    () => syncTodoGroups(),
  );
  watch(
    () => user.preferences.todoView,
    (view) => {
      const preferredView = normalizeTodoView(view);
      if (todoView.value !== preferredView) todoView.value = preferredView;
    },
  );
  watch(todoView, (view) => {
    openSwipeTodoId.value = '';
    void nextTick(() => {
      if (!scrollContainer.value) return;
      scrollContainer.value.scrollTop = 0;
      updateScrollFade();
    });
    if (view !== 'list' && todoSelectionMode.value) {
      todoSelectionMode.value = false;
      selectedTodoIds.value = [];
    }
    // 列表和四象限共用未完成/已完成/全部；议程、日历始终展示全量。
    // preserveStatus 保住页签选择，切回有状态筛选的视图时再按该口径恢复。
    if (!todoViewUsesStatusFilter(view)) {
      if (todo.effectiveStatus !== 'all') void todo.refreshList({ status: 'all', preserveStatus: true });
    } else if (todo.effectiveStatus !== todo.status) {
      void todo.refreshList({ status: todo.status });
    }
    if (user.preferences.todoView === view) return;
    updatePreference({ todoView: view }).catch(() => {
      message.warning(t('settings.saveFailed'));
    });
  });

  /**
   * 定位并打开指定待办。
   *
   * 从全局搜索点待办结果时组件通常已经挂载，只有路由 query 变化，
   * 因此不能只在 onMounted 里处理，否则地址变了却要刷新才弹出详情。
   */
  async function openRequestedTodo(todoId: string, options: { listReady?: boolean } = {}) {
    if (!todoId) return;
    let requestedTodo = todo.items.find((item) => item.id === todoId);
    if (!requestedTodo && !options.listReady) {
      // 目标可能是已完成待办，默认的「未完成」筛选会让它落在列表之外
      if (isMobileTodoPrimary.value || inbox.filterType === 'todo') todo.status = 'all';
      await refreshList();
      requestedTodo = todo.items.find((item) => item.id === todoId);
    }
    if (!requestedTodo) return;
    const query = { ...route.query };
    delete query.todoId;
    await router.replace({ query });
    openTodoPreview(requestedTodo);
  }

  watch(
    () => route.query.tab,
    async (tab, previousTab) => {
      if (tab === previousTab) return;
      const nextFilter = resolveRequestedFilter(tab);
      if (inbox.filterType === nextFilter) return;
      inbox.filterType = nextFilter;
      inbox.keyword = '';
      todo.keyword = '';
      // 带 todoId 进来时要能定位已完成待办，不能强制回到「未完成」
      if (nextFilter === 'todo') {
        todo.status = route.query.todoId ? 'all' : 'pending';
        applyDefaultTodoSort();
      } else {
        inbox.sort = 'newest';
        resourceSelectionMode.value = false;
        inbox.selectedKeys = [];
      }
      await refreshList(true);
    },
  );

  // 声明在 tab watch 之后：先完成视图切换，再定位并打开目标待办
  watch(
    () => route.query.todoId,
    (value) => {
      void openRequestedTodo(String(value || ''));
    },
  );

  function syncRequestedMobileMode() {
    if (!bookmark.isMobile) return;
    inbox.filterType = resolveRequestedFilter(route.query.tab);
    if (inbox.filterType === 'todo') {
      if (!route.query.todoId) todo.status = 'pending';
    } else {
      inbox.sort = 'newest';
    }
  }

  function openCapture() {
    if (blockGuestWrite('inbox-capture', t('inbox.guestPrompt'))) return;
    recordOperation(OPERATION_LOG_MAP.inbox.openCapture);
    inbox.openQuickCapture(inbox.filterType === 'all' ? 'note' : inbox.filterType);
  }

  async function changeInboxScope(filter: 'all' | InboxItemType['resourceType']) {
    if (inbox.filterType === filter) return;
    inbox.filterType = filter;
    await changeFilter();
  }

  async function changeInboxSort(sort: 'newest' | 'oldest') {
    if (inbox.sort === sort) return;
    inbox.sort = sort;
    await search();
  }

  function inspectInboxResource(item: InboxItemType) {
    inspectedInboxKey.value = inbox.resourceKey(item);
  }

  function handleInboxItemOpen(item: InboxItemType) {
    if (bookmark.isMobile) {
      openResource(item);
      return;
    }
    inspectInboxResource(item);
  }

  function setMobileInboxKeyword(value: string) {
    inbox.keyword = value;
  }

  function enterResourceSelection() {
    if (!isMobileResourceInbox.value) return;
    openSwipeResourceKey.value = '';
    resourceSelectionMode.value = true;
    inbox.selectedKeys = [];
  }

  function leaveResourceSelection() {
    openSwipeResourceKey.value = '';
    resourceSelectionMode.value = false;
    inbox.selectedKeys = [];
  }

  async function toggleMobileResourceSort() {
    if (!isMobileResourceInbox.value) return;
    inbox.sort = inbox.sort === 'newest' ? 'oldest' : 'newest';
    await refreshList(true);
  }

  async function cycleMobileResourceFilter() {
    if (!isMobileResourceInbox.value) return;
    const filters = ['all', 'bookmark', 'note', 'file'];
    const currentIndex = Math.max(0, filters.indexOf(inbox.filterType));
    inbox.filterType = filters[(currentIndex + 1) % filters.length] as any;
    await changeFilter();
  }

  useMobileTopBar(['inbox'], {
    // 待整理分区自画顶栏（返回 + 搜索 + 创建），待办分区仍用共享顶栏
    ownTopBar: () => isMobileResourceInbox.value,
    searchSourceType: 'todo',
    onAdd: () => {
      if (isMobileTodoPrimary.value) openTodoEditor();
      else openCapture();
    },
    addLabel: () => (isMobileTodoPrimary.value ? t('inbox.createTodo') : t('inbox.quickCapture')),
  });
  /**
   * 待整理顶栏的返回：回到来源页。
   *
   * 进入资源中心的路径很多（全局搜索的「查看全部」、我的 → 资源中心、今日 → 待整理摘要），
   * 固定目标必然在某些路径下把人送错地方；没有历史时兜底到资料区，
   * 因为资源中心本质是资料的统一视图。
   */
  function leaveResourceInbox() {
    if (window.history.length > 1) {
      router.back();
      return;
    }
    void router.push(getMobileResourceEntryPath());
  }

  function handleEmptyStateAction() {
    if (isMobileTodoPrimary.value || inbox.filterType === 'todo') openTodoEditor();
    else openCapture();
  }
  async function changeFilter() {
    if (inbox.filterType === 'todo') applyDefaultTodoSort();
    else inbox.sort = 'newest';
    router.replace({
      query: {
        ...route.query,
        tab: isMobileResourceInbox.value ? inbox.filterType : inbox.filterType === 'all' ? undefined : inbox.filterType,
      },
    });
    await refreshList(true);
  }
  async function changeTodoStatus() {
    await refreshList(true);
  }
  async function search() {
    await refreshList(true);
  }
  // silent: 下拉刷新专用 —— 不进 loading(旧列表留在屏幕上),也不重置滚动位置。
  async function refreshList(resetScroll = false, silent = false) {
    todo.keyword = inbox.keyword;
    let refreshed = false;
    let inboxCountsReady = false;
    if (inbox.filterType === 'todo') {
      // 四象限首次作为默认视图进入时，store 的 effectiveStatus 仍可能是 all；
      // 显式使用当前状态页签，避免“未完成”高亮却混入已完成待办。
      refreshed = await todo.refreshList({
        silent,
        ...(todoView.value === 'matrix' ? { status: todo.status } : {}),
      });
      inboxCountsReady = await inbox.refreshCount();
    } else if (inbox.filterType === 'all') {
      const inboxRefreshed = await inbox.refreshList({ silent });
      refreshed = inboxRefreshed;
      inboxCountsReady = inboxRefreshed || (await inbox.refreshCount());
    } else {
      const inboxRefreshed = await inbox.refreshList({ silent });
      refreshed = inboxRefreshed;
      inboxCountsReady = inboxRefreshed || (await inbox.refreshCount());
    }
    if (inboxCountsReady) todo.pendingTotal = inbox.todoPendingTotal;
    await nextTick();
    if (resetScroll && scrollContainer.value) scrollContainer.value.scrollTop = 0;
    updateScrollFade();
    return refreshed;
  }
  async function ensureCalendarRange(range: { startDate: string; endDate: string }) {
    if (!user.id || todoView.value !== 'calendar') return;
    const key = `${range.startDate}:${range.endDate}`;
    if (ensuredCalendarRanges.has(key)) return;
    ensuredCalendarRanges.add(key);
    try {
      const response = await ensureTodoCalendarRangeV2(range.endDate);
      if (response?.status !== 200) throw new Error(response?.msg || 'calendar range failed');
      if (Number(response?.data?.createdCount || 0) > 0) {
        await todo.refreshList({ status: 'all', preserveStatus: true, silent: true });
      }
    } catch {
      ensuredCalendarRanges.delete(key);
      message.warning(t('inbox.todoCalendarRangeFailed'));
    }
  }
  function syncTodoGroups() {
    const keys: TodoGroupKey[] =
      todo.status === 'completed'
        ? ['completed']
        : todo.status === 'all'
          ? ['overdue', 'today', 'upcoming', 'later', 'noDate', 'completed']
          : ['overdue', 'today', 'upcoming', 'later', 'noDate'];
    const nodes = buildTodoListNodes(todo.items, { sort: todo.sort });
    todoGroupLists.value = keys
      .map((key) => ({
        key,
        items: nodes.filter((node) => node.bucket === key),
      }))
      .map((group) => ({
        ...group,
        // 分组角标表达当前可操作的展示对象数；系列真实实例数在卡片入口和明细中单独披露。
        count: group.items.length,
      }))
      .filter((group) => group.count > 0);
    selectedTodoIds.value = selectedTodoIds.value.filter((id) => todo.items.some((item) => item.id === id));
  }
  function scheduleTodoMidnightRefresh() {
    window.clearTimeout(todoMidnightTimer);
    const now = new Date();
    const nextDay = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0, 100);
    todoMidnightTimer = window.setTimeout(() => {
      syncTodoGroups();
      scheduleTodoMidnightRefresh();
    }, nextDay.getTime() - now.getTime());
  }
  async function updateTodoPriority(item: TodoItemType, priority: TodoPriority) {
    if (item.priority === priority) return;
    const payload = todo.items.map((candidate) => ({
      id: candidate.id,
      dueAt: candidate.dueAt || null,
      priority: candidate.id === item.id ? priority : candidate.priority,
    }));
    const result = await todo.reorder(payload);
    if (result === false) message.error(t('inbox.todoReorderFailed'));
  }
  function toggleTodoSelected(id: string, selected: boolean) {
    selectedTodoIds.value = selected
      ? [...new Set([...selectedTodoIds.value, id])]
      : selectedTodoIds.value.filter((value) => value !== id);
  }
  function toggleTodoSelectionMode() {
    openSwipeTodoId.value = '';
    todoSelectionMode.value = !todoSelectionMode.value;
    if (!todoSelectionMode.value) selectedTodoIds.value = [];
  }
  function toggleSelectAllTodos(selected: boolean) {
    selectedTodoIds.value = selected ? todo.items.map((item) => item.id) : [];
  }
  async function completeSelectedTodos() {
    const ids = [...selectedTodoIds.value];
    if (!ids.length || todoBatchMutating.value) return;
    todoBatchMutating.value = true;
    try {
      const result = await todo.batchComplete(ids);
      if (result === true) {
        selectedTodoIds.value = [];
        showTodoUndo('complete', ids);
      } else if (result !== 'preview') message.error(t('inbox.todoSaveFailed'));
    } finally {
      todoBatchMutating.value = false;
    }
  }
  function confirmDeleteSelectedTodos() {
    const ids = [...selectedTodoIds.value];
    if (!ids.length || todoBatchMutating.value) return;
    Alert.alert({
      title: t('inbox.deleteTodo'),
      content: t('inbox.deleteTodoBatchConfirm', { count: ids.length }),
      okText: t('common.delete'),
      okType: 'danger',
      cancelText: t('common.cancel'),
      onOk: () => deleteSelectedTodos(ids),
    });
  }
  async function deleteSelectedTodos(ids: string[]) {
    todoBatchMutating.value = true;
    try {
      const result = await todo.batchDelete(ids);
      if (result === true) {
        selectedTodoIds.value = [];
        showTodoUndo('delete', ids);
      } else if (result !== 'preview') message.error(t('inbox.todoSaveFailed'));
    } finally {
      todoBatchMutating.value = false;
    }
  }
  function showTodoUndo(kind: 'complete' | 'delete', ids: string[]) {
    window.clearTimeout(todoUndoTimer);
    todoUndo.value = { kind, ids };
    todoUndoTimer = window.setTimeout(clearTodoUndo, 10_000);
  }
  function clearTodoUndo() {
    window.clearTimeout(todoUndoTimer);
    todoUndo.value = null;
  }
  async function undoTodoAction() {
    const action = todoUndo.value;
    if (!action || todoUndoing.value) return;
    todoUndoing.value = true;
    try {
      const succeeded =
        action.kind === 'delete' ? await todo.restoreMany(action.ids) : await todo.reopenMany(action.ids);
      if (succeeded === true) {
        message.success(t('inbox.todoUndoSuccess'));
        clearTodoUndo();
      } else if (succeeded !== 'preview') message.warning(t('inbox.todoUndoFailed'));
    } finally {
      todoUndoing.value = false;
    }
  }
  async function snoozeTodoItem(item: TodoItemType, preset: TodoSnoozePreset) {
    const result = await todo.snooze(item, todoSnoozeAt(preset));
    if (result === true) message.success(t('inbox.todoSnoozed'));
    else if (result !== 'preview') message.error(t('inbox.todoSnoozeFailed'));
  }
  function updateScrollFade() {
    const element = scrollContainer.value;
    if (!element) {
      showTopFade.value = false;
      showBottomFade.value = false;
      return;
    }
    showTopFade.value = element.scrollTop > 3;
    showBottomFade.value = element.scrollTop + element.clientHeight < element.scrollHeight - 3;
  }
  function closeAllSwipe() {
    openSwipeTodoId.value = '';
    openSwipeResourceKey.value = '';
    scheduleViewRef.value?.closeSwipe();
  }
  function handleInboxScroll() {
    closeAllSwipe();
    updateScrollFade();
  }
  function beginTodoSwipe(id: string) {
    openSwipeResourceKey.value = '';
    openSwipeTodoId.value = id;
  }
  function updateTodoSwipe(id: string, open: boolean) {
    if (open) openSwipeTodoId.value = id;
    else if (openSwipeTodoId.value === id) openSwipeTodoId.value = '';
  }
  function beginResourceSwipe(item: InboxItemType) {
    openSwipeTodoId.value = '';
    openSwipeResourceKey.value = inbox.resourceKey(item);
  }
  function updateResourceSwipe(item: InboxItemType, open: boolean) {
    const key = inbox.resourceKey(item);
    if (open) openSwipeResourceKey.value = key;
    else if (openSwipeResourceKey.value === key) openSwipeResourceKey.value = '';
  }
  function toggleSelected(item: InboxItemType, selected: boolean) {
    const key = inbox.resourceKey(item);
    inbox.selectedKeys = selected
      ? Array.from(new Set([...inbox.selectedKeys, key]))
      : inbox.selectedKeys.filter((value) => value !== key);
  }
  function toggleSelectAll(selected: boolean) {
    inbox.selectedKeys = selected ? inbox.items.map((item) => inbox.resourceKey(item)) : [];
  }
  function openResource(item: InboxItemType) {
    recordOperation(OPERATION_LOG_MAP.inbox.openResource);
    if (item.resourceType === 'bookmark') {
      router.push({ path: `/manage/editBookmark/${item.resourceId}`, query: { organize: 'inbox' } });
    } else if (item.resourceType === 'note') {
      router.push({ path: `/noteLibrary/${item.resourceId}`, query: { organize: 'inbox' } });
    } else {
      router.push({
        path: '/cloudSpace',
        query: { fileId: item.resourceId, fileName: item.title, organize: 'inbox' },
      });
    }
  }
  async function completeOne(item: InboxItemType) {
    if (hasPendingOperation.value || blockGuestWrite('inbox-complete', t('inbox.guestPrompt'))) return;
    completingKey.value = inbox.resourceKey(item);
    openSwipeResourceKey.value = '';
    try {
      const completed = await inbox.complete([item]);
      if (completed) {
        recordOperation(OPERATION_LOG_MAP.inbox.completeOne);
        message.success(t('inbox.completedSuccess'));
        await nextTick(updateScrollFade);
      }
    } finally {
      completingKey.value = '';
    }
  }
  async function completeSelected() {
    if (hasPendingOperation.value || blockGuestWrite('inbox-complete', t('inbox.guestPrompt'))) return;
    const selected = [...selectedItems.value];
    if (!selected.length) return;
    batchCompleting.value = true;
    try {
      const completed = await inbox.complete(selected);
      if (completed) {
        recordOperation({ ...OPERATION_LOG_MAP.inbox.completeBatch, operation: `批量整理完成【${completed}项】` });
        message.success(t('inbox.completedCount', { count: completed }));
        if (isMobileResourceInbox.value) leaveResourceSelection();
        await nextTick(updateScrollFade);
      }
    } finally {
      batchCompleting.value = false;
    }
  }
  function confirmDelete(items: InboxItemType[], batchAction = false) {
    if (!items.length || hasPendingOperation.value || blockGuestWrite('inbox-delete', t('inbox.guestPrompt'))) return;
    openSwipeResourceKey.value = '';
    Alert.alert({
      title: t('inbox.deleteConfirmTitle'),
      content:
        items.length === 1
          ? t('inbox.deleteConfirmOne', { name: items[0].title || t('inbox.untitled') })
          : t('inbox.deleteConfirmBatch', { count: items.length }),
      okText: t('inbox.deleteConfirmOk'),
      cancelText: t('common.cancel'),
      onOk: () => deleteResources(items, batchAction),
    });
  }
  async function deleteResources(items: InboxItemType[], isBatch: boolean) {
    if (isBatch) batchDeleting.value = true;
    else deletingKey.value = inbox.resourceKey(items[0]);
    try {
      const res = await batchDeleteSearchResources(
        items.map((item) => ({ id: item.resourceId, type: item.resourceType })),
      );
      if (Number(res?.status) !== 200) {
        message.error(res?.msg || t('inbox.deleteFailed'));
        return;
      }
      const affected = Number(res?.data?.affectedItemCount || 0);
      if (!affected) {
        message.warning(res?.msg || t('inbox.deleteFailed'));
        return;
      }
      recordOperation({
        ...(isBatch ? OPERATION_LOG_MAP.inbox.deleteBatch : OPERATION_LOG_MAP.inbox.deleteOne),
        operation: isBatch
          ? `批量移入回收站【选中${items.length}项，删除${affected}项】`
          : `移入回收站【${items[0].title || '未命名资源'}】`,
      });
      clearGlobalSearchCache();
      message.success(t('inbox.deleteSuccess', { count: affected }));
      await refreshList();
      if (isMobileResourceInbox.value && isBatch) leaveResourceSelection();
    } catch {
      message.error(t('inbox.deleteFailed'));
    } finally {
      batchDeleting.value = false;
      deletingKey.value = '';
    }
  }
  function openTodoEditor(item: TodoItemType | null = null) {
    openSwipeTodoId.value = '';
    scheduleViewRef.value?.closeSwipe();
    if (bookmark.isMobile && !item) {
      void router.push({ name: 'todoCreate' });
      return;
    }
    todoPreviewVisible.value = false;
    editingTodo.value = item;
    todoEditorVisible.value = true;
  }
  function openTodoPreview(item: TodoItemType) {
    openSwipeTodoId.value = '';
    scheduleViewRef.value?.closeSwipe();
    previewTodoId.value = item.id;
    previewTodoSeed.value = item;
    todoPreviewVisible.value = true;
  }
  async function afterTodoSaved() {
    await refreshList();
  }
  async function toggleTodo(item: TodoItemType, completed: boolean) {
    if (hasPendingOperation.value || blockGuestWrite('todo-complete', t('inbox.guestPrompt'))) return;
    updatingTodoId.value = item.id;
    try {
      const result = await todo.setCompleted(item, completed);
      if (result === true) {
        await inbox.refreshCount();
        if (completed) showTodoUndo('complete', [item.id]);
        else message.success(t('inbox.todoReopenedSuccess'));
      } else if (result !== 'preview') message.error(t('inbox.todoSaveFailed'));
    } finally {
      updatingTodoId.value = '';
    }
  }
  async function updateTodoChecklist(item: TodoItemType, checklist: TodoChecklistItem[]) {
    if (hasPendingOperation.value) return;
    updatingTodoId.value = item.id;
    try {
      const result = await todo.updateChecklist(item, checklist);
      if (result === false) message.error(t('inbox.todoSaveFailed'));
    } finally {
      updatingTodoId.value = '';
    }
  }
  function confirmDeleteTodo(item: TodoItemType) {
    if (hasPendingOperation.value) return;
    openSwipeTodoId.value = '';
    if (item.planVersion === 2 && item.seriesId) {
      Alert.alert({
        title: t('inbox.deleteTodo'),
        content: t('inbox.todoSeriesDeleteChoice', { name: item.title }),
        footer: [
          { label: t('common.cancel') },
          { label: t('inbox.todoSeriesDeleteCurrent'), function: () => removeTodoV2(item, 'current') },
          { label: t('inbox.todoSeriesDeleteFuture'), type: 'primary', function: () => removeTodoV2(item, 'future') },
          { label: t('inbox.todoSeriesDeleteSeries'), type: 'danger', function: () => removeTodoV2(item, 'series') },
        ],
      });
      return;
    }
    Alert.alert({
      title: t('inbox.deleteTodo'),
      content: t('inbox.deleteTodoConfirm', { name: item.title }),
      okText: t('common.delete'),
      okType: 'danger',
      cancelText: t('common.cancel'),
      onOk: () => removeTodo(item),
    });
  }
  function openTodoCalendar(item: TodoItemType) {
    // 无截止时间无法生成日历事件：提示并引导进入编辑，而不是导出错误文件
    if (!item.dueAt) {
      Alert.alert({
        title: t('inbox.calendarModalTitle'),
        content: t('inbox.calendarNeedDueAt'),
        okText: t('inbox.editTodo'),
        cancelText: t('common.cancel'),
        onOk: () => openTodoEditor(item),
      });
      return;
    }
    calendarTodo.value = item;
    todoCalendarVisible.value = true;
  }
  /**
   * App 内「加入日历」：直接打开系统日历的新建事件页（原生 ACTION_INSERT）。
   *
   * 成功只代表日历页打开了，事件存不存由用户在那边按保存决定，所以提示说「请确认保存」，
   * 不能报「已加入」—— 那又会变成在说一件还没发生的事。旧版 App 没有这条通道、等不到回复，
   * 会以 unsupported 收口，此时不关弹窗，让用户改用导出文件。
   */
  async function addTodoToSystemCalendar() {
    if (insertingCalendar.value) return;
    const item = calendarTodo.value;
    if (!item?.dueAt) return;
    const event = buildTodoCalendarEvent(
      { id: item.id, title: item.title, description: item.description, dueAt: item.dueAt },
      window.location.origin,
    );
    if (!event) {
      message.error(t('inbox.calendarExportFailed'));
      return;
    }
    insertingCalendar.value = true;
    try {
      const result = await insertAndroidCalendarEvent(event);
      if (!result.ok) {
        /*
         * 两种失败要分开说，出路不一样：
         * failed      —— App 支持这条通道，但设备上没有能接 ACTION_INSERT 的日历应用
         *               （鸿蒙 + 卓易通这类兼容层容器里很常见），只能改用导出文件；
         * unsupported —— 原生压根没回复，是还没升级到带这条通道的 App 版本。
         */
        message.warning(
          t(result.reason === 'failed' ? 'inbox.calendarInsertNoApp' : 'inbox.calendarInsertUnsupported'),
        );
        return;
      }
      todoCalendarVisible.value = false;
      calendarTodo.value = null;
      message.success(t('inbox.calendarInsertOpened'));
      recordOperation(OPERATION_LOG_MAP.inbox.insertCalendar);
    } finally {
      insertingCalendar.value = false;
    }
  }

  async function exportTodoCalendar(alarmMinutesBefore: number | null) {
    if (exportingCalendar.value) return;
    const item = calendarTodo.value;
    if (!item?.dueAt) return;
    const content = buildTodoIcs(
      { id: item.id, title: item.title, description: item.description, dueAt: item.dueAt, updatedAt: item.updatedAt },
      {
        alarmMinutesBefore,
        alarmDescription: t('inbox.calendarAlarmDescription'),
        origin: window.location.origin,
      },
    );
    if (!content) {
      message.error(t('inbox.calendarExportFailed'));
      return;
    }
    const fileName = buildIcsFileName(item.title, t('inbox.calendarFileFallback'));
    exportingCalendar.value = true;
    try {
      /*
       * App 内先走服务端中转：blob 在 App 里落不了盘（见 utils/androidCalendar.ts），
       * 换成 http 地址交给系统 DownloadManager 才是真的存下来，而且 .ics 里的
       * 提前提醒（VALARM）能一并带上 —— 这是它和「加入日历」并存的理由。
       */
      if (hasAndroidBridge()) {
        const outcome = await deliverIcsViaAndroidBridge({ todoId: item.id, content, fileName });
        if (outcome.ok) {
          todoCalendarVisible.value = false;
          calendarTodo.value = null;
          message.success(t('inbox.calendarHandedToDownloads'));
          recordOperation(OPERATION_LOG_MAP.inbox.exportCalendar);
          return;
        }
        // 中转也没成时给明确出路，不能静默返回让人以为按钮坏了
        message.warning(
          outcome.reason === 'too_large' ? t('inbox.calendarExportFailed') : t('inbox.calendarUnavailableInApp'),
        );
        return;
      }

      // 移动端优先系统分享（可直达日历应用），取消分享不打扰也不记成功；桌面端直接下载
      const result = await deliverIcsFile(content, fileName, bookmark.isMobile);
      if (result === 'cancelled') return;
      if (result === 'unavailable') {
        // 原生已经弹过「无法开始下载」了，这里再报「已下载」就是同一秒里两个相反的说法；
        // 弹窗也不关、日志也不记，用户还能改用别的方式
        message.warning(t('inbox.calendarUnavailableInApp'));
        return;
      }
      todoCalendarVisible.value = false;
      calendarTodo.value = null;
      message.success(t(result === 'shared' ? 'inbox.calendarShared' : 'inbox.calendarDownloaded'));
      recordOperation(OPERATION_LOG_MAP.inbox.exportCalendar);
    } catch (error) {
      console.error('[TodoCalendar] export failed', error);
      message.error(t('inbox.calendarExportFailed'));
    } finally {
      exportingCalendar.value = false;
    }
  }
  async function removeTodo(item: TodoItemType) {
    deletingTodoId.value = item.id;
    try {
      const result = await todo.remove(item);
      if (result === true) {
        await inbox.refreshCount();
        showTodoUndo('delete', [item.id]);
      } else if (result !== 'preview') message.error(t('inbox.todoSaveFailed'));
    } finally {
      deletingTodoId.value = '';
    }
  }

  async function removeTodoV2(item: TodoItemType, scope: TodoPlanScope) {
    deletingTodoId.value = item.id;
    try {
      const response = await deleteTodoPlanV2(item.id, scope, generateUUID());
      if (response.status !== 200) {
        message.error(response.msg || t('inbox.todoSaveFailed'));
        return;
      }
      await Promise.all([todo.refreshList(), inbox.refreshCount()]);
      if (scope === 'current') showTodoUndo('delete', [item.id]);
      else message.success(t('inbox.todoSeriesChanged'));
    } catch (error: any) {
      message.error(error?.message || t('inbox.todoSaveFailed'));
    } finally {
      deletingTodoId.value = '';
    }
  }

  async function runTodoSeriesAction(item: TodoItemType, action: TodoSeriesAction) {
    if (!item.seriesId || hasPendingOperation.value) return;
    updatingTodoId.value = item.id;
    try {
      const key = generateUUID();
      const response =
        action === 'skip'
          ? await skipTodoInstanceV2(item.id, key)
          : action === 'pause'
            ? await pauseTodoSeriesV2(item.seriesId, key)
            : await resumeTodoSeriesV2(item.seriesId, key);
      if (response.status !== 200) {
        message.error(response.msg || t('inbox.todoSaveFailed'));
        return;
      }
      message.success(t('inbox.todoSeriesChanged'));
      await Promise.all([todo.refreshList(), inbox.refreshCount()]);
    } catch (error: any) {
      message.error(error?.message || t('inbox.todoSaveFailed'));
    } finally {
      updatingTodoId.value = '';
    }
  }

  function handleTodoSeriesAction(item: TodoItemType, action: TodoSeriesAction) {
    if (action !== 'pause') {
      void runTodoSeriesAction(item, action);
      return;
    }
    Alert.alert({
      title: t('inbox.todoSeriesPause'),
      content: t('inbox.todoSeriesPauseConfirm'),
      okText: t('inbox.todoSeriesPause'),
      cancelText: t('common.cancel'),
      onOk: () => runTodoSeriesAction(item, action),
    });
  }
</script>

<style scoped lang="less">
  .inbox-page {
    height: 100%;
    min-height: 0;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    padding: 18px clamp(16px, 1.6vw, 40px) 24px;
    box-sizing: border-box;
    color: var(--text-color);
  }
  .inbox-page--todo-focused {
    --primary-color: var(--todo-accent-color, #0ea5e9);
    --todo-navigation-color: #655cff;
    --todo-navigation-soft-color: #efedff;
  }
  .section-switcher {
    min-height: 34px;
    margin-bottom: 8px;
    display: flex;
    align-items: center;
    flex-shrink: 0;
    align-self: flex-start;
  }
  .section-switcher--hero {
    margin: 0;
    align-self: center;
  }
  .inbox-hero {
    display: flex;
    justify-content: space-between;
    align-items: center;
    min-height: 44px;
    gap: 12px;
    margin: 0 0 8px;
    flex-shrink: 0;
  }
  /* 待整理与全部资源 / 知识地图是资源中心的同级视图。
     桌面资源态沿用 ResourcePageShell 的标题基线与正文间距，避免路由切换时整页上移。 */
  .inbox-page--resource-workspace > .inbox-hero {
    min-height: 54px;
    margin-bottom: 14px;
  }
  .inbox-page--resource-workspace .inbox-hero p {
    margin-top: 5px;
  }
  .inbox-hero__heading {
    min-width: 0;
    flex: 1;
  }
  .inbox-hero__title-row {
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 9px;
  }
  .inbox-hero__accent {
    width: 8px;
    height: 8px;
    flex: 0 0 auto;
    border-radius: 999px;
    background: var(--desc-color);
    box-shadow: 0 0 0 5px color-mix(in srgb, var(--desc-color) 10%, transparent);
  }
  .inbox-page--todo-focused .inbox-hero__accent {
    background: var(--todo-accent-color, #0ea5e9);
    box-shadow: 0 0 0 5px color-mix(in srgb, var(--todo-accent-color, #0ea5e9) 10%, transparent);
  }
  .todo-workspace-toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 10px;
  }
  .todo-workspace-toolbar__views {
    flex-shrink: 0;
  }
  .todo-workspace-toolbar__select {
    flex-shrink: 0;
    margin-left: auto;
  }
  .todo-list-toolbar {
    min-height: 46px;
    margin-bottom: 10px;
    padding: 6px 10px;
    box-sizing: border-box;
    border: 1px solid color-mix(in srgb, var(--card-border-color) 82%, transparent);
    border-radius: 12px;
    background: color-mix(in srgb, var(--primary-color) 2.5%, var(--background-color));
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    flex-shrink: 0;
  }
  .todo-list-toolbar__actions {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 8px;
  }
  .todo-list-toolbar :deep(.b_btn) {
    min-height: 34px;
  }
  .todo-undo-banner {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 10px;
    padding: 8px 10px;
    border: 1px solid color-mix(in srgb, var(--success-color, #2e8b57) 35%, var(--card-border-color));
    border-radius: 10px;
    background: color-mix(in srgb, var(--success-color, #2e8b57) 7%, var(--background-color));
    color: var(--text-color);
  }
  .todo-undo-banner > span {
    flex: 1;
  }
  .todo-group-list {
    display: grid;
    gap: 14px;
    padding: 6px 2px 24px;
  }
  .todo-group {
    display: grid;
    gap: 0;
    padding: 0;
    overflow: hidden;
    border: 1px solid var(--surface-border-color);
    border-radius: 17px;
    background: var(--card-background);
  }
  .todo-group > header {
    display: flex;
    min-height: 48px;
    box-sizing: border-box;
    align-items: center;
    gap: 7px;
    padding: 0 15px;
    border-bottom: 1px solid var(--surface-divider-color);
    color: var(--text-color);
  }
  .todo-group > header > span {
    min-width: 21px;
    padding: 2px 6px;
    border-radius: 999px;
    background: color-mix(in srgb, var(--primary-color) 10%, transparent);
    color: var(--primary-color);
    font-size: 10px;
    text-align: center;
  }
  .todo-group__items {
    display: grid;
    min-height: 18px;
    gap: 0;
  }
  .todo-group__items :deep(.todo-item) {
    border: 0;
    border-bottom: 1px solid var(--surface-divider-color);
    border-radius: 0;
    box-shadow: none;
  }
  .todo-group__items :deep(.todo-item:last-child) {
    border-bottom: 0;
  }
  .todo-group__items :deep(.todo-series-group) {
    border: 0;
    border-radius: 0;
  }
  .inbox-hero h1 {
    min-width: 0;
    margin: 0;
    overflow: hidden;
    color: var(--text-color);
    font-size: clamp(22px, 2vw, 28px);
    font-weight: 750;
    line-height: 1.2;
    letter-spacing: -0.025em;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .inbox-hero p {
    margin: 3px 0 0 17px;
    overflow: hidden;
    color: var(--desc-color);
    font-size: 13px;
    line-height: 1.4;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .todo-summary-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 10px;
    margin-bottom: 9px;
    flex-shrink: 0;
  }
  .todo-summary-card {
    display: flex;
    min-height: 62px;
    box-sizing: border-box;
    align-items: center;
    gap: 10px;
    padding: 8px 12px;
    border: 1px solid var(--surface-border-color);
    border-radius: 15px;
    background: var(--card-background);
  }
  .todo-summary-card__icon {
    box-sizing: border-box;
    display: grid;
    width: 36px;
    height: 36px;
    flex: 0 0 auto;
    place-items: center;
    border: 1px solid var(--todo-summary-icon-border);
    border-radius: 11px;
    background: var(--todo-summary-icon-bg);
    color: var(--todo-summary-icon-fg);
  }
  .todo-summary-card > div {
    display: grid;
    gap: 2px;
  }
  .todo-summary-card span {
    color: var(--desc-color);
    font-size: 12px;
  }
  .todo-summary-card strong {
    color: var(--text-color);
    font-size: 19px;
    line-height: 1.1;
  }
  .todo-summary-card.is-overdue strong {
    color: var(--danger-color, #d83c45);
  }
  .inbox-toolbar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 10px;
    margin-bottom: 9px;
    padding: 6px 8px;
    box-sizing: border-box;
    border: 0;
    border-radius: 14px;
    background: var(--workspace-panel-bg-color, var(--background-color));
    box-shadow: none;
    flex-shrink: 0;
  }
  .inbox-toolbar :deep(.tab-container) {
    min-width: 0;
    flex: 1;
  }
  .inbox-toolbar--todo-desktop {
    min-height: 42px;
    padding: 3px 0;
    border-radius: 0;
    background: transparent;
  }
  .inbox-toolbar__right {
    display: grid;
    grid-template-columns: minmax(180px, 280px) 130px;
    gap: 8px;
    flex-shrink: 0;
  }
  .inbox-toolbar__right--todo {
    grid-template-columns: minmax(160px, 230px) 120px auto;
  }
  .inbox-toolbar__right--resources {
    width: 100%;
    grid-template-columns: minmax(0, 1fr) auto;
    flex: 1 1 auto;
  }
  .inbox-resource-capture {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
  }
  .inbox-toolbar__todo-tabs {
    display: flex;
    min-width: 0;
    align-items: center;
    gap: clamp(22px, 2vw, 32px);
  }
  .inbox-toolbar .inbox-toolbar__todo-status {
    /* 工具栏通用规则会让 BTabs 根节点 flex: 1；状态栏若随父级收缩，
       标签文字仍按固有宽度溢出，底板却会提前收口。这里让胶囊按完整内容占位。 */
    width: max-content;
    min-width: max-content;
    flex: 0 0 auto;
    gap: 2px;
    margin: 0;
    padding: 3px;
    border: 0;
    border-radius: 11px;
    background: var(--workspace-panel-bg-color, var(--background-color));
  }
  .inbox-toolbar__todo-status :deep(.tab) {
    min-height: 32px;
    padding: 0 12px;
    border: 1px solid transparent;
    border-radius: 8px;
    line-height: 32px;
  }
  .inbox-toolbar__todo-status :deep(.tab.is-active) {
    border-color: var(--todo-accent-color);
    color: var(--todo-accent-color);
    background: var(--card-background);
    box-shadow: none;
    font-weight: 700;
  }
  .inbox-toolbar__todo-views {
    min-width: 0;
    flex: 0 1 auto;
    gap: 16px;
    margin: 0;
    padding: 0 0 4px;
    border-bottom: 0;
  }
  .inbox-toolbar__todo-views :deep(.tab) {
    min-height: 34px;
    box-sizing: border-box;
    padding: 5px 1px 7px;
  }
  .inbox-toolbar__todo-views :deep(.tab.is-active) {
    color: var(--todo-accent-color);
    font-weight: 650;
  }
  .inbox-toolbar__todo-views :deep(.underline) {
    bottom: 0;
    background: var(--todo-accent-color);
  }
  .inbox-batch {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 12px;
    padding: 10px 14px;
    min-height: 44px;
    box-sizing: border-box;
    border: 1px solid color-mix(in srgb, var(--primary-color) 16%, transparent);
    border-radius: 12px;
    background: color-mix(in srgb, var(--primary-color) 7%, var(--background-color));
    flex-shrink: 0;
  }
  .inbox-batch__actions {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .inbox-batch__actions > span {
    color: var(--desc-color);
    font-size: 13px;
  }
  .inbox-error-banner {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
    margin-bottom: 12px;
    padding: 10px 14px;
    border-radius: 8px;
    color: var(--text-color);
    background: color-mix(in srgb, var(--danger-color, #e5484d) 10%, transparent);
    flex-shrink: 0;
  }
  .inbox-content {
    position: relative;
    min-height: 0;
    flex: 1;
    overflow: hidden;
    border: 0;
    border-radius: 0;
    background: transparent;
    box-shadow: none;
  }
  .inbox-content::before,
  .inbox-content::after {
    position: absolute;
    left: 0;
    right: 0;
    z-index: 2;
    height: 44px;
    content: '';
    opacity: 0;
    pointer-events: none;
    transition: opacity 0.18s ease;
  }
  .inbox-content::before {
    top: 0;
    background: linear-gradient(to bottom, var(--background-color), transparent);
  }
  .inbox-content::after {
    bottom: 0;
    background: linear-gradient(to top, var(--background-color), transparent);
  }
  .inbox-content.has-top-fade::before,
  .inbox-content.has-bottom-fade::after {
    opacity: 0.96;
  }
  .inbox-scroll {
    position: relative;
    height: 100%;
    min-height: 0;
    overflow-y: auto;
    overscroll-behavior-y: contain;
    scrollbar-gutter: stable;
    -webkit-overflow-scrolling: touch;
  }
  .inbox-loading {
    min-height: 100%;
  }
  .inbox-list {
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 10px 12px 22px;
  }
  .resource-inbox-entry {
    min-width: 0;
    border-radius: 16px;
    outline: none;
  }
  .resource-inbox-entry.is-inspected :deep(.inbox-item),
  .resource-inbox-entry:focus-visible :deep(.inbox-item) {
    border-color: var(--primary-color);
  }

  .resource-inbox-scope,
  .resource-inbox-inspector {
    min-width: 0;
    min-height: 0;
    box-sizing: border-box;
    overflow: hidden auto;
    border: 1px solid var(--surface-border-color);
    border-radius: 16px;
    background: var(--card-background);
  }

  .resource-inbox-scope {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 12px 10px;
  }

  .resource-inbox-scope__title {
    padding: 3px 10px 6px;
    color: var(--desc-color);
    font-size: 12px;
    font-weight: 700;
  }

  .resource-inbox-scope__item {
    width: 100%;
    min-height: 40px;
    display: grid;
    grid-template-columns: 8px minmax(0, 1fr) auto;
    align-items: center;
    gap: 9px;
    padding: 0 10px;
    border: 1px solid transparent;
    border-radius: 11px;
    background: transparent;
    color: var(--text-color);
    text-align: left;
  }

  .resource-inbox-scope__item:hover,
  .resource-inbox-scope__item.active {
    border-color: color-mix(in srgb, var(--primary-color) 30%, var(--surface-border-color));
    background: color-mix(in srgb, var(--primary-color) 8%, var(--card-background));
    color: var(--primary-color);
  }

  .resource-inbox-scope__item--sort {
    grid-template-columns: 8px minmax(0, 1fr);
  }

  .resource-inbox-scope__dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--desc-color);
  }

  .resource-inbox-scope__dot.is-bookmark {
    background: var(--resource-bookmark-color, #615ced);
  }

  .resource-inbox-scope__dot.is-note {
    background: var(--resource-note-color, #00a884);
  }

  .resource-inbox-scope__dot.is-file {
    background: var(--resource-file-color, #f59e0b);
  }

  .resource-inbox-scope__label {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .resource-inbox-scope__count {
    color: var(--desc-color);
    font-size: 12px;
  }

  .resource-inbox-scope__divider {
    height: 1px;
    margin: 8px 6px;
    background: var(--surface-border-color);
  }

  .resource-inbox-inspector {
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 18px;
  }

  .resource-inbox-inspector__eyebrow,
  .resource-inbox-inspector__type {
    color: var(--primary-color);
    font-size: 12px;
    font-weight: 700;
  }

  .resource-inbox-inspector h2 {
    margin: 0;
    font-size: 18px;
    line-height: 1.45;
  }

  .resource-inbox-inspector > p,
  .resource-inbox-inspector__empty p {
    margin: 0;
    color: var(--desc-color);
    font-size: 13px;
    line-height: 1.65;
  }

  .resource-inbox-inspector__meta {
    display: grid;
    gap: 10px;
    margin: 4px 0 0;
    padding: 12px;
    border: 1px solid var(--surface-border-color);
    border-radius: 12px;
    background: var(--workspace-panel-bg-color, var(--background-color));
  }

  .resource-inbox-inspector__meta > div {
    display: grid;
    grid-template-columns: 72px minmax(0, 1fr);
    gap: 8px;
  }

  .resource-inbox-inspector__meta dt,
  .resource-inbox-inspector__meta dd {
    margin: 0;
    font-size: 12px;
  }

  .resource-inbox-inspector__meta dt {
    color: var(--desc-color);
  }

  .resource-inbox-inspector__meta dd {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .resource-inbox-inspector__actions {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
    margin-top: auto;
    padding-top: 14px;
    border-top: 1px solid var(--surface-border-color);
  }

  .resource-inbox-inspector__actions :deep(.b_btn) {
    width: 100%;
    min-width: 0;
    padding-inline: 12px;
    font-size: 14px;
  }

  .resource-inbox-inspector__actions :deep(.b_btn:first-child) {
    grid-column: 1 / -1;
  }

  .resource-inbox-inspector__action--complete {
    border-color: color-mix(in srgb, var(--primary-color) 28%, var(--surface-border-color));
    color: var(--primary-color);
    background: color-mix(in srgb, var(--primary-color) 8%, var(--card-background));
  }

  .resource-inbox-inspector__action--delete {
    border-color: color-mix(in srgb, var(--danger-color, #e5484d) 32%, var(--surface-border-color));
    color: var(--danger-color, #e5484d);
    background: color-mix(in srgb, var(--danger-color, #e5484d) 6%, var(--card-background));
  }

  .resource-inbox-inspector__empty {
    min-height: 220px;
    display: grid;
    align-content: center;
    gap: 8px;
    text-align: center;
  }

  @media (min-width: 981px) {
    .inbox-page--resource-workspace {
      display: grid;
      grid-template-columns: 210px minmax(0, 1fr) 320px;
      grid-template-rows: auto auto auto auto minmax(0, 1fr);
      column-gap: 14px;
    }

    .inbox-page--resource-workspace > .inbox-hero {
      grid-column: 1 / -1;
      grid-row: 1;
    }

    .inbox-page--resource-workspace > .resource-inbox-scope {
      grid-column: 1;
      grid-row: 2 / 6;
    }

    .inbox-page--resource-workspace > .inbox-toolbar,
    .inbox-page--resource-workspace > .inbox-batch,
    .inbox-page--resource-workspace > .inbox-error-banner,
    .inbox-page--resource-workspace > .inbox-content {
      grid-column: 2;
    }

    .inbox-page--resource-workspace > .inbox-toolbar {
      grid-row: 2;
    }

    .inbox-page--resource-workspace > .inbox-batch {
      grid-row: 3;
    }

    .inbox-page--resource-workspace > .inbox-error-banner {
      grid-row: 4;
    }

    .inbox-page--resource-workspace > .inbox-content {
      grid-row: 5;
    }

    .inbox-page--resource-workspace > .resource-inbox-inspector {
      grid-column: 3;
      grid-row: 2 / 6;
    }
  }

  @media (min-width: 981px) and (max-width: 1380px) {
    .inbox-page--resource-workspace {
      grid-template-columns: 210px minmax(0, 1fr);
    }

    .resource-inbox-inspector {
      display: none;
    }
  }

  @media (min-width: 768px) and (max-width: 980px) {
    .inbox-page--resource-workspace {
      display: grid;
      grid-template-columns: minmax(0, 1fr);
      grid-template-rows: auto auto auto auto minmax(0, 1fr);
    }

    .resource-inbox-scope,
    .resource-inbox-inspector {
      display: none;
    }

    .inbox-page--resource-workspace > .inbox-hero,
    .inbox-page--resource-workspace > .inbox-toolbar,
    .inbox-page--resource-workspace > .inbox-batch,
    .inbox-page--resource-workspace > .inbox-error-banner,
    .inbox-page--resource-workspace > .inbox-content {
      grid-column: 1;
    }

    .inbox-page--resource-workspace > .inbox-hero {
      grid-row: 1;
    }

    .inbox-page--resource-workspace > .inbox-toolbar {
      grid-row: 2;
    }

    .inbox-page--resource-workspace > .inbox-batch {
      grid-row: 3;
    }

    .inbox-page--resource-workspace > .inbox-error-banner {
      grid-row: 4;
    }

    .inbox-page--resource-workspace > .inbox-content {
      grid-row: 5;
    }
  }

  /* 桌面列表也沿用移动端已验证过的独立卡片层级，避免完成态在整块面板中连成一片。
     只放在桌面断点，移动浏览器与 App 保持现有布局和触控密度。 */
  @media (min-width: 768px) {
    .inbox-page--todo-focused .todo-group {
      gap: 9px;
      overflow: visible;
      border: 0;
      border-radius: 0;
      background: transparent;
    }
    .inbox-page--todo-focused .todo-group > header {
      min-height: 40px;
      padding: 0 2px;
      border-bottom: 0;
    }
    .inbox-page--todo-focused .todo-group__items {
      gap: 10px;
    }
    .inbox-page--todo-focused .todo-group__items :deep(.todo-item) {
      border: 1px solid var(--surface-border-color);
      border-left: 4px solid var(--todo-accent-color, var(--primary-color));
      border-radius: 17px;
      background: var(--card-background);
      box-shadow: none;
    }
    .inbox-page--todo-focused .todo-group__items :deep(.todo-item::before) {
      display: none;
    }
    .inbox-page--todo-focused .todo-group__items :deep(.todo-item.is-overdue) {
      border-color: var(--surface-border-color);
      border-left-color: var(--danger-color, #d83c45);
    }
    .inbox-page--todo-focused .todo-group__items :deep(.todo-item.is-completed) {
      border-color: var(--surface-border-color);
      border-left-color: var(--success-color, #00a884);
      background: var(--card-background);
    }
    .inbox-page--todo-focused .todo-group__items :deep(.todo-series-group) {
      overflow: hidden;
      border: 1px solid var(--surface-border-color);
      border-radius: 17px;
      background: var(--card-background);
    }
    .inbox-page--todo-focused .todo-group__items :deep(.todo-series-group .todo-item) {
      border: 0;
      border-bottom: 1px solid var(--surface-divider-color);
      border-left: 4px solid var(--todo-accent-color, var(--primary-color));
      border-radius: 0;
    }
    .inbox-page--todo-focused .todo-group__items :deep(.todo-series-group .todo-item:last-child) {
      border-bottom: 0;
    }
    .inbox-page--todo-focused .todo-group__items :deep(.todo-series-group .todo-item.is-overdue) {
      border-left-color: var(--danger-color, #d83c45);
    }
    .inbox-page--todo-focused .todo-group__items :deep(.todo-series-group .todo-item.is-completed) {
      border-left-color: var(--success-color, #00a884);
    }
  }
  .inbox-empty {
    min-height: 100%;
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    text-align: center;
  }
  .inbox-empty__icon {
    width: 54px;
    height: 54px;
    border-radius: 50%;
    display: grid;
    place-items: center;
    color: #fff;
    background: #615ced;
    font-size: 24px;
  }
  .inbox-error .inbox-empty__icon {
    background: var(--danger-color, #e5484d);
  }
  .inbox-empty--filtered .inbox-empty__icon {
    border: 1px solid color-mix(in srgb, var(--primary-color) 24%, transparent);
    background: color-mix(in srgb, var(--primary-color) 10%, var(--background-color));
    color: var(--primary-color);
  }
  .inbox-empty h2 {
    margin: 14px 0 6px;
  }
  .inbox-empty p {
    color: var(--desc-color);
    margin: 0 0 16px;
  }
  @media (max-width: 900px) {
    .inbox-page {
      padding: 12px;
    }
    .inbox-toolbar {
      align-items: stretch;
      flex-direction: column;
    }
    .inbox-toolbar__right {
      width: 100%;
      grid-template-columns: minmax(0, 1fr) 130px auto;
    }
  }
  @media (max-width: 767px) {
    .mobile-todo-heading {
      display: grid;
      gap: 4px;
      margin: 2px 2px 15px;
      flex-shrink: 0;
    }
    .mobile-todo-heading h1 {
      margin: 0;
      color: var(--text-color);
      font-size: 27px;
      font-weight: 780;
      line-height: 1.2;
      letter-spacing: -0.025em;
    }
    .mobile-todo-heading p {
      margin: 0;
      color: var(--desc-color);
      font-size: 12px;
      line-height: 1.5;
    }
    /* 视图切换与「批量选择」保持同一行,不再各占一行 */
    .todo-workspace-toolbar {
      align-items: center;
      gap: 8px;
    }
    .todo-workspace-toolbar__views {
      min-width: 0;
      flex: 1 1 auto;
    }
    .todo-workspace-toolbar__select {
      min-height: 36px;
    }
    .todo-list-toolbar {
      align-items: stretch;
      flex-wrap: wrap;
    }
    .todo-list-toolbar__actions {
      width: 100%;
      justify-content: flex-start;
      flex-wrap: wrap;
    }
    .todo-undo-banner {
      flex-wrap: wrap;
    }
    .inbox-page--mobile-todo {
      padding: 14px 14px 0;
    }

    /* 顶栏在 SearchCenter 里位于页面容器之外、天然贴边；这里它在 .inbox-page 之内，
       必须去掉上内边距并用负 margin 抵消左右，否则两个分区的顶栏会错位。 */
    .inbox-page--mobile-resources {
      padding: 0 12px;
    }

    .inbox-page--mobile-resources > .resource-center-topbar {
      margin: 0 -12px;
    }

    .inbox-page--mobile-resources .section-switcher {
      width: 100%;
      margin-top: 6px;
      margin-bottom: 8px;
    }

    .inbox-hero {
      align-items: center;
    }
    .inbox-hero h1 {
      font-size: 22px;
    }
    .inbox-toolbar {
      gap: 8px;
      padding: 8px;
      overflow: visible;
    }
    .inbox-toolbar--todo-primary {
      min-height: 40px;
      margin-bottom: 12px;
      padding: 0;
      align-items: center;
      flex-direction: row;
      gap: 6px;
      border: 0;
      border-radius: 0;
      background: transparent;
      box-shadow: none;
    }
    .inbox-toolbar--todo-primary :deep(.tab-container) {
      min-height: 40px;
      box-sizing: border-box;
      min-width: 0;
      flex: 1 1 auto;
      overflow-x: auto;
      gap: 2px;
      padding: 3px;
      border: 0;
      border-radius: 11px;
      background: var(--workspace-panel-bg-color);
    }
    .inbox-toolbar--todo-primary :deep(.tab) {
      min-height: 34px;
      flex: 1 1 0;
      justify-content: center;
      padding: 0 8px;
      border: 0;
      border-radius: 8px;
      font-size: 13px;
    }
    .inbox-toolbar--todo-primary :deep(.tab.is-active) {
      border: 0;
      color: var(--todo-navigation-color);
      background: var(--card-background);
      box-shadow: 0 4px 12px rgba(42, 45, 80, 0.08);
      font-weight: 700;
    }
    .inbox-toolbar--todo-primary :deep(.tab.is-active .tab-badge) {
      color: #fff;
      background: var(--todo-navigation-color);
    }
    .mobile-todo-sort {
      width: 112px;
      min-width: 112px;
      flex: 0 0 112px;
    }
    .mobile-todo-sort :deep(.select-trigger) {
      height: 44px;
      min-height: 44px;
      border: 0;
      border-radius: 10px;
      background: var(--workspace-panel-bg-color);
    }
    .inbox-toolbar :deep(.tab-container) {
      width: 100%;
      overflow-x: auto;
      padding-bottom: 2px;
      scrollbar-width: none;
    }
    .inbox-toolbar :deep(.tab-container::-webkit-scrollbar) {
      display: none;
    }
    .inbox-toolbar__right {
      grid-template-columns: 1fr 110px;
      margin-top: 0;
    }
    .inbox-batch {
      align-items: flex-start;
      gap: 8px;
    }
    /* 「全选当前 N 项」被右侧按钮挤压后会断成两行，这里不允许它压缩换行 */
    .inbox-batch > :deep(.b-checkbox) {
      flex: 0 0 auto;
      white-space: nowrap;
    }
    .inbox-batch__actions {
      min-width: 0;
      flex-wrap: wrap;
      justify-content: flex-end;
    }
    .inbox-batch__actions > span {
      width: 100%;
      text-align: right;
    }
    .inbox-list {
      padding: 8px 8px 18px;
    }
    .inbox-page--mobile-todo .inbox-content {
      border: 0;
      border-radius: 0;
      background: transparent;
      box-shadow: none;
    }
    .inbox-page--mobile-todo .inbox-list {
      gap: 8px;
      padding: 0 0 18px;
    }
    /* 分组列表(列表视图)此前保留了桌面的水平内边距,导致卡片比上方工具条多缩进一截 */
    .inbox-page--mobile-todo .todo-group-list {
      gap: 14px;
      padding: 0 0 18px;
    }
    .inbox-page--mobile-todo.is-selection-mode .todo-group-list {
      padding-bottom: 110px;
    }
    .inbox-page--mobile-todo .todo-group {
      gap: 9px;
      padding: 0;
      border: 0;
      border-radius: 0;
      background: transparent;
    }
    .inbox-page--mobile-todo .todo-group__items {
      gap: 10px;
    }
    .inbox-page--mobile-todo .todo-group__items :deep(.todo-item) {
      border: 1px solid var(--surface-border-color);
      border-left: 4px solid var(--todo-accent-color, var(--primary-color));
      border-radius: 17px;
    }
    .inbox-page--mobile-todo .todo-group__items :deep(.todo-item.is-overdue) {
      border-left-color: var(--danger-color, #d83c45);
    }
    .inbox-page--mobile-todo .todo-group__items :deep(.todo-item.is-completed) {
      border-left-color: var(--success-color, #00a884);
    }
    .inbox-page--mobile-todo .todo-group__items :deep(.todo-series-group) {
      border: 1px solid var(--surface-border-color);
      border-radius: 17px;
    }
    .inbox-page--mobile-todo .todo-group__items :deep(.todo-series-group .todo-item) {
      border: 0;
      border-bottom: 1px solid var(--surface-divider-color);
      border-left: 4px solid var(--todo-accent-color, var(--primary-color));
      border-radius: 0;
    }
    .inbox-page--mobile-todo .todo-group__items :deep(.todo-series-group .todo-item.is-overdue) {
      border-left-color: var(--danger-color, #d83c45);
    }
    .inbox-page--mobile-todo .todo-group__items :deep(.todo-series-group .todo-item.is-completed) {
      border-left-color: var(--success-color, #00a884);
    }
    .inbox-page--mobile-todo .todo-group > header {
      padding: 0 2px;
      justify-content: space-between;
      font-size: 16px;
    }
    .inbox-page--mobile-todo .todo-group > header > span {
      min-width: 0;
      padding: 0;
      border-radius: 0;
      color: var(--desc-color);
      background: transparent;
      font-size: 12px;
    }

    .inbox-page--mobile-todo .todo-workspace-toolbar {
      margin-bottom: 12px;
    }
    .inbox-page--mobile-todo .todo-workspace-toolbar__views {
      max-width: 220px;
    }
    /* BTabs 的 class 直接落在组件根节点 .tab-container 上，不能用后代选择器。 */
    .inbox-page--mobile-todo :deep(.todo-workspace-toolbar__views.tab-container) {
      min-height: 40px;
      box-sizing: border-box;
      gap: 2px;
      padding: 3px;
      border: 0;
      border-radius: 11px;
      background: var(--workspace-panel-bg-color);
    }
    .inbox-page--mobile-todo .todo-workspace-toolbar__views :deep(.tab) {
      min-height: 34px;
      flex: 1 1 0;
      justify-content: center;
      padding: 0 8px;
      border: 0;
      border-radius: 8px;
      font-size: 13px;
    }
    .inbox-page--mobile-todo .todo-workspace-toolbar__views :deep(.tab.is-active) {
      border: 0;
      color: var(--todo-navigation-color);
      background: var(--card-background);
      box-shadow: 0 4px 12px rgba(42, 45, 80, 0.08);
      font-weight: 700;
    }
    .inbox-page--mobile-todo .todo-workspace-toolbar__select {
      min-height: 44px;
      padding: 0 6px;
      color: var(--todo-navigation-color);
      background: transparent !important;
      font-weight: 700;
    }
    .inbox-page--mobile-todo .todo-list-toolbar {
      min-height: 44px;
      padding: 0 2px;
      border: 0;
      border-radius: 0;
      background: transparent;
    }
    .todo-list-toolbar__cancel {
      min-height: 44px;
      color: var(--primary-color);
      background: transparent !important;
    }
  }
</style>
