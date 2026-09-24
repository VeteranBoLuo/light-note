import { describe, it, expect, vi, afterEach } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import { createI18n } from 'vue-i18n';
import { collectionFormsZh } from '@/i18n/locales/collectionForms';
import PublicForm from './PublicForm.vue';
import FormRenderer from './FormRenderer.vue';
vi.mock('vue-router', () => ({ useRoute: () => ({ params: { publicId: 'a'.repeat(48) } }) }));
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
afterEach(() => {
  cleanup.splice(0).forEach((fn) => fn());
  vi.unstubAllGlobals();
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
    host.querySelector('button')!.click();
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
  host.querySelector('button')!.click();
  await flush();
  expect(host.querySelector('input')!.value).toBe('最新答案');
  await submit(host);
  lost = true;
  host.querySelector('button')!.click();
  await flush();
  expect(host.querySelector('form')).toBeNull();
  expect(host.textContent).toContain('未能识别之前的提交');
});
