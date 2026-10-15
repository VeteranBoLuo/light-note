import { createApp, nextTick } from 'vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import DocumentTextWorkbench from './DocumentTextWorkbench.vue';
import DatasetWorkbench from './DatasetWorkbench.vue';

const mocks = vi.hoisted(() => ({
  convert: vi.fn(),
  prepare: vi.fn(),
  download: vi.fn(),
  warning: vi.fn(),
  error: vi.fn(),
}));
vi.mock('@/utils/toolboxDocumentText', () => ({ convertDocxToMarkdown: mocks.convert, extractPdfText: vi.fn() }));
vi.mock('@/utils/toolboxDataset', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  prepareToolboxDatasetFile: mocks.prepare,
}));
vi.mock('@/utils/toolboxLocal', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  downloadToolboxBlob: mocks.download,
}));
vi.mock('vue-router', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  useRoute: () => ({ query: {} }),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));
vi.mock('vue-i18n', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  useI18n: () => ({ t: (key: string) => key }),
}));
vi.mock('@/composables/useUiDensity', () => ({ useUiDensity: () => ({ dimension: (value: number) => value }) }));
vi.mock('@/composables/useSaveAsNote', () => ({ openSaveAsNote: vi.fn() }));
vi.mock('@/utils/aiNoteDraft', () => ({ createNoteFromContent: vi.fn() }));
vi.mock('@/utils/translationHandoff', () => ({ stageTranslation: vi.fn() }));
vi.mock('@/components/community/CommunityMarkdown.vue', () => ({
  default: { props: ['body'], template: '<textarea :value="body" />' },
}));
vi.mock('@/components/base/BasicComponents/BTabs.vue', () => ({ default: { template: '<div />' } }));
vi.mock('./DocumentSummary.vue', () => ({ default: { template: '<div />' } }));
vi.mock('@/components/base/BasicComponents/BMessage/BMessage', () => ({
  default: { warning: mocks.warning, error: mocks.error },
}));
vi.mock('@/components/base/BasicComponents/BModal/Alert', () => ({ default: { alert: vi.fn() } }));
vi.mock('@/components/base/SvgIcon/src/SvgIcon.vue', () => ({ default: { template: '<span />' } }));
vi.mock('@/components/base/BasicComponents/BButton.vue', () => ({
  default: { props: ['disabled', 'loading'], template: '<button :disabled="disabled || loading"><slot /></button>' },
}));
vi.mock('@/components/base/BasicComponents/BChip.vue', () => ({ default: { template: '<span><slot /></span>' } }));
vi.mock('@/components/base/BasicComponents/BInput.vue', () => ({
  default: { props: ['value'], template: '<textarea :value="value" />' },
}));
vi.mock('@/components/base/BasicComponents/BProgress.vue', () => ({ default: { template: '<div />' } }));
vi.mock('@/components/base/BasicComponents/BLoading.vue', () => ({ default: { template: '<div />' } }));
vi.mock('@/components/base/BasicComponents/BCheckbox.vue', () => ({ default: { template: '<span><slot /></span>' } }));
vi.mock('@/components/base/BasicComponents/BTable/BTable.vue', () => ({ default: { template: '<div />' } }));
vi.mock('@/components/base/BasicComponents/BSelect.vue', () => ({
  default: {
    props: ['value', 'options'],
    template:
      '<select :value="value" @change="$emit(\'update:value\', Number($event.target.value))"><option value="">Select</option><option v-for="option in options" :value="option.value">{{ option.label }}</option></select>',
  },
}));
vi.mock('@/components/base/BasicComponents/BUpload.vue', () => ({
  default: {
    template: '<div><input type="file" @change="$emit(\'change\', Array.from($event.target.files))" /><slot /></div>',
  },
}));
vi.mock('@/components/base/BasicComponents/BModal/BModal.vue', () => ({
  default: {
    props: ['visible'],
    template: '<div v-if="visible" role="dialog"><slot /><slot name="footer" /></div>',
  },
}));

let cleanup = () => {};
const flush = async () => {
  for (let i = 0; i < 15; i++) await nextTick();
};
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    callback(0);
    return 1;
  });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
function mount(component: typeof DocumentTextWorkbench | typeof DatasetWorkbench, toolId: string) {
  const host = document.createElement('div');
  document.body.append(host);
  const app = createApp(component, { toolId });
  app.mount(host);
  cleanup = () => {
    app.unmount();
    host.remove();
  };
  return host;
}
async function selectFiles(host: HTMLElement, files: File[]) {
  const input = host.querySelector('input[type=file]')!;
  Object.defineProperty(input, 'files', { configurable: true, value: files });
  input.dispatchEvent(new Event('change', { bubbles: true }));
  await flush();
}
const file = (name: string) => new File(['fixture'], name);
const result = (name: string) => ({
  name,
  markdown: `# ${name}`,
  stats: { paragraphs: 1, headings: 1, tables: 0, links: 0, images: 0 },
});

describe('Word batch conversion', () => {
  it('keeps successful files before and after a failure and retries only failures', async () => {
    mocks.convert.mockImplementation(async (value: File) => {
      if (value.name === 'broken.docx') throw new Error('INVALID_DOCX');
      return result(value.name);
    });
    const host = mount(DocumentTextWorkbench, 'docx_to_markdown');
    await selectFiles(host, [file('one.docx'), file('broken.docx'), file('three.docx')]);
    (host.querySelector('.document-text-runbar button') as HTMLButtonElement).click();
    await flush();
    expect(host.querySelector('textarea')?.value).toBe('# one.docx');
    const rows = host.querySelectorAll('.document-text-files .document-text-file');
    expect(rows[1]?.textContent).toContain('toolbox.documentText.failed');
    (rows[2] as HTMLElement).click();
    await flush();
    expect(host.querySelector('textarea')?.value).toBe('# three.docx');
    expect(mocks.convert).toHaveBeenCalledTimes(3);
    mocks.convert.mockResolvedValue(result('broken.docx'));
    (host.querySelector('.document-text-runbar button') as HTMLButtonElement).click();
    await flush();
    expect(mocks.convert).toHaveBeenCalledTimes(4);
    expect(mocks.convert.mock.lastCall?.[0].name).toBe('broken.docx');
    expect(host.querySelector('textarea')?.value).toBe('# three.docx');
    expect(host.querySelector('[role=status]')).toBeNull();
  });

  it('discards late results after replacement and keeps the new run active', async () => {
    let finishOld!: (value: ReturnType<typeof result>) => void;
    let finishNew!: (value: ReturnType<typeof result>) => void;
    mocks.convert
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finishOld = resolve;
          }),
      )
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finishNew = resolve;
          }),
      );
    const host = mount(DocumentTextWorkbench, 'docx_to_markdown');
    await selectFiles(host, [file('old.docx')]);
    (host.querySelector('.document-text-runbar button') as HTMLButtonElement).click();
    await flush();
    await selectFiles(host, [file('new.docx')]);
    (host.querySelector('.document-text-runbar button') as HTMLButtonElement).click();
    await flush();
    finishOld(result('old.docx'));
    await flush();
    expect(host.querySelector('textarea')).toBeNull();
    expect((host.querySelector('.document-text-runbar button') as HTMLButtonElement).disabled).toBe(true);
    finishNew(result('new.docx'));
    await flush();
    expect(host.querySelector('textarea')?.value).toBe('# new.docx');
  });

  it('rejects an oversized batch instead of silently dropping files', async () => {
    const host = mount(DocumentTextWorkbench, 'docx_to_markdown');
    await selectFiles(
      host,
      Array.from({ length: 6 }, (_, i) => file(`${i}.docx`)),
    );
    expect(mocks.warning).toHaveBeenCalledWith('toolbox.documentText.tooMany');
    expect(host.querySelector('.document-text-sourcebar')).toBeNull();
  });
});

describe('Dataset continuous editing', () => {
  it('exports the applied data, then exports the original rows after undo', async () => {
    const host = mount(DatasetWorkbench, 'data_cleaner');
    (host.querySelector('.dataset-empty__actions > button') as HTMLButtonElement).click();
    await flush();
    (host.querySelector('.dataset-control-card__action button') as HTMLButtonElement).click();
    await flush();
    const clickAction = async (key: string) => {
      const button = [...host.querySelectorAll<HTMLButtonElement>('.dataset-canvas__actions button')].find((item) =>
        item.textContent?.includes(key),
      );
      expect(button, key).toBeDefined();
      button!.click();
      await flush();
    };
    await clickAction('applyPreview');
    await clickAction('exportResult');
    expect(mocks.download).toHaveBeenCalledTimes(1);
    const readBlob = (blob: Blob) =>
      new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.readAsText(blob);
      });
    const cleaned = await readBlob(mocks.download.mock.lastCall![0]);
    expect(cleaned.match(/A-003/g)).toHaveLength(1);
    await clickAction('undoApplied');
    await clickAction('exportResult');
    const restored = await readBlob(mocks.download.mock.lastCall![0]);
    expect(restored.match(/A-003/g)).toHaveLength(2);
  });
});

describe('Dataset file loading', () => {
  const source = (name = 'sample.xlsx') => ({
    name,
    worksheets: [
      { id: 1, name: 'Cover', rows: 1, columns: 1 },
      { id: 2, name: 'Orders', rows: 2, columns: 2 },
    ],
    read: vi.fn((id?: number) => ({
      name,
      worksheetName: id === 2 ? 'Orders' : 'Cover',
      headers: ['id'],
      rows: [['A']],
    })),
  });
  it('loads dropped files through worksheet selection without analyzing the first sheet implicitly', async () => {
    const prepared = source();
    mocks.prepare.mockResolvedValue(prepared);
    const host = mount(DatasetWorkbench, 'data_workbench');
    const event = new Event('drop', { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'dataTransfer', { value: { files: [file('sample.xlsx')] } });
    host.querySelector('.dataset-workbench__surface')!.dispatchEvent(event);
    await flush();
    expect(event.defaultPrevented).toBe(true);
    expect(mocks.prepare).toHaveBeenCalledOnce();
    expect(prepared.read).not.toHaveBeenCalled();
    const select = host.querySelector('[role=dialog] select') as HTMLSelectElement;
    select.value = '2';
    select.dispatchEvent(new Event('change'));
    await flush();
    (host.querySelector('.dataset-worksheet-actions button:last-child') as HTMLButtonElement).click();
    await flush();
    expect(prepared.read).toHaveBeenCalledWith(2);
    expect(host.querySelector('.dataset-sourcebar')).not.toBeNull();
    expect(host.querySelector('[role=dialog]')).toBeNull();
  });

  it('cancelling worksheet selection preserves the existing data and result', async () => {
    const host = mount(DatasetWorkbench, 'data_workbench');
    (host.querySelector('.dataset-empty__actions > button') as HTMLButtonElement).click();
    await flush();
    const before = host.querySelector('.dataset-sourcebar')!.textContent;
    const prepared = source();
    mocks.prepare.mockResolvedValue(prepared);
    await selectFiles(host, [file('replacement.xlsx')]);
    (host.querySelector('.dataset-worksheet-actions button') as HTMLButtonElement).click();
    await flush();
    expect(prepared.read).not.toHaveBeenCalled();
    expect(host.querySelector('.dataset-sourcebar')!.textContent).toBe(before);
    expect(host.querySelector('.dataset-studio')).not.toBeNull();
  });

  it('requires one selection per workbook for a two-file comparison', async () => {
    const first = source('before.xlsx'),
      second = source('after.xlsx');
    mocks.prepare.mockResolvedValueOnce(first).mockResolvedValueOnce(second);
    const host = mount(DatasetWorkbench, 'table_diff');
    await selectFiles(host, [file('before.xlsx'), file('after.xlsx')]);
    const selects = host.querySelectorAll<HTMLSelectElement>('[role=dialog] select');
    selects[0]!.value = '2';
    selects[0]!.dispatchEvent(new Event('change'));
    await flush();
    const confirm = host.querySelector('.dataset-worksheet-actions button:last-child') as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);
    selects[1]!.value = '1';
    selects[1]!.dispatchEvent(new Event('change'));
    await flush();
    confirm.click();
    await flush();
    expect(first.read).toHaveBeenCalledWith(2);
    expect(second.read).toHaveBeenCalledWith(1);
    expect(host.querySelectorAll('.dataset-sourcebar__files article')).toHaveLength(2);
  });
});
