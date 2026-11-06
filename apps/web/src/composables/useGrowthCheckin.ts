import { ref, type Ref } from 'vue';
import { useI18n } from 'vue-i18n';
import message from '@/components/base/BasicComponents/BMessage/BMessage';
import { recordOperation } from '@/api/commonApi.ts';
import { useGrowth, type Growth } from '@/composables/useGrowth.ts';

export interface LevelUpCelebration {
  level: number;
  name: string;
  aiGiftTokens?: number;
  giftPending?: boolean;
}

/**
 * 成长页签到与升级提示：签到反馈、连签里程碑庆祝和“进入概览即视为看过升级通知”只在这里实现一次。
 * 页面只负责渲染 LevelUpOverlay 与按钮状态。
 */
export function useGrowthCheckin(options: { readOnly: Ref<boolean>; onChanged?: () => void }) {
  const { t } = useI18n();
  const { growth, preferences, doCheckin, markRead, loadDashboard } = useGrowth();
  const checking = ref(false);
  const levelUp = ref<LevelUpCelebration | null>(null);

  // 永久额度模式下，升级庆祝同时说明本级 AI 赠礼是否已到账（待复核或待到账时不报金额）。
  function celebration(snapshot: Growth): LevelUpCelebration {
    return {
      level: snapshot.level,
      name: snapshot.name,
      aiGiftTokens: snapshot.aiLevelGiftStatus === 'up_to_date' ? snapshot.aiLevelGift?.tokens || 0 : 0,
      giftPending: ['held', 'missing'].includes(snapshot.aiLevelGiftStatus || ''),
    };
  }

  function celebrate(snapshot: Growth) {
    if (preferences.value?.celebrationEnabled !== false) levelUp.value = celebration(snapshot);
    else message.success(t('growth.leveledUp', { lv: snapshot.level, name: snapshot.name }));
  }

  async function checkin() {
    if (options.readOnly.value || checking.value || growth.value?.checkedInToday) return;
    checking.value = true;
    try {
      const res = await doCheckin();
      if (res?.status !== 200 || !res.data?.ok) return; // 游客由请求拦截统一引导注册
      if (res.data.already) {
        message.info(t('growth.alreadyChecked'));
      } else {
        const points = res.data.pointsEarned || 0;
        message.success(
          points > 0
            ? t('growth.checkinSuccessPts', { n: res.data.expGained, p: points })
            : t('growth.checkinSuccess', { n: res.data.expGained }),
        );
        recordOperation({ module: '成长', operation: '每日签到成功' });
        if (res.data.leveledUp && res.data.growth) {
          celebrate(res.data.growth as Growth);
          void markRead(); // 签到当场已看到升级反馈，避免刷新后重复弹出
          recordOperation({ module: '成长', operation: '成长等级提升' });
        }
        if (res.data.milestone) {
          const milestone = res.data.milestone;
          const parts = [`+${milestone.points} ${t('growth.points')}`];
          if (milestone.storageMb) parts.push(`+${milestone.storageMb}MB`);
          if (milestone.cards) parts.push(`+${milestone.cards} ${t('growth.milestoneCardUnit')}`);
          message.success(t('growth.streakMilestoneToast', { days: milestone.days, reward: parts.join(' · ') }));
          recordOperation({ module: '成长', operation: '连签里程碑达成' });
        }
      }
      // 每日任务、签到条、日历和里程碑都读看板；签到后统一刷新（调用方可一并刷新其他读模型）。
      if (options.onChanged) options.onChanged();
      else void loadDashboard();
    } catch (error) {
      console.error('签到失败:', error);
    } finally {
      checking.value = false;
    }
  }

  /** 打开概览时提示未读升级并清除红点；每次挂载最多提示一次。 */
  let announced = false;
  function announceUnreadLevelUp() {
    if (announced || !growth.value?.hasUnreadLevelUp) return;
    announced = true;
    if (preferences.value?.celebrationEnabled !== false) levelUp.value = celebration(growth.value);
    else message.info(t('growth.leveledUp', { lv: growth.value.level, name: growth.value.name }));
    void markRead();
  }

  return { checking, levelUp, checkin, announceUnreadLevelUp };
}
