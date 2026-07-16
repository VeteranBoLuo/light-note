import { beforeEach, describe, expect, it, vi } from 'vitest';

const recordOperation = vi.fn();
vi.mock('@/api/commonApi.ts', () => ({ recordOperation }));

const { default: registerGlobalDirectives } = await import('./globalDirect.ts');

describe('v-click-log', () => {
  let clickLogDirective: any;

  beforeEach(() => {
    recordOperation.mockReset();
    const directives: Record<string, any> = {};
    registerGlobalDirectives({
      directive(name: string, definition: any) {
        directives[name] = definition;
      },
    } as any);
    clickLogDirective = directives['click-log'];
  });

  it('使用标准 click 事件记录，覆盖触摸与键盘触发路径', () => {
    const el = document.createElement('button') as any;
    const value = { module: '书签管理', operation: '打开死链体检' };

    clickLogDirective.mounted(el, { value });
    el.click();

    expect(recordOperation).toHaveBeenCalledOnce();
    expect(recordOperation).toHaveBeenCalledWith(value);
  });

  it('更新绑定值并在卸载时移除监听', () => {
    const el = document.createElement('button') as any;
    const first = { module: '通知中心', operation: '打开通知铃铛' };
    const next = { module: '通知中心', operation: '查看通知' };

    clickLogDirective.mounted(el, { value: first });
    clickLogDirective.updated(el, { value: next });
    el.click();
    clickLogDirective.unmounted(el);
    el.click();

    expect(recordOperation).toHaveBeenCalledOnce();
    expect(recordOperation).toHaveBeenCalledWith(next);
  });
});
