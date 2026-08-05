import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp, nextTick } from 'vue';

/**
 * 「进入示例」和「打开注册」是并行入口，不是上下游：不少访客直接点注册、从没进过示例。
 * 此前页面把两者串成一条链、用 signup_open ÷ demo_enter 当「上一步转化」，
 * 真实数据上算出 266.7% 这种不可能的转化率。
 *
 * 这里用线上真实量级（访问 580 / 进入示例 72 / 打开注册 192，其中只有 18 人看过示例）
 * 锁住三件事：两条路径并列陈列、示例这条路径的分子是「看过示例后又打开注册的人」、
 * 汇聚点标出两路构成。
 */
const apiBasePost = vi.fn();

vi.mock('@/http/request.ts', () => ({ apiBasePost }));
vi.mock('@/http/request', () => ({ apiBasePost }));

// 外壳与表格不参与本测试的口径行为，换成透传容器让主体内容直接渲染。
// toolbar 插槽必须一起透传：日期选择器挂在那里，它的 mounted 才是首次加载的触发点。
vi.mock('@/components/admin/AdminDataPage.vue', () => ({
  default: {
    name: 'AdminDataPageStub',
    template: '<div class="page-stub"><slot name="toolbar" /><slot /></div>',
  },
}));
vi.mock('@/components/base/BasicComponents/BTable/BTable.vue', () => ({
  default: { name: 'BTableStub', template: '<div class="table-stub" />' },
}));
// 首次加载由日期选择器 onMounted 时 emit('change') 驱动，stub 必须保留这个行为，否则页面拿不到数据
vi.mock('./DateRangePicker.vue', () => ({
  default: {
    name: 'DateRangePickerStub',
    emits: ['change'],
    template: '<div class="drp-stub" />',
    mounted() {
      (this as unknown as { $emit: (e: string, ...a: unknown[]) => void }).$emit(
        'change',
        '2026-07-01',
        '2026-07-31',
      );
    },
  },
}));

const { default: ConversionFunnel } = await import('./ConversionFunnel.vue');

/** 探针取到的真实分布：192 个打开注册里只有 18 人看过示例，示例并不在主路径上。 */
const REAL_DATA = {
  pageViewVisitors: 580,
  demoEnterVisitors: 72,
  wallHitVisitors: 66,
  signupOpenVisitors: 192,
  signupSubmitVisitors: 140,
  registerVisitors: 115,
  demoThenSignupOpenVisitors: 18,
  directSignupOpenVisitors: 174,
  demoThenRegisterVisitors: 18,
  directRegisterVisitors: 97,
  wallThenSignupOpenVisitors: 28,
  hotspots: [],
  trend: [],
};

let cleanup: (() => void) | undefined;

async function mountFunnel(data: Record<string, unknown> = REAL_DATA) {
  apiBasePost.mockResolvedValue({ status: 200, data });
  const host = document.createElement('div');
  document.body.append(host);
  const app = createApp(ConversionFunnel);
  app.mount(host);
  await nextTick();
  await Promise.resolve();
  await nextTick();
  cleanup = () => {
    app.unmount();
    host.remove();
  };
  return host;
}

afterEach(() => {
  cleanup?.();
  cleanup = undefined;
  apiBasePost.mockReset();
});

describe('ConversionFunnel 并行入口口径', () => {
  it('访问后的两条路径并列陈列，各自只给「占访问」比例', async () => {
    const host = await mountFunnel();
    const branches = [...host.querySelectorAll('.funnel-parallel__item')];

    expect(branches).toHaveLength(2);
    expect(branches[0].textContent).toContain('进入示例');
    expect(branches[0].textContent).toContain('72');
    expect(branches[0].textContent).toContain('占访问 12.4%'); // 72 / 580
    expect(branches[1].textContent).toContain('直接打开注册');
    expect(branches[1].textContent).toContain('174');
    expect(branches[1].textContent).toContain('占访问 30%'); // 174 / 580

    // 并列关系不能带「上一步」——那会读成一条不存在的时序链
    for (const branch of branches) {
      expect(branch.textContent).not.toContain('上一步');
    }
  });

  it('示例这条路径的转化率分子只算看过示例后又打开注册的人', async () => {
    const host = await mountFunnel();
    const demoBranch = host.querySelector('.funnel-parallel__item');

    // 18 / 72 = 25%；若误用 signupOpen(192) 作分子会得到 266.7%
    expect(demoBranch?.textContent).toContain('18 人之后打开注册');
    expect(demoBranch?.textContent).toContain('25%');
    expect(demoBranch?.textContent).not.toContain('266.7');
  });

  it('汇聚点标出两路构成，其后才按时序算上一步转化', async () => {
    const host = await mountFunnel();
    const steps = [...host.querySelectorAll('.funnel-chain__step')];

    expect(steps).toHaveLength(3);
    expect(steps[0].textContent).toContain('打开注册');
    expect(steps[0].textContent).toContain('示例路径 18 + 直接 174'); // 相加等于 192，可验算
    expect(steps[0].textContent).not.toContain('上一步'); // 汇聚点没有单一上游
    expect(steps[1].textContent).toContain('上一步 72.9%'); // 140 / 192
    expect(steps[2].textContent).toContain('上一步 82.1%'); // 115 / 140
  });

  it('整体转化后面附上注册成功的路径构成', async () => {
    const host = await mountFunnel();
    const summary = host.querySelector('.funnel-chain__summary');

    expect(summary?.textContent).toContain('19.8%'); // 115 / 580
    expect(summary?.textContent).toContain('看过示例 18 人');
    expect(summary?.textContent).toContain('未看示例 97 人');
  });

  it('撞墙分支的转化率用撞墙后打开注册的人，不用 signup_open 总数', async () => {
    const host = await mountFunnel();
    const wallCard = [...host.querySelectorAll('.admin-stat-card')].find((el) =>
      el.textContent?.includes('撞墙访客'),
    );

    // 28 / 66 = 42.4%；旧口径 192 / 66 会得到 290.9%
    expect(wallCard?.textContent).toContain('撞墙后打开注册 28 人');
    expect(wallCard?.textContent).toContain('42.4%');
    expect(wallCard?.textContent).not.toContain('290.9');
  });

  it('后端未返回路径字段时按 0 渲染，不出现 NaN', async () => {
    const host = await mountFunnel({ pageViewVisitors: 10, signupOpenVisitors: 4, hotspots: [], trend: [] });

    expect(host.textContent).not.toContain('NaN');
    const branches = [...host.querySelectorAll('.funnel-parallel__item')];
    expect(branches[1].textContent).toContain('0');
  });
});
