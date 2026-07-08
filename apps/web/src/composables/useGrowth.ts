import { ref } from 'vue';
import growthApi from '@/api/growthApi.ts';

export interface Growth {
  exp: number;
  level: number;
  name: string;
  spaceMb: number;
  aiTokenDaily: number;
  streak: number;
  checkedInToday: boolean;
  levelStartExp: number;
  nextLevelExp: number | null;
  expToNext: number;
  progress: number;
  isMax: boolean;
}

// 模块级单例:头像徽章与设置页成长卡共享同一份数据,一次拉取多处复用(不为此建重 store)
const growth = ref<Growth | null>(null);
const loading = ref(false);
let loadedOnce = false;

export function useGrowth() {
  async function load(force = false) {
    if (loadedOnce && !force) return growth.value;
    loading.value = true;
    try {
      const res = await growthApi.getMyGrowth();
      if (res?.status === 200 && res.data) {
        growth.value = res.data as Growth;
        loadedOnce = true;
      }
    } catch (err) {
      console.warn('加载成长信息失败:', err);
    } finally {
      loading.value = false;
    }
    return growth.value;
  }

  // 返回签到结果(含 already / expGained / leveledUp);成功则就地刷新共享 growth
  async function doCheckin() {
    const res = await growthApi.checkin();
    if (res?.status === 200 && res.data?.growth) {
      growth.value = res.data.growth as Growth;
      loadedOnce = true;
    }
    return res;
  }

  return { growth, loading, load, doCheckin };
}
