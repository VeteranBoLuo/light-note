<template>
  <b-modal
    :mask-closable="false"
    :title="t('personCenter.feedback')"
    v-model:visible="visible"
    @close="visible = false"
  >
    <div :style="{ width: bookmark.isMobileDevice ? '95%' : '450px' }">
      <BTabs :options="tabOptions" v-model:activeTab="activeTab" />
      <div class="type" style="height: 330px" v-if="activeTab === t('personCenter.opinions.feedbackType')">
        <b-radio v-model:value="opinionData.type" :options="radioOptions" />
        <b-input
          style="margin-top: 20px"
          type="textarea"
          v-model:value="opinionData.content"
          :placeholder="t('personCenter.opinions.contentPlaceholder')"
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
          <div style="font-size: 14px">{{ t('personCenter.opinions.contactInfo') }}</div>
          <b-input
            v-model:value="opinionData.phone"
            style="margin-top: 10px"
            :placeholder="t('personCenter.opinions.contactPlaceholder')"
          />
        </div>
      </div>
      <div v-else style="height: 330px; overflow-y: auto; position: relative">
        <b-loading :loading="loading" />
        <div v-show="!loading">
          <div v-if="opinionHistory.length > 0" class="opinion-history-container">
            <div v-for="(item, index) in opinionHistory" class="opinion-history-item" :key="index">
              <span
                >{{ t('personCenter.opinions.feedbackContent') }}
                <span style="color: coral">{{ item.content }}</span></span
              >
              <span>{{ t('personCenter.opinions.feedbackTypeLabel') }}{{ item.type }}</span>
              <span>
                {{ t('personCenter.opinions.feedbackImages') }}
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
              <span>{{ t('personCenter.opinions.feedbackTime') }}{{ item.createTime }}</span>
              <span
                >{{ t('personCenter.opinions.developerReply')
                }}<span style="color: coral">{{ item.replay }}</span></span
              >
            </div>
          </div>
          <a-empty
            v-else
            :description="t('personCenter.opinions.noFeedbackHistory')"
            class="both-center"
            style="color: #ccc"
          />
        </div>
      </div>
    </div>
    <template #footer>
      <b-button
        type="primary"
        style="width: 100%; margin-top: 20px"
        @click="submit"
        v-click-log="{
          module: t('personCenter.opinions.feedbackModule'),
          operation: t('personCenter.opinions.submitFeedback'),
        }"
        >{{ t('personCenter.opinions.submit') }}</b-button
      >
    </template>
  </b-modal>
</template>

<script setup lang="ts">
  import BRadio from '@/components/base/BasicComponents/BRadio.vue';
  import BModal from '@/components/base/BasicComponents/BModal/BModal.vue';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BUpload from '@/components/base/BasicComponents/BUpload.vue';
  import BInput from '@/components/base/BasicComponents/BInput.vue';
  import { bookmarkStore, useUserStore } from '@/store';
  import { reactive, Ref, ref, watch, computed } from 'vue';
  import { message } from 'ant-design-vue';
  import { cloneDeep } from 'lodash-es';
  import { apiBasePost } from '@/http/request.ts';
  import BTabs from '@/components/base/BasicComponents/BTabs.vue';
  import BLoading from '@/components/base/BasicComponents/BLoading.vue';
  import { useI18n } from 'vue-i18n';

  const { t } = useI18n();
  const visible = <Ref<boolean>>defineModel('visible');
  const bookmark = bookmarkStore();
  const activeTab = ref(t('personCenter.opinions.feedbackType'));

  const opinionData = reactive({
    type: t('personCenter.opinions.productSuggestion'),
    content: '',
    imgArray: [],
    phone: '',
  });

  const tabOptions = computed(() => [
    t('personCenter.opinions.feedbackType'),
    t('personCenter.opinions.feedbackHistory'),
  ]);

  const radioOptions = computed(() => [
    { label: t('personCenter.opinions.productSuggestion'), value: t('personCenter.opinions.productSuggestion') },
    { label: t('personCenter.opinions.functionFault'), value: t('personCenter.opinions.functionFault') },
    { label: t('personCenter.opinions.otherIssues'), value: t('personCenter.opinions.otherIssues') },
  ]);

  function uploadImg(event) {
    console.log(event);
    event.forEach((img) => {
      if (bookmark.isMobileDevice) {
        if (opinionData.imgArray.length === 2) {
          opinionData.imgArray.shift();
          opinionData.imgArray.push(img.file);
        } else {
          opinionData.imgArray.push(img.file);
        }
      } else {
        if (opinionData.imgArray.length === 3) {
          opinionData.imgArray.shift();
          opinionData.imgArray.push(img.file);
        } else {
          opinionData.imgArray.push(img.file);
        }
      }
    });
  }

  function submit() {
    if (opinionData.content.length < 6) {
      message.warning(t('personCenter.opinions.contentTooShort'));
      return;
    }
    const params: any = cloneDeep(opinionData);
    params.imgArray = JSON.stringify(params.imgArray);
    apiBasePost('/api/opinion/recordOpinion', params)
      .then((res) => {
        if (res.status === 200) {
          message.success(t('personCenter.opinions.thankYouFeedback'));
        }
      })
      .finally(() => {
        visible.value = false;
      });
  }

  const user = useUserStore();
  const opinionHistory = ref([]);
  const loading = ref(false);
  watch(
    () => activeTab.value,
    (val) => {
      if (val === t('personCenter.opinions.feedbackHistory')) {
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
    &:hover {
      .opinion-close-icon {
        opacity: 1;
      }
    }
  }
  .opinion-close-icon {
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    opacity: 0;
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
