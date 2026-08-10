<template>
  <div class="dl-page">
    <div class="dl-bg" aria-hidden="true">
      <span class="dl-orb dl-orb--a"></span>
      <span class="dl-orb dl-orb--b"></span>
    </div>

    <div class="dl-inner">
      <button v-if="canGoBack" type="button" class="dl-back" @click="handleBack">
        <SvgIcon :src="icon.arrow_right" size="14" class="dl-back-icon" aria-hidden="true" />
        <span>{{ t('download.back') }}</span>
      </button>
      <a v-else class="dl-back" href="/">
        <SvgIcon :src="icon.arrow_right" size="14" class="dl-back-icon" aria-hidden="true" />
        <span>{{ t('download.backHome') }}</span>
      </a>

      <!-- ==================== 首屏 ==================== -->
      <header class="dl-hero">
        <img class="dl-hero-icon" src="/icon-192.png" :alt="t('download.iconAlt')" width="72" height="72" />
        <h1 class="dl-hero-title">{{ t('download.title') }}</h1>
        <p class="dl-hero-sub">{{ t('download.subtitle') }}</p>

        <p class="dl-hero-meta">
          <span>{{ t('download.versionLabel') }} {{ release.versionName }}</span>
          <span class="dl-dot">·</span>
          <span>{{ t('download.updatedLabel') }} {{ release.releaseDate }}</span>
          <span class="dl-dot">·</span>
          <span>{{ formatFileSize(release.fileSizeBytes) }}</span>
        </p>

        <!-- 主行动区:按运行环境分流(文档 6.2)。APK 内两种安装入口都不出现。 -->
        <div class="dl-actions">
          <!-- 已在轻笺 APK 内:不展示任何下载或安装入口 -->
          <div v-if="isAndroidApp" class="dl-inapp">
            <SvgIcon :src="icon.pwa.check" size="18" aria-hidden="true" />
            <span>{{ t('download.alreadyInApp') }}</span>
          </div>

          <!-- iOS / iPadOS:不展示 APK 主按钮,只给 PWA -->
          <template v-else-if="platform === 'ios'">
            <p class="dl-ios-note">{{ t('download.iosNote') }}</p>
            <button type="button" class="dl-btn-main" @click="handleOpenPwaGuide">
              {{ t('download.addToHomeScreen') }}
            </button>
          </template>

          <!-- 电脑 / 平板浏览器:不自动下载,给出可转到手机的地址 -->
          <template v-else-if="platform === 'desktop'">
            <p class="dl-desktop-note">{{ t('download.desktopNote') }}</p>
            <div class="dl-url-box">
              <code class="dl-url">{{ pageUrl }}</code>
              <button type="button" class="dl-copy-btn" @click="copyText(pageUrl, t('download.copiedPageUrl'))">
                {{ t('download.copy') }}
              </button>
            </div>
            <div class="dl-desktop-actions">
              <button type="button" class="dl-btn-ghost" @click="copyText(apkUrl, t('download.copiedApkUrl'))">
                {{ t('download.copyApkLink') }}
              </button>
              <button type="button" class="dl-btn-ghost" @click="handleOpenPwaGuide">
                {{ t('download.usePwaInstead') }}
              </button>
            </div>
          </template>

          <!-- Android / 鸿蒙:APK 主按钮 + PWA 备用。
               主按钮必须是 <a download>:原生下载语义,支持右键另存,不依赖 JS。 -->
          <template v-else>
            <a
              v-if="release.released"
              class="dl-btn-main"
              :href="release.downloadPath"
              :download="apkFileName"
              @click="handleDownload"
            >
              <SvgIcon :src="icon.cloudSpace.download" size="19" aria-hidden="true" />
              <span>{{ t('download.downloadApk') }}</span>
            </a>
            <button v-else type="button" class="dl-btn-main" disabled>
              {{ t('download.preparing') }}
            </button>
            <button type="button" class="dl-btn-ghost" @click="handleOpenPwaGuide">
              {{ t('download.usePwaInstead') }}
            </button>
          </template>
        </div>

        <ul class="dl-requirements">
          <li>
            <SvgIcon :src="icon.pwa.android" size="15" aria-hidden="true" />
            <span>{{ t('download.reqAndroid', { version: release.minAndroidVersion }) }}</span>
          </li>
          <li>
            <SvgIcon :src="icon.pwa.harmony" size="15" aria-hidden="true" />
            <!-- 措辞是"部分支持 Android APK 的鸿蒙设备可通过卓易通安装",不能写成"鸿蒙原生版" -->
            <span>{{ t('download.reqHarmony') }}</span>
          </li>
        </ul>

        <p class="dl-safety">
          <SvgIcon :src="icon.message.warning" size="15" aria-hidden="true" />
          <span>{{ t('download.safetyOnlyOfficial', { host: OFFICIAL_HOST }) }}</span>
        </p>
      </header>

      <!-- ==================== 安装步骤:侧载的刚需信息,保持展开 ==================== -->
      <section v-if="!isAndroidApp" class="dl-card">
        <h2 class="dl-card-title">{{ t('download.installTitle') }}</h2>
        <ol class="dl-steps">
          <li v-for="(step, i) in installSteps" :key="i">{{ step }}</li>
        </ol>
        <p class="dl-note">
          <SvgIcon :src="icon.pwa.tip" size="15" aria-hidden="true" />
          <span>{{ t('download.unknownSourceNote') }}</span>
        </p>
      </section>

      <!-- ==================== 以下均默认收起 ====================
           普通用户装完就走,不该被校验值、排查步骤这类信息挡路;
           但侧载分发提供哈希是安全惯例,在意的人要能查到,所以折叠而非删除。 -->
      <details class="dl-fold">
        <summary class="dl-fold-summary">
          <span>{{ t('download.verifyTitle') }}</span>
          <SvgIcon :src="icon.arrow_right" size="14" class="dl-fold-chevron" aria-hidden="true" />
        </summary>
        <p class="dl-card-sub">{{ t('download.verifyDesc') }}</p>

        <dl class="dl-facts">
          <div class="dl-fact">
            <dt>{{ t('download.factPackage') }}</dt>
            <dd><code>{{ release.packageName }}</code></dd>
          </div>
          <div class="dl-fact">
            <dt>{{ t('download.factVersion') }}</dt>
            <dd>{{ release.versionName }} <span class="dl-muted">(versionCode {{ release.versionCode }})</span></dd>
          </div>
          <div class="dl-fact">
            <dt>{{ t('download.factSize') }}</dt>
            <dd>{{ formatFileSize(release.fileSizeBytes) }}</dd>
          </div>
          <div class="dl-fact dl-fact--wide">
            <dt>{{ t('download.factApkHash') }}</dt>
            <dd class="dl-hash-row">
              <code class="dl-hash">{{ release.sha256 }}</code>
              <button type="button" class="dl-copy-btn" @click="copyText(release.sha256, t('download.copiedHash'))">
                {{ t('download.copy') }}
              </button>
            </dd>
          </div>
          <div class="dl-fact dl-fact--wide">
            <dt>{{ t('download.factCertHash') }}</dt>
            <dd class="dl-hash-row">
              <code class="dl-hash">{{ release.certificateSha256 }}</code>
              <button
                type="button"
                class="dl-copy-btn"
                @click="copyText(release.certificateSha256, t('download.copiedCert'))"
              >
                {{ t('download.copy') }}
              </button>
            </dd>
          </div>
          <div class="dl-fact dl-fact--wide">
            <dt>{{ t('download.factPermissions') }}</dt>
            <dd>
              <ul class="dl-perm-list">
                <li v-for="perm in release.permissions" :key="perm"><code>{{ perm }}</code></li>
              </ul>
              <p class="dl-perm-note">{{ t('download.permissionNote') }}</p>
            </dd>
          </div>
        </dl>

        <p class="dl-verify-hint">{{ t('download.verifyHint') }}</p>
      </details>

      <details class="dl-fold">
        <summary class="dl-fold-summary">
          <span>{{ t('download.troubleTitle') }}</span>
          <SvgIcon :src="icon.arrow_right" size="14" class="dl-fold-chevron" aria-hidden="true" />
        </summary>
        <ul class="dl-bullets">
          <li v-for="(item, i) in troubleshooting" :key="i">{{ item }}</li>
        </ul>
        <div class="dl-subsections">
          <div>
            <h3 class="dl-sub-title">{{ t('download.updateTitle') }}</h3>
            <p class="dl-sub-text">{{ t('download.updateDesc') }}</p>
          </div>
          <div>
            <h3 class="dl-sub-title">{{ t('download.uninstallTitle') }}</h3>
            <p class="dl-sub-text">{{ t('download.uninstallDesc') }}</p>
          </div>
        </div>
      </details>

      <details class="dl-fold">
        <summary class="dl-fold-summary">
          <span>{{ t('download.changelogTitle') }}</span>
          <SvgIcon :src="icon.arrow_right" size="14" class="dl-fold-chevron" aria-hidden="true" />
        </summary>
        <p class="dl-card-sub">{{ t('download.changelogVersion', { version: release.versionName }) }}</p>
        <ul class="dl-bullets">
          <li v-for="(item, i) in changelog" :key="i">{{ item }}</li>
        </ul>
      </details>

      <!-- ==================== 页脚:备案与联系 ==================== -->
      <footer class="dl-foot">
        <div class="dl-foot-links">
          <a href="/about.html">{{ t('download.about') }}</a>
          <span class="dl-sep">|</span>
          <a href="/legal/privacy-policy.html">{{ t('download.privacyPolicy') }}</a>
          <span class="dl-sep">|</span>
          <a href="/legal/user-agreement.html">{{ t('download.userAgreement') }}</a>
          <span class="dl-sep">|</span>
          <a href="mailto:1902013368@qq.com">{{ t('download.contact') }}</a>
        </div>
        <div class="dl-foot-filing">
          <!-- App 备案号与网站 ICP 备案号是两个不同的号,分别标注清楚,不能互相冒充 -->
          <span class="dl-filing-item">
            {{ t('download.appFilingLabel') }}
            <a :href="MIIT_QUERY_URL" target="_blank" rel="noopener noreferrer">{{ APP_FILING_NUMBER }}</a>
          </span>
          <span class="dl-filing-item">
            {{ t('download.websiteFilingNameLabel', { name: WEBSITE_FILING_NAME }) }}
          </span>
          <span class="dl-filing-item">
            {{ t('download.icpLabel') }}
            <a :href="MIIT_QUERY_URL" target="_blank" rel="noopener noreferrer">{{ WEBSITE_ICP_NUMBER }}</a>
          </span>
          <span v-if="hasPublicSecurityFiling" class="dl-filing-item">
            <a :href="PUBLIC_SECURITY_QUERY_URL" target="_blank" rel="noopener noreferrer">
              {{ PUBLIC_SECURITY_FILING_NUMBER }}
            </a>
          </span>
        </div>
      </footer>
    </div>
  </div>
</template>

<script setup lang="ts">
  import { computed, onBeforeUnmount, onMounted } from 'vue';
  import { useI18n } from 'vue-i18n';
  import { useRouter } from 'vue-router';
  // 这个页面刻意用原生 button / a 而不是 BButton:主下载入口必须是 <a download> 才有原生下载语义,
  // 若只有它是 <a>、其余是 BButton,主次按钮会因两套样式体系而割裂,故整页统一自带按钮样式。
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import icon from '@/config/icon.ts';
  import message from '@/components/base/BasicComponents/BMessage/BMessage.ts';
  import { usePwaInstall } from '@/composables/usePwaInstall';
  import { isLightNoteAndroidApp } from '@/utils/androidBridge.ts';
  import { recordOperation } from '@/api/commonApi.ts';
  import {
    ANDROID_RELEASE,
    APP_FILING_NUMBER,
    MIIT_QUERY_URL,
    OFFICIAL_HOST,
    WEBSITE_ICP_NUMBER,
    WEBSITE_FILING_NAME,
    formatFileSize,
  } from '@/config/androidRelease.ts';
  import {
    PUBLIC_SECURITY_FILING_NUMBER,
    PUBLIC_SECURITY_QUERY_URL,
    hasPublicSecurityFiling,
  } from '@/config/siteCompliance.ts';

  const { t, tm, rt } = useI18n();
  const router = useRouter();
  const release = ANDROID_RELEASE;

  // 从站内进来才给「返回」,否则给「返回首页」。这个页面会被搜索引擎、扫码和外部链接直接打开,
  // 那种情况下 history.back() 会把人送出轻笺。
  // 没用项目里常见的 window.history.length > 1:同一标签页逛过别的站再进来时它也 > 1,
  // 判断不出上一页到底是不是本站。这里先认 Vue Router 自己记的上一条(SPA 导航),
  // 再用 referrer 兜整页导航的情况。
  const canGoBack = (() => {
    if (typeof router.options.history.state.back === 'string') return true;
    if (!document.referrer) return false;
    try {
      return new URL(document.referrer).origin === window.location.origin;
    } catch {
      return false;
    }
  })();

  function handleBack() {
    router.back();
  }
  const isAndroidApp = isLightNoteAndroidApp();
  const { detectedPlatform, openGuide } = usePwaInstall();

  // 'harmony' 只是 UA 猜测(华为/荣耀的 Android 机也会命中),所以鸿蒙与 Android 走同一套 APK 入口,
  // 由页面上的兼容说明让用户自己判断,不替用户断言"你的鸿蒙一定装得上"。
  const platform = computed(() => detectedPlatform.value);

  const pageUrl = `https://${OFFICIAL_HOST}/download/android`;
  const apkUrl = `https://${OFFICIAL_HOST}${release.downloadPath}`;
  // 落地到用户下载目录时保留带版本号的文件名,方便对照本页哈希
  const apkFileName = release.downloadPath.split('/').pop() || 'light-note.apk';

  // 数组型文案:tm() 拿到的元素是编译后的消息对象,必须过 rt() 才是可渲染字符串(vue-i18n 官方组合)。
  function messageList(key: string): string[] {
    const raw = tm(key);
    if (!Array.isArray(raw)) return [];
    return raw.map((item) => (typeof item === 'string' ? item : rt(item)));
  }

  const installSteps = computed(() => messageList('download.installSteps'));
  const changelog = computed(() => messageList('download.changelogItems'));
  const troubleshooting = computed(() => messageList('download.troubleItems'));

  async function copyText(text: string, successHint: string) {
    try {
      await navigator.clipboard.writeText(text);
      message.success(successHint);
    } catch {
      message.warning(t('download.copyFailed'));
    }
  }

  function handleDownload() {
    void recordOperation({ module: 'Android 下载页', operation: `下载 APK ${release.versionName}` });
  }

  function handleOpenPwaGuide() {
    openGuide('download-android');
  }

  // 路由 meta.title 在本项目里没有被任何守卫消费(syncRouteSeoMeta 只管 robots/canonical/og:url),
  // 而这是一个公开可索引、会被分享出去的落地页,所以自己设标题并在离开时还原。
  let previousTitle = '';

  onMounted(() => {
    previousTitle = document.title;
    document.title = `${t('download.title')} · ${t('download.pageTitleSuffix')}`;
    void recordOperation({ module: 'Android 下载页', operation: `访问【${platform.value}】` });
  });

  onBeforeUnmount(() => {
    if (previousTitle) document.title = previousTitle;
  });
</script>

<style scoped lang="less">
  .dl-page {
    position: relative;
    /* 全局把 body / #app / .app-root 锁成视口高 + overflow:hidden(应用是固定框布局,各区域内部滚动),
       所以这个顶层页面必须自己当滚动容器:用 min-height 会被内容撑开却没人能滚,首屏以下直接看不到。 */
    height: 100%;
    padding: 0 16px 56px;
    overflow-x: hidden;
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;
    background: var(--background-color);
    color: var(--text-color);
  }

  .dl-bg {
    position: absolute;
    inset: 0;
    overflow: hidden;
    pointer-events: none;
  }
  .dl-orb {
    position: absolute;
    border-radius: 50%;
    filter: blur(78px);
    opacity: 0.5;
  }
  .dl-orb--a {
    top: -130px;
    left: -90px;
    width: 340px;
    height: 340px;
    background: color-mix(in srgb, var(--primary-color) 24%, transparent);
  }
  .dl-orb--b {
    top: 220px;
    right: -120px;
    width: 300px;
    height: 300px;
    background: color-mix(in srgb, var(--primary-color) 14%, transparent);
  }

  .dl-inner {
    position: relative;
    max-width: 720px;
    margin: 0 auto;
  }

  /* 站内来时是 <button>(router.back),直接打开时是 <a href="/">,两种都走这套样式 */
  .dl-back {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    margin: 22px 0 8px;
    padding: 0;
    border: 0;
    background: transparent;
    color: var(--desc-color);
    font-family: inherit;
    font-size: 13px;
    text-decoration: none;
    cursor: pointer;
  }
  .dl-back:hover {
    color: var(--primary-color);
  }
  .dl-back-icon {
    transform: rotate(180deg);
  }

  /* ---------- 首屏 ---------- */
  .dl-hero {
    padding: 12px 0 34px;
    text-align: center;
  }
  .dl-hero-icon {
    border-radius: 17px;
    box-shadow: 0 8px 26px color-mix(in srgb, var(--primary-color) 22%, transparent);
  }
  .dl-hero-title {
    margin: 16px 0 0;
    font-size: 27px;
    font-weight: 650;
    letter-spacing: 0.4px;
  }
  .dl-hero-sub {
    margin: 9px 0 0;
    color: var(--desc-color);
    font-size: 14px;
    line-height: 1.65;
  }
  .dl-hero-meta {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 7px;
    margin: 15px 0 0;
    color: var(--desc-color);
    font-size: 13px;
    font-variant-numeric: tabular-nums;
  }
  .dl-dot {
    opacity: 0.5;
  }

  .dl-actions {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 11px;
    margin: 24px 0 0;
  }
  .dl-btn-main {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    min-width: 218px;
    height: 47px;
    padding: 0 26px;
    border: 0;
    border-radius: 12px;
    background: var(--primary-color);
    color: #fff;
    font-size: 15.5px;
    font-weight: 550;
    text-decoration: none;
    cursor: pointer;
    transition:
      transform 0.16s ease,
      box-shadow 0.16s ease,
      opacity 0.16s ease;
    box-shadow: 0 6px 18px color-mix(in srgb, var(--primary-color) 30%, transparent);
  }
  .dl-btn-main:hover {
    transform: translateY(-1px);
    box-shadow: 0 9px 22px color-mix(in srgb, var(--primary-color) 38%, transparent);
  }
  .dl-btn-main:active {
    transform: translateY(0);
  }
  .dl-btn-main:disabled {
    opacity: 0.55;
    cursor: not-allowed;
    box-shadow: none;
    transform: none;
  }

  .dl-btn-ghost,
  .dl-copy-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border: 1px solid color-mix(in srgb, var(--card-border-color) 82%, transparent);
    border-radius: 9px;
    background: transparent;
    color: var(--text-color);
    cursor: pointer;
    transition:
      border-color 0.16s ease,
      background 0.16s ease;
  }
  .dl-btn-ghost:hover,
  .dl-copy-btn:hover {
    border-color: color-mix(in srgb, var(--primary-color) 48%, transparent);
    /* 相对容器底色偏移,深浅两套主题下都能看出被 hover */
    background: color-mix(in srgb, var(--primary-color) 7%, var(--background-color));
    color: var(--primary-color);
  }
  .dl-btn-ghost {
    height: 39px;
    padding: 0 17px;
    font-size: 13.5px;
  }
  .dl-inapp {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    padding: 11px 18px;
    border: 1px solid color-mix(in srgb, var(--card-border-color) 80%, transparent);
    border-radius: 11px;
    /* 相对容器底色偏移,别绑死表面变量:深浅两套主题里都要看得出是一块浅底提示 */
    background: color-mix(in srgb, var(--primary-color) 6%, var(--background-color));
    color: var(--desc-color);
    font-size: 13.5px;
  }
  .dl-ios-note,
  .dl-desktop-note {
    max-width: 470px;
    margin: 0 0 4px;
    color: var(--desc-color);
    font-size: 13.5px;
    line-height: 1.7;
  }
  .dl-url-box {
    display: flex;
    align-items: center;
    gap: 8px;
    max-width: 100%;
    padding: 7px 7px 7px 13px;
    border: 1px solid color-mix(in srgb, var(--card-border-color) 80%, transparent);
    border-radius: 11px;
    background: color-mix(in srgb, var(--primary-color) 4%, var(--background-color));
  }
  .dl-url {
    overflow-x: auto;
    font-size: 13px;
    white-space: nowrap;
  }
  .dl-desktop-actions {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 9px;
  }

  .dl-requirements {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 7px;
    margin: 22px 0 0;
    padding: 0;
    list-style: none;
  }
  .dl-requirements li {
    display: flex;
    align-items: center;
    gap: 7px;
    color: var(--desc-color);
    font-size: 13px;
    text-align: left;
  }

  .dl-safety {
    display: inline-flex;
    align-items: flex-start;
    gap: 7px;
    max-width: 500px;
    margin: 18px auto 0;
    padding: 10px 14px;
    border: 1px solid color-mix(in srgb, var(--warning-color, #d97706) 34%, transparent);
    border-radius: 10px;
    background: color-mix(in srgb, var(--warning-color, #d97706) 8%, var(--background-color));
    color: var(--text-color);
    font-size: 12.8px;
    line-height: 1.65;
    text-align: left;
  }

  /* ---------- 卡片 ---------- */
  .dl-card {
    margin: 16px 0 0;
    padding: 22px 22px 24px;
    border: 1px solid color-mix(in srgb, var(--card-border-color) 76%, transparent);
    border-radius: 15px;
    background: var(--card-background-color, var(--background-color));
  }
  .dl-card-title {
    margin: 0;
    font-size: 16.5px;
    font-weight: 620;
  }
  .dl-card-sub {
    margin: 7px 0 0;
    color: var(--desc-color);
    font-size: 13px;
    line-height: 1.65;
  }

  /* ---------- 折叠区 ---------- */
  .dl-fold {
    margin: 10px 0 0;
    padding: 0 20px;
    border: 1px solid color-mix(in srgb, var(--card-border-color) 66%, transparent);
    border-radius: 13px;
    background: var(--card-background-color, var(--background-color));
  }
  .dl-fold[open] {
    padding-bottom: 20px;
  }
  .dl-fold-summary {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    padding: 15px 0;
    color: var(--text-color);
    font-size: 14px;
    font-weight: 550;
    cursor: pointer;
    list-style: none;
  }
  /* Safari 仍按 summary 默认三角渲染,显式去掉后用自绘的 chevron */
  .dl-fold-summary::-webkit-details-marker {
    display: none;
  }
  .dl-fold-summary:hover {
    color: var(--primary-color);
  }
  .dl-fold-chevron {
    flex: 0 0 auto;
    color: var(--desc-color);
    transform: rotate(90deg);
    transition: transform 0.18s ease;
  }
  .dl-fold[open] .dl-fold-chevron {
    transform: rotate(-90deg);
  }

  .dl-facts {
    margin: 18px 0 0;
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(210px, 1fr));
    gap: 14px 20px;
  }
  .dl-fact--wide {
    grid-column: 1 / -1;
  }
  .dl-fact dt {
    margin: 0 0 5px;
    color: var(--desc-color);
    font-size: 12.5px;
  }
  .dl-fact dd {
    margin: 0;
    font-size: 13.5px;
    line-height: 1.6;
  }
  .dl-muted {
    color: var(--desc-color);
  }
  .dl-hash-row {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .dl-hash {
    flex: 1 1 auto;
    min-width: 0;
    overflow-x: auto;
    padding: 7px 10px;
    border-radius: 8px;
    background: color-mix(in srgb, var(--primary-color) 5%, var(--background-color));
    font-size: 12px;
    /* 哈希很长:自己横向滚动,不让页面 body 横向滚 */
    white-space: nowrap;
  }
  .dl-copy-btn {
    flex: 0 0 auto;
    height: 31px;
    padding: 0 12px;
    font-size: 12.5px;
  }
  .dl-perm-list {
    margin: 0;
    padding: 0 0 0 2px;
    list-style: none;
  }
  .dl-perm-list li {
    margin: 0 0 3px;
    font-size: 12.5px;
  }
  .dl-perm-note {
    margin: 7px 0 0;
    color: var(--desc-color);
    font-size: 12.5px;
    line-height: 1.6;
  }
  .dl-verify-hint {
    margin: 16px 0 0;
    padding: 11px 13px;
    border-radius: 10px;
    background: color-mix(in srgb, var(--primary-color) 5%, var(--background-color));
    color: var(--desc-color);
    font-size: 12.5px;
    line-height: 1.7;
  }

  .dl-steps {
    margin: 16px 0 0;
    padding: 0 0 0 20px;
  }
  .dl-steps li {
    margin: 0 0 8px;
    font-size: 13.5px;
    line-height: 1.7;
  }
  .dl-note {
    display: flex;
    align-items: flex-start;
    gap: 7px;
    margin: 14px 0 0;
    color: var(--desc-color);
    font-size: 12.8px;
    line-height: 1.65;
  }
  .dl-subsections {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(230px, 1fr));
    gap: 16px 22px;
    margin: 20px 0 0;
  }
  .dl-sub-title {
    margin: 0 0 6px;
    font-size: 14px;
    font-weight: 600;
  }
  .dl-sub-title--spaced {
    margin-top: 22px;
  }
  .dl-sub-text {
    margin: 0;
    color: var(--desc-color);
    font-size: 13px;
    line-height: 1.7;
  }
  .dl-bullets {
    margin: 12px 0 0;
    padding: 0 0 0 18px;
  }
  .dl-bullets li {
    margin: 0 0 7px;
    font-size: 13.2px;
    line-height: 1.7;
  }

  /* ---------- 页脚 ---------- */
  .dl-foot {
    margin: 26px 0 0;
    text-align: center;
  }
  .dl-foot-links,
  .dl-foot-filing {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    align-items: center;
    gap: 8px;
    font-size: 12.5px;
  }
  .dl-foot-filing {
    margin: 10px 0 0;
    gap: 6px 18px;
    color: var(--desc-color);
    font-variant-numeric: tabular-nums;
  }
  .dl-filing-item {
    display: inline-flex;
    align-items: center;
    gap: 5px;
  }
  .dl-foot a {
    color: var(--desc-color);
    text-decoration: none;
  }
  .dl-foot a:hover {
    color: var(--primary-color);
  }
  .dl-sep {
    color: var(--desc-color);
    opacity: 0.45;
  }

  code {
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    word-break: break-all;
  }

  @media (max-width: 520px) {
    .dl-hero-title {
      font-size: 23px;
    }
    .dl-card {
      padding: 18px 15px 20px;
    }
    .dl-hash-row {
      flex-direction: column;
      align-items: stretch;
      gap: 7px;
    }
    .dl-copy-btn {
      align-self: flex-end;
    }
  }
</style>
