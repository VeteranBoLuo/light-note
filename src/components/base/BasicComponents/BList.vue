<template>
  <div class="list-container">
    <slot name="input">
      <b-input v-model:value="searchValue" :placeholder="placeholder" v-if="searchFilter" />
    </slot>
    <div
      class="category-body"
      :style="{
        marginTop: hasInputSlot ? '10px' : '',
        height: hasInputSlot ? 'calc(100% - 40px)' : 'calc(100% - 10px)',
      }"
    >
      <VueDraggable
        :disabled="!draggable"
        :animation="200"
        ref="el"
        v-model="dragList"
        @end="onEnd"
        :handle="handle"
        :scroll-sensitivity="scrollSensitivity"
        :forceFallback="forceFallback"
        :delay="delay"
        v-bind="options"
      >
        <div :key="item[nodeType.id]" v-for="item in listOptions" @click="nodeClick(item)">
          <slot name="item" :item="item">
            <div
              class="category-item"
              :title="item[nodeType.title]"
              :style="{
                backgroundColor:
                  String(nodeCheckId) === String(item[nodeType.id]) ? 'var(--category-item-ba-color)' : '',
              }"
            >
              <slot name="icon" :item="item"> </slot>
              <span class="text-hidden" :style="{ width: hasIconSlot ? 'calc(100% - 28px)' : '100%' }">
                <slot name="title" :item="item">
                  {{ item[nodeType.title] }}
                </slot>
              </span>
            </div>
          </slot>
        </div>
        <div v-if="listOptions && listOptions.length === 0" class="empty-state">
          <slot name="empty"> </slot>
        </div>
      </VueDraggable>
    </div>
  </div>
</template>

<script lang="ts" setup>
  import BInput from '@/components/base/BasicComponents/BInput.vue';
  import { VueDraggable } from 'vue-draggable-plus';
  import { computed, ref, watch, useSlots } from 'vue';
  import { bookmarkStore } from '@/store';

  /**
   写dragList和listOptions两个列表，是因为如果VueDraggable绑定的可拖拽列表是通过computed生成的，拖拽传递的参数就不会发生变化，
   即dragList必须绑定用于computed计算的原始list，listOptions用于绑定页面实际可以看到的list（computed生成的）
   * */
  const dragList = defineModel<any[]>('dragList');
  if (!dragList.value || !Array.isArray(dragList.value)) {
    dragList.value = [];
  }

  const props = withDefaults(
    defineProps<{
      nodeType?: {
        id: string | number;
        title: string;
      };
      checkId?: string | number;
      placeholder?: string;
      searchFilter?: boolean; // 启动自带input过滤功能
      draggable?: boolean;
      handle?: string;
      scrollSensitivity?: number;
      forceFallback?: boolean;
      delay?: number;
      options?: Record<string, any>;
    }>(),
    {
      nodeType: () => ({
        id: 'id',
        title: 'title',
      }),
      placeholder: '请输入',
      checkId: '',
      searchFilter: false,
      draggable: false,
      forceFallback: false,
      delay: 100,
      options: () => ({}),
    },
  );
  const bookmark = bookmarkStore();

  async function onEnd(e: any) {
    emit('onEnd', e);
  }
  const searchValue = ref('');
  const listOptions = defineModel('listOptions');
  const emit = defineEmits(['node-click', 'onEnd']);
  const nodeCheckId = ref(props.checkId);
  function nodeClick(item) {
    nodeCheckId.value = item[props.nodeType.id];
    emit('node-click', item);
  }

  // 获取插槽内容
  const slots = useSlots();
  // 计算属性来判断是否有内容传递给 input 插槽
  const hasInputSlot = computed(() => {
    return !!slots.input;
  });

  const hasIconSlot = computed(() => {
    return !!slots.icon;
  });

  watch(
    () => props.checkId,
    (val) => {
      nodeCheckId.value = val;
    },
  );
</script>

<style lang="less" scoped>
  .list-container {
    height: 100%;
    width: 100%;
  }
  .category-body {
    width: 100%;
    overflow-y: auto;
    --scrollbar-width: 0;
    &::-webkit-scrollbar {
      width: var(--scrollbar-width);
    }
    &:hover {
      --scrollbar-width: 3px;
    }
  }
  .category-item {
    margin: 5px 0;
    padding: 5px 10px;
    border-radius: 8px;
    cursor: pointer;
    display: flex;
    align-items: center;
    width: 100%;
    box-sizing: border-box;
    gap: 10px;
    font-size: 14px;
    &:hover {
      background-color: var(--category-item-ba-color);
    }
  }

  .empty-state {
    display: flex;
    justify-content: center;
    align-items: center;
    height: 100%;
    color: #999;
    font-size: 14px;
  }

  .empty-content {
    text-align: center;
  }
</style>
