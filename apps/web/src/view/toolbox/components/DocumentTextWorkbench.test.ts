import { createApp, nextTick } from 'vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PdfTextFileResult } from '@/utils/toolboxDocumentText';
import DocumentTextWorkbench from './DocumentTextWorkbench.vue';

const mocks = vi.hoisted(() => ({ extract: vi.fn(), download: vi.fn(), warning: vi.fn(), error: vi.fn() }));
vi.mock('@/utils/toolboxDocumentText', () => ({ extractPdfText: mocks.extract }));
vi.mock('@/utils/toolboxLocal', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  downloadToolboxBlob: mocks.download,
}));
vi.mock('vue-router', async (importOriginal) => ({
  ...(await importOriginal<object>()),
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
vi.mock('./DocumentSummary.vue', () => ({ default: { template: '<div />' } }));
vi.mock('@/components/base/BasicComponents/BMessage/BMessage', () => ({
  default: { warning: mocks.warning, error: mocks.error },
}));
vi.mock('@/components/base/SvgIcon/src/SvgIcon.vue', () => ({ default: { template: '<span />' } }));
vi.mock('@/components/base/BasicComponents/BButton.vue', () => ({
  default: { props: ['disabled', 'loading'], template: '<button :disabled="disabled || loading"><slot /></button>' },
}));
vi.mock('@/components/base/BasicComponents/BChip.vue', () => ({ default: { template: '<span><slot /></span>' } }));
vi.mock('@/components/base/BasicComponents/BInput.vue', () => ({
  default: { props: ['value'], template: '<textarea :value="value" />' },
}));
vi.mock('@/components/base/BasicComponents/BProgress.vue', () => ({ default: { template: '<div />' } }));
vi.mock('@/components/base/BasicComponents/BUpload.vue', () => ({
  default: {
    template: '<div><input type="file" @change="$emit(\'change\', Array.from($event.target.files))" /><slot /></div>',
  },
}));

let cleanup = () => {};
const flush = async () => {
  for (let i = 0; i < 15; i++) await nextTick();
};
beforeEach(() => {
  vi.resetAllMocks();
});
afterEach(() => {
  cleanup();
});
function mount() {
  const host = document.createElement('div');
  document.body.append(host);
  const app = createApp(DocumentTextWorkbench, { toolId: 'pdf_text_extractor' });
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
const pdf = (name: string) => new File(['fixture'], name, { type: 'application/pdf' });
const result = (name: string, text = `## Page 1\n\n${name}`): PdfTextFileResult[] => [
  { name, pages: [{ page: 1, text: name, characters: name.length }], text } as PdfTextFileResult,
];

describe('PDF 文字提取', () => {
  it('替换文件后丢弃旧任务的迟到结果，只展示新文件的文字', async () => {
    let finishOld!: (value: PdfTextFileResult[]) => void;
    let finishNew!: (value: PdfTextFileResult[]) => void;
    mocks.extract
      .mockImplementationOnce(() => new Promise((resolve) => (finishOld = resolve)))
      .mockImplementationOnce(() => new Promise((resolve) => (finishNew = resolve)));
    const host = mount();
    await selectFiles(host, [pdf('old.pdf')]);
    (host.querySelector('.document-text-runbar button') as HTMLButtonElement).click();
    await flush();
    await selectFiles(host, [pdf('new.pdf')]);
    (host.querySelector('.document-text-runbar button') as HTMLButtonElement).click();
    await flush();
    finishOld(result('old.pdf'));
    await flush();
    expect(host.querySelector('textarea')).toBeNull();
    expect((host.querySelector('.document-text-runbar button') as HTMLButtonElement).disabled).toBe(true);
    finishNew(result('new.pdf'));
    await flush();
    expect(host.querySelector('textarea')?.value).toContain('new.pdf');
    expect(host.querySelector('.document-text-runbar')).toBeNull();
  });

  it('超过数量上限或选择非 PDF 文件时整批拒绝，不静默丢弃', async () => {
    const host = mount();
    await selectFiles(
      host,
      Array.from({ length: 5 }, (_, i) => pdf(`${i}.pdf`)),
    );
    expect(mocks.warning).toHaveBeenCalledWith('toolbox.documentText.tooMany');
    await selectFiles(host, [new File(['x'], 'notes.docx')]);
    expect(mocks.warning).toHaveBeenCalledWith('toolbox.documentText.invalidType');
    expect(host.querySelector('.document-text-sourcebar')).toBeNull();
  });

  it('单个文件下载为 txt，多个文件打包下载', async () => {
    mocks.extract.mockResolvedValueOnce([...result('a.pdf'), ...result('b.pdf')]);
    const host = mount();
    await selectFiles(host, [pdf('a.pdf'), pdf('b.pdf')]);
    (host.querySelector('.document-text-runbar button') as HTMLButtonElement).click();
    await flush();
    const buttons = [...host.querySelectorAll('.document-text-main__actions button')] as HTMLButtonElement[];
    expect(buttons.at(-1)?.textContent).toContain('toolbox.documentText.downloadZip');
  });
});
