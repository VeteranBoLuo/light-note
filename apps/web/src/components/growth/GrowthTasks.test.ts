import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp, h, nextTick, reactive, ref } from 'vue';
import { createI18n } from 'vue-i18n';
import { createMemoryHistory, createRouter } from 'vue-router';
import type { GrowthTask, GrowthTasksData } from '@/composables/useGrowth';
import GrowthTasks from './GrowthTasks.vue';

const mocks = vi.hoisted(() => ({ claim: vi.fn(), openCapture: vi.fn(), visible: false, mobile: false }));
vi.mock('@/composables/useGrowth.ts', () => ({
  useGrowth: () => ({ claimGrowthTask: mocks.claim, claimingRewards: ref(false) }),
}));
vi.mock('@/store', () => ({ bookmarkStore: () => ({ isMobile: mocks.mobile }) }));
vi.mock('@/store/inbox', () => ({
  default: () => ({
    get quickCaptureVisible() {
      return mocks.visible;
    },
    openQuickCapture: mocks.openCapture,
  }),
}));
vi.mock('@/api/commonApi.ts', () => ({ recordOperation: vi.fn() }));
vi.mock('@/components/base/BasicComponents/BMessage/BMessage.ts', () => ({
  default: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));
vi.mock('@/components/base/SvgIcon/src/SvgIcon.vue', () => ({ default: { template: '<span />' } }));

let cleanup: (() => void) | undefined;
afterEach(() => {
  cleanup?.();
  cleanup = undefined;
  mocks.visible = false;
  mocks.mobile = false;
  vi.clearAllMocks();
});

const keys = ['profile_avatar', 'first_note', 'first_bookmark', 'first_todo', 'first_file', 'first_organize'];
function tasksData(overrides: Record<string, Partial<GrowthTask>> = {}): GrowthTasksData {
  const allTasks = keys.map((taskKey) => ({
    taskKey,
    titleKey: taskKey,
    descriptionKey: '',
    rewardExp: 30,
    status: 'pending',
    completed: false,
    claimed: false,
    claimable: false,
    completedAt: null,
    claimedAt: null,
    ...overrides[taskKey],
  }));
  return {
    allTasks,
    tasks: allTasks.filter((task) => !task.claimed).slice(0, 3),
    totalCount: 6,
    completedCount: 0,
    claimedCount: 0,
    claimableCount: 0,
    remainingCount: 6,
    activeCount: 6,
  };
}

async function mount(
  data: GrowthTasksData | null = tasksData(),
  options: { compact?: boolean; readOnly?: boolean; maxVisible?: number } = {},
) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/:pathMatch(.*)*', component: { render: () => null } }],
  });
  await router.push('/growth?section=tasks#growth-tasks');
  const props = reactive({ data, compact: true, maxVisible: 2, ...options });
  const host = document.createElement('div');
  document.body.append(host);
  const app = createApp({ render: () => h(GrowthTasks, props) });
  app.use(router).use(
    createI18n({
      legacy: false,
      locale: 'zh-CN',
      missingWarn: false,
      fallbackWarn: false,
      messages: {
        'zh-CN': { growth: { tasksAddBookmark: '添加书签', tasksCreateNote: '新建笔记', tasksUploadFile: '上传文件' } },
      },
    }),
  );
  app.directive('click-log', {});
  app.mount(host);
  cleanup = () => {
    app.unmount();
    host.remove();
  };
  return {
    host,
    router,
    props,
    titles: () => [...host.querySelectorAll('.growth-task__body strong')].map((node) => node.textContent),
    click: (key: string) => {
      const row = [...host.querySelectorAll('.growth-task')].find(
        (node) => node.querySelector('.growth-task__body strong')?.textContent === key,
      );
      row?.querySelector<HTMLButtonElement>('button')?.click();
    },
  };
}

describe('新手任务展示与创建入口', () => {
  it('首页从完整任务中优先展示首次收藏和笔记，输入数据不被排序修改', async () => {
    const data = tasksData();
    const view = await mount(data);
    expect(view.titles()).toEqual(['first_bookmark', 'first_note']);
    expect(data.tasks.map((task) => task.taskKey)).toEqual(keys.slice(0, 3));
    expect(data.allTasks!.map((task) => task.taskKey)).toEqual(keys);
  });

  it.each([{ compact: false }, { readOnly: true }])('完整任务页与只读预览保持原有顺序 %o', async (options) => {
    const view = await mount(tasksData(), options);
    expect(view.titles()).toEqual(['profile_avatar', 'first_note']);
    if ('readOnly' in options) expect(view.host.querySelector('.growth-task__go')).toBeNull();
  });

  it('已有任一首次保存完成后保持既有顺序，不把老用户重新视为新用户', async () => {
    const view = await mount(tasksData({ first_file: { completed: true, claimed: true } }));
    expect(view.titles()).toEqual(['profile_avatar', 'first_note']);
  });

  it('待领奖任务仍优先可领，不被首次保存任务挤出', async () => {
    const view = await mount(tasksData({ profile_avatar: { completed: true, claimable: true } }));
    expect(view.titles()).toEqual(['profile_avatar', 'first_bookmark']);
    expect(view.host.querySelector('.growth-task__claim')).not.toBeNull();
  });

  it('未加载和缺少完整首次保存状态时不猜测，收到完整数据后才调整展示', async () => {
    const view = await mount(null);
    expect(view.titles()).toEqual([]);
    const incomplete = tasksData();
    delete incomplete.allTasks;
    view.props.data = incomplete;
    await nextTick();
    expect(view.titles()).toEqual(['profile_avatar', 'first_note']);
    view.props.data = tasksData();
    await nextTick();
    expect(view.titles()).toEqual(['first_bookmark', 'first_note']);
  });

  it('首次收藏直达原有完整新增表单，不使用快速收集替代智能识别表单', async () => {
    const view = await mount();
    view.click('first_bookmark');
    await vi.waitFor(() => expect(view.router.currentRoute.value.path).toBe('/manage/editBookmark/add'));
    expect(mocks.openCapture).not.toHaveBeenCalled();
    expect(mocks.claim).not.toHaveBeenCalled();
    view.router.back();
    await vi.waitFor(() => expect(view.router.currentRoute.value.fullPath).toBe('/growth?section=tasks#growth-tasks'));
  });

  it('首次上传打开文件页签，不覆盖已经打开的草稿', async () => {
    const data = tasksData();
    data.tasks = [data.allTasks!.find((task) => task.taskKey === 'first_file')!];
    const view = await mount(data, { compact: false });
    view.click('first_file');
    expect(mocks.openCapture).toHaveBeenCalledExactlyOnceWith('file');
    mocks.visible = true;
    view.click('first_file');
    expect(mocks.openCapture).toHaveBeenCalledTimes(1);
  });

  it('新建笔记传递一次性入口和完整返回来源', async () => {
    const view = await mount();
    view.click('first_note');
    await vi.waitFor(() => expect(view.router.currentRoute.value.path).toBe('/noteLibrary'));
    expect(view.router.currentRoute.value.query).toEqual({
      create: 'growth-task',
      from: '/growth?section=tasks#growth-tasks',
    });
    expect(mocks.openCapture).not.toHaveBeenCalled();
  });
});
