<template>
  <b-loading :loading="loading">
    <CommonContainer :title="title">
      <div class="edit-list-container">
        <b-input v-model:value="searchValue" class="table-search-input" :placeholder="placeholder">
          <template #prefix>
            <svg-icon color="#cccccc" :src="icon.navigation.search" size="16" />
          </template>
        </b-input>
        <div class="list-body">
          <div v-for="item in dataList" class="list-item flex-align-center">
            <slot name="item" :data="item" />
          </div>
        </div>
        <b-button
          class="container-footer-btn"
          style="width: 80%; margin-top: 15px; border-radius: 80px"
          type="primary"
          @click="$emit('add')"
          v-click-log="OPERATION_LOG_MAP.bookmarkMg.toAddBtn"
          >新增</b-button
        >
      </div>
    </CommonContainer>
  </b-loading>
</template>

<script lang="ts" setup>
  import { bookmarkStore } from '@/store';
  import { computed, ref } from 'vue';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import BLoading from '@/components/base/BasicComponents/BLoading.vue';
  import BInput from '@/components/base/BasicComponents/BInput.vue';
  import CommonContainer from '@/components/base/BasicComponents/CommonContainer.vue';
  import icon from '@/config/icon.ts';
  import {OPERATION_LOG_MAP} from "@/config/logMap.ts";

  const props = defineProps({
    title: {
      type: String,
      default: '',
    },
    loading: {
      type: Boolean,
      default: false,
    },
    placeholder: {
      type: String,
      default: '请输入搜索内容',
    },
    listData: {
      type: Array,
      default: () => [],
    },
  });
  const visible = defineModel<boolean>('visible');

  const bookmark = bookmarkStore();

  const searchValue = ref('');
  const dataList = computed(() => {
    if (searchValue.value) {
      return props.listData.filter((data: any) => {
        return data.name.toLowerCase().includes(searchValue.value.toLowerCase());
      });
    } else {
      return props.listData
    }
  });
</script>

<style lang="less" scoped>
  .edit-list-container {
    height: 100%;
    box-sizing: border-box;
  }

  .table-search-input {
    width: 100%;
  }
  .list-body {
    margin-top: 10px;
    height: calc(100% - 92px);
    overflow: auto;
    border-radius: 8px;
  }
  .list-item {
    position: relative;
    gap: 10px;
    height: 44px;
    padding-left: 10px;
    border-bottom: 1px solid var(--phone-menu-item-border-color);
  }
</style>
