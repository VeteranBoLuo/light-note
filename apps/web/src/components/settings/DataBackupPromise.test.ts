import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import { createI18n } from 'vue-i18n';
import { dataExportZh } from '@/i18n/locales/dataExport';

vi.mock('@/components/base/SvgIcon/src/SvgIcon.vue', () => ({ default: { template: '<i />' } }));
const { default: DataBackupPromise } = await import('./DataBackupPromise.vue');

let cleanup = () => {};
afterEach(() => cleanup());

describe('data backup promises', () => {
  it('states the three commitments and opens the legal documents they rely on', async () => {
    const opened: string[] = [];
    const host = document.createElement('div');
    document.body.append(host);
    const app = createApp({
      setup: () => () => h(DataBackupPromise, { onOpenLegal: (document: string) => opened.push(document) }),
    });
    app.use(createI18n({ legacy: false, locale: 'zh', messages: { zh: { dataExport: dataExportZh } } }));
    app.mount(host);
    cleanup = () => {
      app.unmount();
      host.remove();
    };
    await nextTick();
    expect(host.textContent).toContain('内容归你');
    expect(host.textContent).toContain('随时完整带走');
    expect(host.textContent).toContain('至少提前 30 天通知');
    const button = (label: string) =>
      [...host.querySelectorAll('button')].find((b) => b.textContent?.trim() === label)!;
    button('用户协议').click();
    button('隐私政策').click();
    expect(opened).toEqual(['user-agreement.html', 'privacy-policy.html']);
  });
});
