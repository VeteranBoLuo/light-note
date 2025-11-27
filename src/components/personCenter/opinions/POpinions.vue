<template>
  <CommonContainer title="意见反馈">
    <div :style="{ width: bookmark.isMobileDevice ? '95%' : '450px' }" style="height: 100%">
      <BTabs :options="['反馈类型', '反馈历史']" v-model:activeTab="activeTab" />
      <div class="type" v-if="activeTab === '反馈类型'">
        <b-radio
          style="margin-top: 10px"
          v-model:value="opinionData.type"
          :options="[
            { label: '产品建议', value: '产品建议' },
            { label: '功能故障', value: '功能故障' },
            { label: '其他问题', value: '其他问题' },
          ]"
        />
        <b-input
          style="margin-top: 20px"
          type="textarea"
          v-model:value="opinionData.content"
          placeholder="请输入不少于6字的问题描述"
        />
        <div class="flex-align-center" style="gap: 20px; margin-top: 20px">
          <b-upload multiple accept="image/*" @change="uploadImg" />
          <div v-for="(item, index) in opinionData.imgArray" class="img-item">
            <img :src="item" style="width: 80px; height: 80px; box-sizing: border-box" alt="" />
            <div
              style="
                position: absolute;
                right: 5px;
                top: 5px;
                z-index: 9;
                font-size: 14px;
                padding: 2px;
                background-color: rgba(0, 0, 0, 0.6);
                border-radius: 50%;
                height: 13px;
                width: 13px;
              "
              @click="opinionData.imgArray.splice(index, 1)"
              class="opinion-close-icon"
              ><svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 24 24">
                <path
                  fill="#fff"
                  d="M16.95 8.464a1 1 0 0 0-1.414-1.414L12 10.586L8.464 7.05A1 1 0 1 0 7.05 8.464L10.586 12L7.05 15.536a1 1 0 1 0 1.414 1.414L12 13.414l3.536 3.536a1 1 0 1 0 1.414-1.414L13.414 12z"
                /></svg
            ></div>
          </div>
        </div>
        <div style="margin-top: 10px">
          <div style="font-size: 14px">联系方式</div>
          <b-input v-model:value="opinionData.phone" style="margin-top: 10px" placeholder="请输入电话便于联系" />
        </div>
      </div>
      <div v-else style="height: 95%; overflow-y: auto; position: relative">
        <b-loading :loading="loading" />
        <div v-show="!loading">
          <div v-if="opinionHistory.length > 0" class="opinion-history-container">
            <div v-for="(item, index) in opinionHistory" class="opinion-history-item" :key="index">
              <span
                >反馈内容： <span style="color: coral">{{ item.content }}</span></span
              >
              <span>反馈类型：{{ item.type }}</span>
              <span>
                反馈图片：
                <span class="flex-align-center-gap" v-if="JSON.parse(item.imgArray).length > 0">
                  <img
                    v-for="src in JSON.parse(item.imgArray)"
                    :src="src"
                    height="100"
                    width="100"
                    @click="bookmark.refreshViewer(src)"
                    alt=""
                  />
                </span>
                <span v-else>-</span></span
              >
              <span>反馈时间：{{ item.createTime }}</span>
              <span
                >开发者答复：<span style="color: coral">{{ item.replay }}</span></span
              >
            </div>
          </div>
          <a-empty v-else description="暂无反馈历史" class="both-center" style="color: #ccc" />
        </div>
      </div>
    </div>
    <b-button
      v-if="activeTab === '反馈类型'"
      type="primary"
      class="container-footer-btn"
      @click="submit"
      v-click-log="{ module: '意见反馈', operation: '提交反馈' }"
      >提交</b-button
    >
  </CommonContainer>
</template>

<script setup lang="ts">
  import BRadio from '@/components/base/BasicComponents/BRadio.vue';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BUpload from '@/components/base/BasicComponents/BUpload.vue';
  import BInput from '@/components/base/BasicComponents/BInput.vue';
  import { bookmarkStore, useUserStore } from '@/store';
  import { reactive, ref, watch } from 'vue';
  import { message } from 'ant-design-vue';
  import { cloneDeep } from 'lodash-es';
  import { apiBasePost } from '@/http/request.ts';
  import CommonContainer from '@/components/base/BasicComponents/CommonContainer.vue';
  import router from '@/router';
  import BTabs from '@/components/base/BasicComponents/BTabs.vue';
  import BLoading from '@/components/base/BasicComponents/BLoading.vue';

  const bookmark = bookmarkStore();
  const activeTab = ref('反馈类型');

  const opinionData = reactive({
    type: '产品建议',
    content: '',
    imgArray: [],
    phone: '',
  });

  function uploadImg(event) {
    event.forEach((img) => {
      if (bookmark.isMobileDevice) {
        if (opinionData.imgArray.length === 2) {
          opinionData.imgArray.shift();
          opinionData.imgArray.push(img);
        } else {
          opinionData.imgArray.push(img);
        }
      } else {
        if (opinionData.imgArray.length === 3) {
          opinionData.imgArray.shift();
          opinionData.imgArray.push(img);
        } else {
          opinionData.imgArray.push(img);
        }
      }
    });
  }

  function submit() {
    if (opinionData.content.length < 6) {
      message.warning('请输入不少于6字的问题描述');
      return;
    }
    const params: any = cloneDeep(opinionData);
    params.imgArray = JSON.stringify(params.imgArray);
    apiBasePost('/api/opinion/recordOpinion', params)
      .then((res) => {
        if (res.status === 200) {
          message.success('感谢您的反馈');
        }
      })
      .finally(() => {
        router.back();
      });
  }

  const user = useUserStore();
  const opinionHistory = ref([]);
  const loading = ref(false);
  watch(
    () => activeTab.value,
    (val) => {
      if (val === '反馈历史') {
        loading.value = true;
        apiBasePost('/api/opinion/getOpinionList', {
          currentPage: 1,
          pageSize: 5,
          userId: user.id,
        })
          .then((res) => {
            if (res.status === 200) {
              opinionHistory.value = res.data.items;
            }
          })
          .finally(() => {
            loading.value = false;
          });
      }
    },
  );
</script>

<style lang="less" scoped>
  .img-item {
    position: relative;
    width: 80px;
    height: 80px;
    box-sizing: border-box;
  }
  .opinion-close-icon {
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .opinion-history-container {
    display: flex;
    flex-direction: column;
    gap: 20px;
  }
  .opinion-history-item {
    border: 1px solid #ccc;
    padding: 2px;
    box-sizing: border-box;
    border-radius: 4px;
    height: max-content;
    font-size: 14px;
    display: flex;
    flex-direction: column;
    gap: 5px;
  }
</style>
