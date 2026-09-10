import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp, h, nextTick, ref } from 'vue';
import { createI18n } from 'vue-i18n';
import { noteExportSettingsZh } from '@/i18n/locales/noteExportSettings';
import { createNoteExportSettings, noteExportFormat } from '@/utils/noteBatchExport';
vi.mock('@/components/base/BasicComponents/BSelect.vue', () => ({
  default: {
    props: ['value', 'options', 'disabled'],
    emits: ['update:value'],
    template:
      '<select :disabled="disabled" :value="value" @change="$emit(\'update:value\', $event.target.value)"><option v-for="o in options" :value="o.value">{{o.label}}</option></select>',
  },
}));
vi.mock('@/components/base/BasicComponents/BModal/BModal.vue', () => ({
  default: {
    props: ['visible'],
    template: '<section v-if="visible"><slot/><slot name="footer"/></section>',
  },
}));
const { default: Dialog } = await import('./NoteBatchExportDialog.vue');
const notes = [
  { id: 'a', title: '甲', type: 'html' },
  { id: 'b', title: '乙', type: 'markdown' },
];
let cleanup: () => void;
afterEach(() => cleanup?.());
function mount(items = notes) {
  const settings = ref(createNoteExportSettings(items));
  const busy = ref(false);
  const exported = vi.fn();
  const host = document.createElement('div');
  document.body.append(host);
  const app = createApp({
    setup: () => () =>
      h(Dialog, {
        visible: true,
        notes: items,
        settings: settings.value,
        'onUpdate:settings': (value) => (settings.value = value),
        busy: busy.value,
        error: '',
        completed: 0,
        onExport: exported,
      }),
  });
  app.use(
    createI18n({
      legacy: false,
      locale: 'zh',
      messages: { zh: { noteExportSettings: noteExportSettingsZh, note: { batchExportTitle: '批量导出笔记' } } },
    }),
  );
  app.directive('auto-scrollbar', {});
  app.mount(host);
  cleanup = () => {
    app.unmount();
    host.remove();
  };
  const click = async (text: string) => {
    const button = [...host.querySelectorAll<HTMLElement>('button, [role=tab]')].find((b) =>
      (b.getAttribute('aria-label') || b.textContent?.trim() || '').startsWith(text),
    );
    expect(button).toBeTruthy();
    button!.click();
    await nextTick();
  };
  return { host, settings, busy, exported, click };
}
describe('export configuration', () => {
  it('starts with the majority format and preserves a manual override across method changes', async () => {
    const { click, host, settings } = mount(notes.map((note) => ({ ...note, type: 'markdown' })));
    await click('合并为一个文件');
    expect(noteExportFormat(settings.value)).toBe('markdown');
    const select = host.querySelector('select')!;
    select.value = 'pdf';
    select.dispatchEvent(new Event('change'));
    await nextTick();
    await click('分别导出');
    await click('合并为一个文件');
    expect(noteExportFormat(settings.value)).toBe('pdf');
  });
  it('only exports after confirmation and remembers format drafts per method', async () => {
    const { host, click, settings, exported } = mount();
    expect(noteExportFormat(settings.value)).toBe('original');
    await click('合并为一个文件');
    expect(noteExportFormat(settings.value)).toBe('html');
    expect([...host.querySelectorAll('option')].map((n) => n.value)).not.toContain('original');
    const select = host.querySelector('select')!;
    select.value = 'markdown';
    select.dispatchEvent(new Event('change'));
    await nextTick();
    await click('分别导出');
    expect(noteExportFormat(settings.value)).toBe('original');
    await click('合并为一个文件');
    expect(noteExportFormat(settings.value)).toBe('markdown');
    expect(exported).not.toHaveBeenCalled();
    await click('导出');
    expect(exported).toHaveBeenCalledOnce();
  });
  it('keeps title drafts across modes and locks them while exporting', async () => {
    const { click, host, settings, busy } = mount();
    expect(host.querySelector('.export-name-field')).toBeNull();
    await click('合并为一个文件');
    const input = host.querySelector<HTMLInputElement>('.export-name-field input')!;
    input.value = '九月学习记录';
    input.dispatchEvent(new Event('input'));
    await nextTick();
    const checks = host.querySelectorAll<HTMLElement>('.export-title-options [role=checkbox]');
    checks[0].click();
    await nextTick();
    checks[1].click();
    await nextTick();
    expect(settings.value).toMatchObject({
      exportName: '九月学习记录',
      showDocumentTitle: true,
      keepNoteTitles: false,
    });
    await click('分别导出');
    await click('合并为一个文件');
    expect(host.querySelector<HTMLInputElement>('.export-name-field input')!.value).toBe('九月学习记录');
    busy.value = true;
    await nextTick();
    expect(host.querySelector<HTMLInputElement>('.export-name-field input')!.disabled).toBe(true);
    host.querySelector<HTMLElement>('.export-title-options [role=checkbox]')!.click();
    await nextTick();
    expect(settings.value.showDocumentTitle).toBe(true);
  });
  it('moves and restores items without changing the original list; busy disables editing', async () => {
    const { click, host, settings, busy } = mount();
    await click('合并为一个文件');
    await click('下移');
    expect(settings.value.orderedIds).toEqual(['b', 'a']);
    expect([...host.querySelectorAll('.export-note strong')].map((n) => n.textContent)).toEqual(['乙', '甲']);
    await click('恢复默认');
    expect(settings.value.orderedIds).toEqual(['a', 'b']);
    await click('反转顺序');
    expect(settings.value.orderedIds).toEqual(['b', 'a']);
    expect(notes.map((n) => n.id)).toEqual(['a', 'b']);
    busy.value = true;
    await nextTick();
    await click('恢复默认');
    expect(settings.value.orderedIds).toEqual(['b', 'a']);
    expect([...host.querySelectorAll('button')].every((b) => b.disabled)).toBe(true);
  });
  it('names drawings and blocks merged export without silently excluding them', async () => {
    const { click, host, exported, settings } = mount([...notes, { id: 'c', title: '草图', type: 'drawing' }]);
    await click('合并为一个文件');
    await click('导出');
    expect(host.querySelector('[role="alert"]')?.textContent).toContain('草图');
    expect(settings.value.orderedIds).toHaveLength(3);
    expect(exported).not.toHaveBeenCalled();
    await click('分别导出');
    await click('导出');
    expect(exported).toHaveBeenCalledOnce();
  });
});
