import { createApp, defineComponent, h, ref } from 'vue';
import { createI18n } from 'vue-i18n';
import BButton from '@/components/base/BasicComponents/BButton.vue';
import message from '@/components/base/BasicComponents/BMessage/BMessage';
import { useGrowthClaimFeedback } from '@/composables/useGrowthClaimFeedback';
import { applyUiDensity } from '@/composables/useUiDensity';
import zh from '@/i18n/locales/zh-CN';
import en from '@/i18n/locales/en-US';
import '@/assets/css/index.less';

// 隔离夹具只使用真实组件与模拟收据，不访问 API，也不写入账号数据。
const params = new URLSearchParams(location.search);
const mobile = params.get('renderProfile') === 'mobile';
applyUiDensity(params.get('density'), mobile);
document.documentElement.dataset.theme = params.get('theme') || 'day';
document.documentElement.classList.toggle('light-note-mobile-rendering', mobile);
document.body.style.cssText = 'display:block;margin:0;background:var(--workspace-canvas);color:var(--text-color)';
document.getElementById('app')!.style.cssText = 'display:block;padding:100px 24px;box-sizing:border-box;width:100%';
document.documentElement.style.setProperty('--mobile-shell-bottom-height', '64px');

createApp(
  defineComponent({
    setup() {
      const { claimSuccessMessage } = useGrowthClaimFeedback(ref(null));
      const fallback = { daily: 0, growthTasks: 0, achievements: 0, weekly: 0, community: 0 };
      const samples = {
        success: () => message.success('保存成功', 0),
        info: () => message.info('内容已更新', 0),
        error: () => message.error('保存失败，请稍后重试', 0),
        warning: () => message.warning('存储空间不足，请先清理', 0),
        loading: () => message.loading('正在导出文件', 0),
        reward: () =>
          message.success(
            claimSuccessMessage({ points: 20, receipts: [{ type: 'weekly', status: 'claimed' }] }, fallback),
            0,
          ),
        batch: () =>
          message.success(
            claimSuccessMessage(
              {
                exp: 15,
                points: 40,
                receipts: [
                  { type: 'daily', status: 'claimed' },
                  { type: 'daily', status: 'claimed' },
                  { type: 'weekly', status: 'claimed' },
                ],
              },
              fallback,
            ),
            0,
          ),
        long: () =>
          message.error(
            'This operation could not be completed. Please check your connection and try again. VeryLongUnbrokenContentForWrappingVerification0123456789',
            0,
          ),
      };
      return () =>
        h('main', [
          h('h1', '全局提示验收'),
          h('p', '独立触发真实提示；移动端点击提示可关闭。'),
          ...Object.entries(samples).map(([name, show]) =>
            h(
              BButton,
              {
                'data-sample': name,
                onClick: () => {
                  message.destroy();
                  show();
                },
              },
              () => name,
            ),
          ),
          h(BButton, { 'data-sample': 'clear', onClick: () => message.destroy() }, () => '清除'),
        ]);
    },
  }),
)
  .use(createI18n({ legacy: false, locale: params.get('locale') || 'zh-CN', messages: { 'zh-CN': zh, 'en-US': en } }))
  .mount('#app');
