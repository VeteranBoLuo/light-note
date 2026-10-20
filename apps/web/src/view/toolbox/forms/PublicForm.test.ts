import { describe, it, expect, vi, afterEach } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import { createI18n } from 'vue-i18n';
import { collectionFormsZh } from '@/i18n/locales/collectionForms';
import PublicForm from './PublicForm.vue';
import FormRenderer from './FormRenderer.vue';
import { getMobilePageBack, handleMobilePageBack } from '@/composables/useMobileTopBar';
const navigation = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock('vue-router', () => ({
  useRoute: () => ({ params: { publicId: 'a'.repeat(48) }, fullPath: '/f/' + 'a'.repeat(48) }),
  useRouter: () => navigation,
}));
import { clearAuthNavigationIntent, resolveAuthNavigationIntent } from '@/utils/authNavigationIntent';
const definition = {
  title: '测试反馈',
  description: '',
  successMessage: '已收到',
  questions: [{ id: 'q', title: '意见', type: 'short', required: true, options: [] }],
};
const cleanup: (() => void)[] = [];
function mount(component: any, props = {}) {
  const host = document.createElement('div');
  document.body.append(host);
  const app = createApp({ render: () => h(component, props) });
  app.use(
    createI18n({
      legacy: false,
      locale: 'zh-CN',
      messages: { 'zh-CN': { collectionForms: collectionFormsZh, common: {} } },
    }),
  );
  app.mount(host);
  cleanup.push(() => {
    app.unmount();
    host.remove();
  });
  return host;
}
const flush = async () => {
  await new Promise((r) => setTimeout(r, 0));
  await nextTick();
};
async function fill(host: HTMLElement, text: string) {
  const input = host.querySelector('input')!;
  input.value = text;
  input.dispatchEvent(new Event('input', { bubbles: true }));
  await nextTick();
}
async function submit(host: HTMLElement) {
  host.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  await flush();
}
function button(host: HTMLElement, label: string) {
  const result = Array.from(host.querySelectorAll('button')).find((item) => item.textContent?.trim() === label);
  expect(result, `Button: ${label}`).toBeTruthy();
  return result!;
}
afterEach(() => {
  cleanup.splice(0).forEach((fn) => fn());
  expect(getMobilePageBack('publicCollectionForm')).toBeNull();
  vi.unstubAllGlobals();
  sessionStorage.clear();
  clearAuthNavigationIntent();
  navigation.push.mockClear();
});

it('未登录只能看到参与提示，点击后使用现有安全回跳返回原表单', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({
      ok: true,
      json: async () => ({
        data: {
          status: 'collecting',
          definition: { ...definition, membersOnly: true },
          submissionPolicy: 'replace',
          mySubmission: null,
          requiresLogin: true,
          account: null,
          reward: { points: 20, received: false, remaining: 10 },
        },
      }),
    })),
  );
  const host = mount(PublicForm);
  await flush();
  expect(host.querySelector('form')).toBeNull();
  expect(host.textContent).toContain('首次成功提交可得 20 积分');
  expect(host.textContent).toContain('回答将关联');
  expect(button(host, collectionFormsZh.returnToLightNote).disabled).toBe(false);
  expect(getMobilePageBack('publicCollectionForm')).not.toBeNull();
  button(host, collectionFormsZh.loginToParticipate).click();
  expect(navigation.push).toHaveBeenCalledWith('/login');
  expect(resolveAuthNavigationIntent()).toBe('/f/' + 'a'.repeat(48));
});

it('必填项提交携带当前账号，按服务端到账结果显示奖励', async () => {
  const calls: any[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url, options) => {
      calls.push(options);
      return {
        ok: true,
        json: async () => ({
          data:
            options.method === 'GET'
              ? {
                  status: 'collecting',
                  definition: { ...definition, membersOnly: true },
                  submissionPolicy: 'replace',
                  mySubmission: null,
                  requiresLogin: false,
                  account: { id: 'member', alias: '小轻' },
                  reward: { points: 20, received: false, remaining: 10 },
                }
              : { receipt: 'r', outcome: 'created', reward: { points: 20, received: true } },
        }),
      };
    }),
  );
  const host = mount(PublicForm);
  await flush();
  expect(host.textContent).toContain('当前填写账号：小轻');
  await submit(host);
  expect(calls.filter((c) => c.method === 'POST')).toHaveLength(0);
  await fill(host, '朋友推荐');
  await submit(host);
  expect(JSON.parse(calls.at(-1).body)).toMatchObject({ expectedAccountId: 'member', answers: { q: '朋友推荐' } });
  expect(host.textContent).toContain('20 积分已到账');
  expect(host.textContent).toContain('每个账号仅奖励一次');
  button(host, collectionFormsZh.viewRewardNotification).click();
  expect(navigation.push).toHaveBeenLastCalledWith({ name: 'notifications' });
  button(host.querySelector<HTMLElement>('.success-next')!, collectionFormsZh.returnToLightNote).click();
  expect(navigation.push).toHaveBeenLastCalledWith({ name: 'workbenches' });
});

it('会话失效后暂存最新输入，登录返回只恢复同一账号的草稿', async () => {
  const fetcher = vi.fn(async (_url, options) =>
    options.method === 'GET'
      ? {
          ok: true,
          json: async () => ({
            data: {
              status: 'collecting',
              definition: { ...definition, membersOnly: true },
              submissionPolicy: 'replace',
              mySubmission: null,
              requiresLogin: false,
              account: { id: 'member', alias: '小轻' },
            },
          }),
        }
      : { ok: false, status: 401, json: async () => ({ msg: '请重新登录', data: {} }) },
  );
  vi.stubGlobal('fetch', fetcher);
  const host = mount(PublicForm);
  await flush();
  await fill(host, '首次输入');
  await submit(host);
  await fill(host, '登录前最新输入');
  Array.from(host.querySelectorAll('button'))
    .find((b) => b.textContent?.includes('重新登录'))!
    .click();
  cleanup.pop()!();
  const restored = mount(PublicForm);
  await flush();
  expect(restored.querySelector('input')!.value).toBe('登录前最新输入');
  const key = 'collection-login-draft:' + 'a'.repeat(48);
  sessionStorage.setItem(
    key,
    JSON.stringify({ accountId: 'another', at: Date.now(), answers: { q: '其他账号的答案' } }),
  );
  cleanup.pop()!();
  const isolated = mount(PublicForm);
  await flush();
  expect(isolated.querySelector('input')!.value).toBe('');
  expect(sessionStorage.getItem(key)).toBeNull();
});

it('账号切换清除旧账号答案并提供重新加载；名额用尽显示暂停', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url, options) =>
      options.method === 'GET'
        ? {
            ok: true,
            json: async () => ({
              data: {
                status: 'collecting',
                definition: { ...definition, membersOnly: true },
                submissionPolicy: 'replace',
                mySubmission: null,
                requiresLogin: false,
                account: { id: 'member', alias: '小轻' },
              },
            }),
          }
        : { ok: false, status: 409, json: async () => ({ msg: '当前登录账号已变化', data: { field: 'account' } }) },
    ),
  );
  const host = mount(PublicForm);
  await flush();
  await fill(host, '保留的答案');
  await submit(host);
  expect(host.querySelector('input')).toBeNull();
  expect(host.textContent).toContain('重新加载');
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({
      ok: true,
      json: async () => ({
        data: {
          status: 'paused',
          definition,
          submissionPolicy: 'replace',
          mySubmission: null,
          reward: { points: 20, received: false, remaining: 0 },
        },
      }),
    })),
  );
  const paused = mount(PublicForm);
  await flush();
  expect(paused.textContent).toContain('奖励名额已用尽');
});
describe('独立填写页', () => {
  it('失败保留输入和幂等键；再次填写产生新请求键', async () => {
    let fail = true;
    const calls: any[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, options: any) => {
        calls.push(options);
        if (options.method === 'GET')
          return {
            ok: true,
            json: async () => ({
              data: { status: 'collecting', definition, submissionPolicy: 'multiple', mySubmission: null },
            }),
          };
        if (fail) {
          fail = false;
          throw new Error('network');
        }
        return { ok: true, json: async () => ({ data: { receipt: 'r' } }) };
      }),
    );
    const host = mount(PublicForm);
    await flush();
    await fill(host, '请改善体验');
    await submit(host);
    expect(host.querySelector('input')!.value).toBe('请改善体验');
    await submit(host);
    expect(host.textContent).toContain('提交成功');
    const posts = () => calls.filter((c) => c.method === 'POST').map((c) => JSON.parse(c.body));
    expect(posts()[0].requestKey).toBe(posts()[1].requestKey);
    expect(calls.every((c) => c.credentials === 'same-origin')).toBe(true);
    expect(host.textContent).toContain(collectionFormsZh.savedCloseHint);
    expect(host.textContent).not.toContain(collectionFormsZh.returnToLightNote);
    expect(host.textContent).not.toContain(collectionFormsZh.viewRewardNotification);
    expect(getMobilePageBack('publicCollectionForm')).toBeNull();
    button(host, collectionFormsZh.again).click();
    await flush();
    await fill(host, '第二次');
    await submit(host);
    expect(posts()[2].requestKey).not.toBe(posts()[0].requestKey);
  });
  it('必填校验阻止提交，暂停只展示状态', async () => {
    const onSubmit = vi.fn();
    const host = mount(FormRenderer, { definition, onSubmit });
    await submit(host);
    expect(onSubmit).not.toHaveBeenCalled();
    expect(host.textContent).toContain('请填写此题');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          data: { status: 'paused', definition, submissionPolicy: 'multiple', mySubmission: null },
        }),
      })),
    );
    const paused = mount(PublicForm);
    await flush();
    expect(paused.querySelector('form')).toBeNull();
    expect(paused.textContent).toContain('暂停');
  });
});

it('匿名回填最新答案，更新成功并保留修改入口', async () => {
  const calls: any[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url, options) => {
      calls.push(options);
      return {
        ok: true,
        json: async () => ({
          data:
            options.method === 'GET'
              ? {
                  status: 'collecting',
                  definition,
                  submissionPolicy: 'replace',
                  mySubmission: { receipt: 'r', answers: { q: '旧答案' } },
                }
              : { receipt: 'r', outcome: 'updated' },
        }),
      };
    }),
  );
  const host = mount(PublicForm);
  await flush();
  expect(host.querySelector('input')!.value).toBe('旧答案');
  expect(host.textContent).toContain('更新提交');
  await fill(host, '新答案');
  await submit(host);
  expect(host.textContent).toContain('提交已更新');
  expect(host.textContent).toContain('修改我的提交');
  expect(host.textContent).toContain(collectionFormsZh.savedCloseHint);
  expect(host.textContent).not.toContain(collectionFormsZh.returnToLightNote);
  expect(JSON.parse(calls[1].body).answers.q).toBe('新答案');
});

it('旧后端缺少协议时禁止填写，避免将修改错误计为新增', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ ok: true, json: async () => ({ data: { status: 'collecting', definition } }) })),
  );
  const host = mount(PublicForm);
  await flush();
  expect(host.querySelector('form')).toBeNull();
  expect(host.textContent).toContain('请更新后端');
});

it('修改入口重新读取最新答案；凭证丢失时阻止退化成新增', async () => {
  let answers = { q: '旧答案' },
    lost = false;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url, options) => ({
      ok: true,
      json: async () => {
        if (options.method === 'POST') {
          answers = JSON.parse(options.body).answers;
          return { data: { receipt: 'r', outcome: 'updated' } };
        }
        return {
          data: {
            status: 'collecting',
            definition,
            submissionPolicy: 'replace',
            mySubmission: lost ? null : { receipt: 'r', answers },
          },
        };
      },
    })),
  );
  const host = mount(PublicForm);
  await flush();
  await fill(host, '最新答案');
  await submit(host);
  button(host, collectionFormsZh.editSubmission).click();
  await flush();
  expect(host.querySelector('input')!.value).toBe('最新答案');
  await submit(host);
  lost = true;
  button(host, collectionFormsZh.editSubmission).click();
  await flush();
  expect(host.querySelector('form')).toBeNull();
  expect(host.textContent).toContain('未能识别之前的提交');
});

it.each(['collecting', 'paused', 'ended'])('仅轻笺用户填写的表单在 %s 状态可返回当前站点工作台', async (state) => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({
      ok: true,
      json: async () => ({
        data: {
          status: state,
          definition: { ...definition, membersOnly: true },
          submissionPolicy: 'replace',
          mySubmission: null,
          requiresLogin: false,
          account: { id: 'member', alias: '小轻' },
        },
      }),
    })),
  );
  const host = mount(PublicForm);
  await flush();
  button(host, collectionFormsZh.returnToLightNote).click();
  expect(navigation.push).toHaveBeenCalledExactlyOnceWith({ name: 'workbenches' });
});

it.each(['collecting', 'paused', 'ended', 'error', 'loading'])(
  '普通或尚未识别的表单在 %s 状态不引导进入轻笺，也不接管系统返回',
  async (state) => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        if (state === 'loading') return await new Promise(() => {});
        if (state === 'error') throw new Error('network');
        return {
          ok: true,
          json: async () => ({
            data: {
              status: state,
              definition,
              submissionPolicy: 'replace',
              mySubmission: null,
              account: { id: 'root', alias: '已登录用户' },
            },
          }),
        };
      }),
    );
    const host = mount(PublicForm);
    await flush();
    expect(host.textContent).not.toContain(collectionFormsZh.returnToLightNote);
    const back = new Event('light-note-system-back', { cancelable: true });
    expect(handleMobilePageBack('publicCollectionForm', back)).toBe(false);
    expect(back.defaultPrevented).toBe(false);
    expect(navigation.push).not.toHaveBeenCalled();
  },
);

it.each([null, { points: 20, received: false }])(
  '账号限定表单未确认到账时只提供返回，不显示到账通知入口（%j）',
  async (reward) => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url, options) => ({
        ok: true,
        json: async () => ({
          data:
            options.method === 'GET'
              ? {
                  status: 'collecting',
                  definition: { ...definition, membersOnly: true },
                  submissionPolicy: 'replace',
                  mySubmission: null,
                  requiresLogin: false,
                  account: { id: 'member', alias: '小轻' },
                }
              : { receipt: 'r', outcome: 'created', reward },
        }),
      })),
    );
    const host = mount(PublicForm);
    await flush();
    await fill(host, '朋友推荐');
    await submit(host);
    expect(host.textContent).toContain(collectionFormsZh.savedReturnHint);
    expect(host.textContent).not.toContain(collectionFormsZh.viewRewardNotification);
    button(host.querySelector<HTMLElement>('.success-next')!, collectionFormsZh.returnToLightNote).click();
    expect(navigation.push).toHaveBeenCalledExactlyOnceWith({ name: 'workbenches' });
  },
);

it('提交中禁用返回且消费系统返回，完成后系统返回复用工作台入口', async () => {
  let finishSubmission!: (response: unknown) => void;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url, options) =>
      options.method === 'POST'
        ? new Promise((resolve) => {
            finishSubmission = resolve;
          })
        : {
            ok: true,
            json: async () => ({
              data: {
                status: 'collecting',
                definition: { ...definition, membersOnly: true },
                submissionPolicy: 'replace',
                mySubmission: null,
                requiresLogin: false,
                account: { id: 'member', alias: '小轻' },
              },
            }),
          },
    ),
  );
  const host = mount(PublicForm);
  await flush();
  await fill(host, '测试返回');
  await submit(host);
  expect(button(host, collectionFormsZh.returnToLightNote).disabled).toBe(true);
  const busyBack = new Event('light-note-system-back', { cancelable: true });
  expect(handleMobilePageBack('publicCollectionForm', busyBack)).toBe(true);
  expect(busyBack.defaultPrevented).toBe(true);
  expect(navigation.push).not.toHaveBeenCalled();
  finishSubmission({ ok: true, json: async () => ({ data: { receipt: 'r', outcome: 'created' } }) });
  await flush();
  expect(host.textContent).toContain('提交成功');
  const readyBack = new Event('light-note-system-back', { cancelable: true });
  expect(handleMobilePageBack('publicCollectionForm', readyBack)).toBe(true);
  expect(navigation.push).toHaveBeenCalledExactlyOnceWith({ name: 'workbenches' });
});
