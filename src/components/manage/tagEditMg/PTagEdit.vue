<template>
  <CommonContainer :title="(handleType === 'add' ? '新增' : '编辑') + '标签'">
    <b-loading :loading="loading" style="height: unset">
      <div class="tag-edit-body">
        <div class="tag-attr-item">
          <span class="tag-attr-label">{{ $t('tagManage.tagName') }}</span>
          <b-input v-model:value="tag.name" />
        </div>
        <div class="tag-attr-item" style="position: relative">
          <span class="tag-attr-label">{{ $t('tagManage.icon') }}</span>
          <b-input v-model:value="tag.iconUrl">
            <template #suffix>
              <svg-icon
                :src="icon.file_upload"
                class="dom-hover-click"
                size="20"
                style="height: 32px"
                @click.stop="uploadTagImg"
              />
            </template>
          </b-input>
        </div>
        <div class="tag-attr-item">
          <span class="tag-attr-label">{{ $t('tagManage.relatedTag') }}</span>
          <a-select
            :listHeight="350"
            :dropdownMatchSelectWidth="false"
            mode="multiple"
            :max-tag-count="3"
            :options="tagOptions"
            show-search
            :filter-option="SelectionSearch"
            v-model:value="tag.relatedTagIds"
          />
        </div>
        <div class="tag-attr-item">
          <span class="tag-attr-label">{{ $t('tagManage.relatedBookmark') }}</span>
          <div v-if="bookmark.isMobileDevice" :style="{ height: bookmark.screenHeight - 400 + 'px', overflow: 'auto' }">
            <a-checkbox-group v-model:value="tag.bookmarkList" name="checkboxgroup" :options="bookmarkOptions">
              <template #label="{ label }">
                <div :style="{ width: bookmark.screenWidth / 2 - 20 - 16 - 16 + 'px' }" class="text-hidden"
                  >{{ label }}
                </div>
              </template>
            </a-checkbox-group>
          </div>
          <a-transfer
            v-else
            :rowKey="(record) => record.id"
            v-model:target-keys="tag.bookmarkList"
            :filter-option="filterOption"
            :locale="{
              itemUnit: $t('tagManage.count'),
              itemsUnit: $t('tagManage.count'),
              notFoundContent: $t('tagManage.listEmptyText'),
              searchPlaceholder: $t('placeholder.searchPlaceholder'),
            }"
            :titles="['--' + $t('tagManage.unRelated'), '--' + $t('tagManage.isRelated')]"
            show-search
            :data-source="mockData"
            :list-style="{
              width: '100%',
              height: bookmark.screenHeight - 400 + 'px',
            }"
          >
            <template #render="item">
              <span class="custom-item" :style="{ color: bookmark.iconColor }">{{ item.name }}</span>
            </template>
          </a-transfer>
        </div>
      </div>
    </b-loading>
    <b-button
      class="container-footer-btn"
      type="primary"
      @click="submit"
      v-click-log="OPERATION_LOG_MAP.tagDetail.saveTag"
      >确定
    </b-button>
  </CommonContainer>
</template>

<script lang="ts" setup>
  import { computed, onMounted, ref } from 'vue';
  import { TagInterface } from '@/config/bookmarkCfg.ts';
  import { apiBasePost, apiQueryPost } from '@/http/request.ts';
  import { useRouter } from 'vue-router';
  import BInput from '@/components/base/BasicComponents/BInput.vue';
  import { bookmarkStore, useUserStore } from '@/store';
  import { message } from 'ant-design-vue';
  import { SelectionSearch } from '@/components/base/BasicComponents/BForm/FormRenders.vue';
  import BLoading from '@/components/base/BasicComponents/BLoading.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import icon from '@/config/icon.ts';
  import CommonContainer from '@/components/base/BasicComponents/CommonContainer.vue';
  import { OPERATION_LOG_MAP } from '@/config/logMap.ts';

  const bookmark = bookmarkStore();
  const user = useUserStore();

  const tag = ref<TagInterface>({
    id: '',
    name: '',
    iconUrl: '',
    color: '',
    createTime: '',
    updateTime: '',
    bookmarkList: [],
  });

  getAllBookmarkList();
  getTagSelect();
  const mockData = ref<any[]>([]);
  const filterOption = (inputValue: string, option: any) => {
    return option.name.toUpperCase().indexOf(inputValue.toUpperCase()) > -1;
  };

  async function getAllBookmarkList() {
    const allRes = await apiQueryPost('/api/bookmark/getBookmarkList', {
      filters: {
        userId: localStorage.getItem('userId'),
        type: 'all',
      },
    });
    if (allRes.status === 200) {
      mockData.value = allRes.data.items;
    }
  }

  const bookmarkOptions = computed(() => {
    return mockData.value.map((data) => {
      return {
        label: data.name,
        value: data.id,
      };
    });
  });

  const tagOptions = ref([]);

  async function getTagSelect() {
    const res = await apiQueryPost('/api/bookmark/queryTagList', {
      filters: {
        userId: user.id,
      },
    });
    if (res.status === 200) {
      bookmark.tagList = res.data;
      tagOptions.value = [];
      res.data.forEach((tag) => {
        if (tag.id !== router.currentRoute.value.params.id) {
          tagOptions.value.push({
            label: tag.name,
            value: tag.id,
          });
        }
      });
      return tagOptions.value;
    }
    return [];
  }

  function uploadTagImg() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';

    input.addEventListener('change', function (event: any) {
      const file = event.target.files[0]; // 获取用户选择的文件
      if (file) {
        // 检查文件大小是否超过5M
        const maxFileSize = 5000 * 1024;
        if (file.size > maxFileSize) {
          message.warning('图片大小不能超过5MB');
          return; // 如果文件过大，终止函数执行
        }
        const reader = new FileReader(); // 创建FileReader对象
        reader.onload = function (e) {
          const base64 = e.target.result; // 直接获取Base64编码的字符串
          tag.value.iconUrl = base64.toString();
        };
        reader.onerror = function (error) {
          console.error('Error reading file:', error);
        };
        reader.readAsDataURL(file); // 读取文件内容，结果为Base64编码的字符串
      }
    });

    input.click(); // 触发文件选择对话框
  }

  function submit() {
    if (loading.value) {
      message.warning('请等待数据请求完毕');
    }
    let url = '/api/bookmark/updateTag';
    if (handleType.value === 'add') {
      url = '/api/bookmark/addTag';
    }
    apiBasePost(url, tag.value).then((res) => {
      if (res.status === 200) {
        message.success('保存成功');
        router.back();
      }
    });
  }

  const handleType = computed(() => {
    if (router.currentRoute.value.params.id === 'add') {
      return 'add';
    }
    return 'edit';
  });

  const router = useRouter();
  const loading = ref(false);
  onMounted(async () => {
    if (handleType.value === 'add') {
      return;
    }
    loading.value = true;
    // 创建两个Promise，分别对应两个API调用
    const res = await apiQueryPost('/api/bookmark/getTagDetail', {
      filters: {
        id: router.currentRoute.value.params?.id,
      },
    });
    tag.value = res.data;
    const bookmarkListRes = await apiQueryPost('/api/bookmark/getBookmarkList', {
      filters: {
        userId: user.id,
        tagId: tag.value.id,
        type: 'normal',
      },
    });
    tag.value.bookmarkList = bookmarkListRes.data.items?.map((data) => data.id);
    const relatedRes = await apiQueryPost('/api/bookmark/getRelatedTag', {
      filters: {
        userId: user.id,
        id: tag.value.id,
      },
    });
    tag.value.relatedTagIds = relatedRes.data?.map((data) => data.id);
    loading.value = false;
  });
</script>

<style lang="less" scoped>
  .tag-edit-body {
    width: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 10px;
  }

  .tag-attr-item {
    display: flex;
    flex-direction: column;
    gap: 10px;
    width: 50%;
  }

  .tag-attr-label {
    white-space: nowrap;
  }

  :deep(.ant-transfer-list-header) {
    background-color: var(--background-color);
    color: var(--text-color);
  }

  :deep(.ant-input) {
    background-color: var(--background-color);
    color: var(--text-color);
    transition: none;
  }

  //:deep(.ant-select-selector) {
  //  transition: none !important;
  //}

  :deep(.ant-input-affix-wrapper) {
    transition: none;
  }

  :deep(.ant-transfer-list-search) {
    background-color: var(--background-color);
  }

  :deep(.anticon-search) {
    color: var(--text-color) !important;
  }

  :deep(.ant-btn-primary) {
    box-shadow: none;
  }

  :deep(.ant-transfer-list-content-item-text) {
    color: var(--text-color) !important;
  }

  :deep(.ant-spin-container::after) {
    background-color: unset;
  }

  :deep(.ant-btn-icon-only) {
    color: #ccc;
  }

  @media (max-width: 1300px) {
    .tag-attr-item {
      display: flex;
      flex-direction: column;
      gap: 10px;
      width: 90%;
    }

    :deep(.ant-checkbox-group) {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 5px;
    }

    :deep(.ant-checkbox-group-item) {
      color: var(--text-color);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
  }
</style>
