<template>
  <CommonContainer
    :title="$t('personCenter.title')"
    :show-back="false"
    :show-navigation="!bookmark.isMobile"
    embedded-mobile
    :style="{ backgroundColor: user.currentTheme === 'day' ? '#f6f7f9' : '#222222' }"
  >
    <div class="person-center-layout" :class="{ 'person-center-layout--mobile': bookmark.isMobile }">
      <div class="person-title-card" :style="{ backgroundColor: user.currentTheme === 'day' ? '#97a1c6' : '#4d5264' }">
        <div style="display: flex; gap: 20px; align-items: center">
          <div class="navigation-icon" :class="{ 'has-frame': equippedFrameId }" :style="{ color: user.iconColor }">
            <AvatarFramePreview
              v-if="equippedFrameId"
              :frame-id="equippedFrameId"
              :src="user.headPicture || icon.navigation.user"
              :size="44"
              :decorative="false"
              class="dom-hover"
              @click="zoomImage"
            />
            <svg-icon
              v-else
              img-id="viewUserImg"
              @click="zoomImage"
              size="50"
              :src="user.headPicture || icon.navigation.user"
              class="dom-hover"
            />
          </div>
          <div style="display: flex; flex-direction: column">
            <b style="font-size: 20px">{{ user.alias ? user.alias : $t('personCenter.defaultNickname') }}</b>
          </div>
        </div>
        <div class="user-icon-text" :style="{ color: user.iconColor }">
          <div style="display: flex; gap: 20px; font-size: 14px">
            <span
              >{{ $t('navigation.bookmark') }}<span style="margin-left: 10px">{{ user.bookmarkTotal }}</span></span
            >
            <span
              >{{ $t('navigation.note') }}<span style="margin-left: 10px">{{ user.noteTotal }}</span></span
            >
            <span
              >{{ $t('personCenter.storageUsed')
              }}<span style="margin-left: 10px">{{ formatStorageSize(user.storageUsed) }}</span></span
            >
          </div>
        </div>
      </div>
      <div
        class="person-menu-scroll"
        :class="{ 'person-menu-scroll--mobile': bookmark.isMobile, 'no-scrollbar': bookmark.isMobile }"
      >
        <div class="person-menu">
          <div class="person-menu-item" @click="goToProfileModule('/myInfo')">
            <span class="person-menu-item-title">{{ $t('personCenter.personalProfile') }}</span>
            <span class="person-menu-item-des"
              >{{ $t('personCenter.email_nickname') }}
              <svg-icon color="#999fa8" style="rotate: 180deg" :src="icon.arrow_left" size="14" />
            </span>
          </div>
          <div
            class="person-menu-item"
            @click="goGrowth"
            v-click-log="{ module: '个人中心', operation: '打开我的成长' }"
          >
            <span class="person-menu-item-title">{{ $t('growth.entry') }}</span>
            <span class="person-menu-item-des"
              >Lv.{{ growthInfo?.level || 1 }} · 🪙 {{ (growthInfo?.points || 0).toLocaleString('en-US') }}
              <svg-icon color="#999fa8" style="rotate: 180deg" :src="icon.arrow_left" size="14" />
            </span>
          </div>
        </div>
        <div class="person-menu">
          <!-- 主题与语言已统一收敛到设置页，移动端个人中心只保留设置入口。 -->
          <BButton v-if="!isAndroidApp" class="person-menu-item person-menu-item--button" @click="handlePwaEntry">
            <span class="person-menu-item-title">{{ $t('pwa.install') }}</span>
            <span class="person-menu-item-des">
              {{ pwaEntryDescription }}
              <svg-icon color="#999fa8" style="rotate: 180deg" :src="icon.arrow_left" size="14" />
            </span>
          </BButton>
          <!--
            App 内复用「安装 App」这一格:浏览器里是装 App、App 里是更新 App,同一位置的两种形态。
            不另开入口是刻意的 —— settingsRegistry 里已经写明安装类入口只保留这一处。
          -->
          <BButton v-if="isAndroidApp" class="person-menu-item person-menu-item--button" @click="handleAppUpdateEntry">
            <span class="person-menu-item-title">
              {{ $t('appUpdate.entry') }}
              <!-- 实心圆点,不依赖混色:APK 的 WebView 会把 color-mix 回退成实色，状态信号必须自带形状 -->
              <span v-if="showUpdateBadge" class="person-menu-item-dot" aria-hidden="true"></span>
            </span>
            <span class="person-menu-item-des">
              {{ appUpdateDescription }}
              <svg-icon color="#999fa8" style="rotate: 180deg" :src="icon.arrow_left" size="14" />
            </span>
          </BButton>
          <div
            class="person-menu-item"
            @click="goToProfileModule('/settings')"
            v-click-log="{ module: '个人中心', operation: '打开设置' }"
          >
            <span class="person-menu-item-title">{{ $t('settings.title') }}</span>
            <span class="person-menu-item-des">
              <svg-icon color="#999fa8" style="rotate: 180deg" :src="icon.arrow_left" size="14" />
            </span>
          </div>
          <div
            class="person-menu-item"
            @click="goToProfileModule('/help')"
            v-click-log="{ module: '个人中心', operation: '打开帮助' }"
          >
            <span class="person-menu-item-title">{{ $t('personCenter.help') }}</span>
            <span class="person-menu-item-des">
              <svg-icon color="#999fa8" style="rotate: 180deg" :src="icon.arrow_left" size="14" />
            </span>
          </div>
          <div
            v-if="user.role === 'root'"
            class="person-menu-item"
            @click="goToProfileModule('/admin')"
            v-click-log="{ module: '个人中心', operation: `后台管理` }"
          >
            <span class="person-menu-item-title">{{ $t('personCenter.admin') }}</span>
            <span class="person-menu-item-des"
              >{{ $t('personCenter.logs_user_mg')
              }}<svg-icon color="#999fa8" style="rotate: 180deg" :src="icon.arrow_left" size="14" /></span
          ></div>
        </div>
        <div class="person-menu">
          <!-- 「工作台」入口已随移动端「今日」上线移除:底部一级入口就是同一个页面,
               不能长期并存两个入口。快速添加同样重复(今日页快速记录 + 顶栏加号),
               书签管理在书签页顶部已有按钮。资源中心保留:底部搜索位让给今日后,
               它是「浏览全部资源 / 待整理」除搜索层「查看全部」外的唯一入口。 -->
          <div
            class="person-menu-item"
            @click="goToProfileModule('/search')"
            v-click-log="{ module: '个人中心', operation: `资源中心` }"
          >
            <span class="person-menu-item-title">{{ $t('personCenter.resourceCenter') }}</span>
            <span class="person-menu-item-des">
              <span class="person-menu-item-des-text">{{ $t('personCenter.resourceCenterDesc') }}</span>
              <svg-icon
                class="person-menu-item-arrow"
                color="#999fa8"
                style="rotate: 180deg"
                :src="icon.arrow_left"
                size="14"
              />
            </span>
          </div>
          <div
            class="person-menu-item"
            @click="goToProfileModule('/ptrash')"
            v-click-log="{ module: '个人中心', operation: '回收站' }"
          >
            <span class="person-menu-item-title">{{ $t('trash.title') }}</span>
            <span class="person-menu-item-des"
              ><svg-icon color="#999fa8" style="rotate: 180deg" :src="icon.arrow_left" size="14" /></span
          ></div>
        </div>
        <div class="person-menu">
          <div
            class="person-menu-item"
            @click="goToProfileModule('/opinions')"
            v-click-log="{ module: '个人中心', operation: `意见反馈` }"
          >
            <span class="person-menu-item-title">{{ $t('personCenter.feedback') }}</span>
            <span class="person-menu-item-des"
              ><svg-icon color="#999fa8" style="rotate: 180deg" :src="icon.arrow_left" size="14" /></span
          ></div>
          <div
            class="person-menu-item"
            @click="goToProfileModule('/updateLogs')"
            v-click-log="{ module: '更新日志', operation: `更新日志` }"
          >
            <span class="person-menu-item-title">{{ $t('personCenter.changelog') }}</span>
            <span class="person-menu-item-des"
              ><svg-icon color="#999fa8" style="rotate: 180deg" :src="icon.arrow_left" size="14" /></span
          ></div>
        </div>
        <div
          class="person-menu"
          @click="handleExitLogin"
          v-click-log="{
            module: '个人中心',
            operation: user.role === 'visitor' ? $t('personCenter.loginRegister') : $t('personCenter.logout'),
          }"
        >
          <div class="person-menu-item" style="justify-content: center">
            <span class="person-menu-item-title">{{
              user.role === 'visitor' ? $t('personCenter.loginRegister') : $t('personCenter.logout')
            }}</span></div
          >
        </div>
      </div>
    </div>
    <my-info v-if="userVisible" v-model:visible="userVisible" />
    <ActionCardModal
      v-if="updateModalVisible"
      v-model:visible="updateModalVisible"
      :title="$t('appUpdate.modalTitle')"
      :sections="updateSections"
      :note="$t('appUpdate.modalNote')"
    />
  </CommonContainer>
</template>

<script setup lang="ts">
  import router from '@/router';
  import icon from '@/config/icon.ts';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import AvatarFramePreview from '@/components/growth/AvatarFramePreview.vue';
  import { bookmarkStore, useUserStore } from '@/store';
  import { formatStorageSize } from '@/utils/common';
  import Alert from '@/components/base/BasicComponents/BModal/Alert.ts';
  import { computed, defineAsyncComponent, onMounted, ref } from 'vue';
  import userApi from '@/api/userApi.ts';
  import CommonContainer from '@/components/base/BasicComponents/CommonContainer.vue';
  import { useI18n } from 'vue-i18n';
  import { recordOperation } from '@/api/commonApi';
  import { useGrowth } from '@/composables/useGrowth.ts';
  import { useMobileTopBar } from '@/composables/useMobileTopBar';
  import { frameVariant } from '@/config/growthFrames';
  import { usePwaInstall } from '@/composables/usePwaInstall';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import { isLightNoteAndroidApp } from '@/utils/androidBridge';
  import { useAndroidAppUpdate } from '@/composables/useAndroidAppUpdate';
  import message from '@/components/base/BasicComponents/BMessage/BMessage.ts';

  const MyInfo = defineAsyncComponent(() => import('@/components/personCenter/myInfo/MyInfo.vue'));
  const ActionCardModal = defineAsyncComponent(() => import('@/components/base/ActionCardModal.vue'));

  const { t } = useI18n();
  const bookmark = bookmarkStore();
  const menuVisible = ref(false);
  const userVisible = ref(false);

  const user = useUserStore();
  const { growth: growthInfo, load: loadGrowth } = useGrowth();
  const equippedFrameId = computed(() => {
    const id = growthInfo.value?.equippedFrame;
    return frameVariant(id) ? id : null;
  });
  const isAndroidApp = isLightNoteAndroidApp();
  const appUpdate = useAndroidAppUpdate();
  const updateModalVisible = ref(false);
  const showUpdateBadge = computed(() => appUpdate.showBadge.value);
  /** 摘要直接把版本号说清楚，省得用户点进去才知道是不是白跑一趟 */
  const appUpdateDescription = computed(() =>
    appUpdate.updateAvailable.value
      ? t('appUpdate.newVersionShort', { version: appUpdate.latestVersion.value })
      : t('appUpdate.currentVersionShort', { version: appUpdate.installedVersion.value }),
  );
  const { canPrompt, isStandalone, openGuide } = usePwaInstall();
  const pwaEntryDescription = computed(() =>
    isStandalone.value
      ? t('pwa.installed')
      : canPrompt.value
        ? t('pwa.directAvailableShort')
        : t('pwa.addToHomeScreen'),
  );
  useMobileTopBar(['personCenter'], {
    searchMode: 'icon',
  });
  onMounted(() => {
    loadGrowth();
  });

  function goToProfileModule(path: string) {
    router.push(path);
  }

  function goGrowth() {
    goToProfileModule('/growth');
  }

  function handlePwaEntry() {
    openGuide('person-center');
  }

  /**
   * 更新入口。无新版时只回一句「已是最新」，不弹面板 —— 用户点它多半是想确认一下。
   * 有新版才展开三层安装路径：下载(通知栏/文件管理器) → 复制地址去浏览器。
   */
  function handleAppUpdateEntry() {
    if (!appUpdate.updateAvailable.value) {
      message.success(t('appUpdate.upToDate', { version: appUpdate.installedVersion.value }));
      return;
    }
    updateModalVisible.value = true;
    recordOperation({ module: '个人中心', operation: `打开更新面板【${appUpdate.latestVersion.value}】` });
  }

  const updateSections = computed(() => [
    {
      key: 'update',
      title: '',
      actions: [
        {
          key: 'download',
          label: t('appUpdate.actionDownload'),
          description: t('appUpdate.actionDownloadDesc'),
          onClick: () => {
            updateModalVisible.value = false;
            if (appUpdate.startUpdate()) {
              recordOperation({ module: '个人中心', operation: `下载新版 APK【${appUpdate.latestVersion.value}】` });
            }
          },
        },
        {
          key: 'browser',
          label: t('appUpdate.actionBrowser'),
          description: t('appUpdate.actionBrowserDesc'),
          onClick: async () => {
            updateModalVisible.value = false;
            await appUpdate.copyDownloadPageUrl();
          },
        },
      ],
    },
  ]);

  function handleExitLogin() {
    menuVisible.value = false;
    if (user.role === 'visitor') {
      bookmark.isShowLogin = true;
    } else {
      Alert.alert({
        title: '提示',
        content: '此操作将退出登录, 是否继续?',
        async onOk() {
          sessionStorage.setItem('manualLogout', '1');
          await userApi.logout();
          window.dispatchEvent(new CustomEvent('light-note:auth-expired'));
        },
      });
    }
  }

  ref<Viewer>();
  function zoomImage() {
    bookmark.refreshViewer(user.headPicture || icon.navigation.user);
    menuVisible.value = false;
  }
</script>

<style lang="less" scoped>
  .person-center-layout--mobile {
    height: 100%;
    min-height: 0;
    display: flex;
    flex-direction: column;
  }

  .person-title-card {
    gap: 40px;
    padding: 15px;
    height: 160px;
    box-sizing: border-box;
    border-radius: 12px;
    display: flex;
    flex-direction: column;
    justify-content: center;
    color: white;
  }

  .person-center-layout--mobile .person-title-card {
    flex: 0 0 auto;
  }

  .person-menu-scroll--mobile {
    min-height: 0;
    padding-bottom: 20px;
    overflow-y: auto;
    overscroll-behavior-y: contain;
    flex: 1 1 auto;
  }

  .person-menu {
    border-radius: 12px;
    overflow: hidden;
    margin-top: 20px;
  }

  .person-menu-item {
    background-color: var(--phone-menu-item-bg-color);
    height: 50px;
    display: flex;
    align-items: center;
    padding: 0 20px;
    justify-content: space-between;
    cursor: pointer;
    &:not(:last-child) {
      border-bottom: 1px solid var(--phone-menu-item-border-color);
    }

    .person-menu-item-title {
      font-size: 16px;
      flex: 0 0 auto;
    }

    /*
     * 新版本红点。实心圆点 + 固定色值,不用 color-mix/阴影表达:
     * APK 的 WebView 会把混色回退成实色、混色阴影回退成透明,只靠混色的状态信号会整体消失。
     */
    .person-menu-item-dot {
      display: inline-block;
      width: 7px;
      height: 7px;
      margin-left: 6px;
      border-radius: 50%;
      background: #f5222d;
      vertical-align: middle;
    }

    .person-menu-item-des {
      min-width: 0;
      margin-left: 16px;
      color: #999fa8;
      font-size: 14px;
      display: flex;
      align-items: center;
      gap: 5px;
      line-height: 100%;
    }

    .person-menu-item-des-text {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .person-menu-item-arrow {
      flex: 0 0 auto;
    }
  }

  .person-menu-item--button {
    width: 100%;
    border: 0;
    border-radius: 0;
    color: var(--text-color);
    line-height: 1;
    text-align: left;
  }

  .navigation-icon {
    display: flex;
    align-items: center;
    clip-path: circle(50% at 50% 50%);
    cursor: pointer;
  }
  .navigation-icon.has-frame {
    clip-path: none;
  }

  .handle-body {
    border-radius: 8px;
    background-color: var(--user-body-bg-color);
    margin-top: 15px;
    padding: 5px;
    width: 220px;

    .handle-body-title-body {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 10px;
      align-items: center;
    }
  }

  .header_menu_ul {
    list-style-type: none;
    text-align: center;
    margin-top: 5px;
    margin-bottom: 5px;
    box-sizing: border-box;
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 10px;

    .li {
      height: 30px;
      cursor: pointer;
      font-size: 12px;
      border-radius: 4px;
      color: var(--text-color);
      gap: 10px;

      &:hover {
        background-color: var(--menu-item-h-bg-color);
        border-radius: 8px;
      }
    }
  }

  .user-icon-text {
    text-align: left;
    color: white !important;
  }

  .modal-content {
    margin: auto;
    display: block;
    height: 90%;
    width: 80%;
    max-width: 700px;
  }

  .modal-content {
    -webkit-animation-name: zoom;
    -webkit-animation-duration: 0.6s;
    animation-name: zoom;
    animation-duration: 0.6s;
    cursor: pointer;
  }

  @media (max-width: 1000px) {
    .modal-content {
      height: 60%;
      width: 80%;
      max-width: 700px;
    }
  }

  :deep(.phone-container--embedded .phone-body) {
    padding-top: 12px;
    overflow: hidden;
  }
</style>
