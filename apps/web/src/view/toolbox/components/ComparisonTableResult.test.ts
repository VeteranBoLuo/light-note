import { createApp, nextTick, ref } from 'vue';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import Result from './ComparisonTableResult.vue';
vi.mock('@/utils/toolboxLocal', () => ({ downloadToolboxBlob: vi.fn(), safeDownloadBaseName: (name: string) => name }));
vi.mock('@/components/base/BasicComponents/BTable/BTable.vue', () => ({ default: { template: '<div />' } }));
const review = vi.hoisted(() => vi.fn());
vi.mock('@/api/toolbox', () => ({ reviewToolboxComparison: review }));
vi.mock('@/store', () => ({
  bookmarkStore: () => ({ isMobile: true }),
  useUserStore: () => ({ id: 'owner', role: 'user' }),
}));
vi.mock('vue-i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('vue-i18n')>()),
  useI18n: () => ({ t: (key: string) => key }),
}));
vi.mock('@/components/base/BasicComponents/BModal/BModal.vue', () => ({
  default: { props: ['visible'], template: '<div v-if="visible" class="modal"><slot/><slot name="footer"/></div>' },
}));
vi.mock('@/components/base/BasicComponents/BModal/Alert', () => ({ default: { alert: vi.fn() } }));
vi.mock('@/components/base/BasicComponents/BMessage/BMessage', () => ({ default: { error: vi.fn() } }));
vi.mock('@/components/base/BasicComponents/BInput.vue', () => ({
  default: {
    props: ['value', 'disabled'],
    template: '<textarea :disabled="disabled" :value="value" @input="$emit(\'update:value\', $event.target.value)" />',
  },
}));
vi.mock('@/components/base/BasicComponents/BTabs.vue', () => ({ default: { template: '<div />' } }));
const fixture = () => ({
  id: 'a',
  version: 1,
  content: '',
  title: 'table',
  save: { status: 'unsaved' },
  meta: {
    comparisonTable: {
      columns: [{ label: 'Price', type: 'auto', rule: '' }],
      rows: [{ sourceId: 'note:a', title: 'A', cells: [{ value: '29', status: 'conflict', quotes: ['29', '39'] }] }],
    },
  },
});
const flush = async () => {
  for (let i = 0; i < 12; i++) await nextTick();
};
let cleanup = () => {};
function mount() {
  const artifact = ref<any>(fixture());
  const updated = vi.fn();
  const busy = vi.fn();
  const host = document.createElement('div');
  const app = createApp({
    components: { Result },
    setup: () => ({ artifact, updated, busy }),
    template: '<Result :artifact="artifact" @updated="updated" @busy="busy" />',
  });
  app.directive('auto-scrollbar', {});
  app.mount(host);
  cleanup = () => app.unmount();
  const button = (text: string) => [...host.querySelectorAll('button')].find((el) => el.textContent?.includes(text))!;
  return { host, artifact, updated, busy, button };
}
beforeEach(() => {
  review.mockReset();
});
afterEach(() => cleanup());
it('retains draft on a version conflict and sends the version that was opened', async () => {
  review.mockRejectedValue({ code: 'TOOLBOX_COMPARISON_CONFLICT' });
  const { host, artifact, updated, button } = mount();
  button('29').click();
  await flush();
  const textarea = host.querySelector('textarea')!;
  textarea.value = '39';
  textarea.dispatchEvent(new Event('input'));
  await flush();
  artifact.value = { ...artifact.value, version: 2 };
  await flush();
  button('comparisonTable.save').click();
  await flush();
  expect(review).toHaveBeenCalledWith('a', { version: 1, sourceId: 'note:a', columnIndex: 0, value: '39' });
  expect(updated).not.toHaveBeenCalled();
  expect(textarea.value).toBe('39');
  expect(host.textContent).toContain('comparisonTable.stale');
});
it('updates current value while preserving original evidence and closes the inspector once', async () => {
  review.mockResolvedValue({ version: 2 });
  const { host, updated, button, busy } = mount();
  button('29').click();
  await flush();
  const input = host.querySelector('textarea')!;
  input.value = '39';
  input.dispatchEvent(new Event('input'));
  await flush();
  button('comparisonTable.save').click();
  await flush();
  expect(updated).toHaveBeenCalledOnce();
  expect(updated.mock.calls[0][0].meta.comparisonTable.rows[0].cells[0]).toMatchObject({
    value: '39',
    originalValue: '29',
    quotes: ['29', '39'],
    reviewed: true,
    edited: true,
  });
  expect(host.querySelector('.modal')).toBeNull();
  expect(busy).toHaveBeenLastCalledWith(false);
});
it('ignores an in-flight review after switching artifacts and makes saved results read-only', async () => {
  let resolve!: (value: unknown) => void;
  review.mockImplementation(
    () =>
      new Promise((r) => {
        resolve = r;
      }),
  );
  const { host, artifact, updated, button } = mount();
  button('29').click();
  await flush();
  button('comparisonTable.save').click();
  await flush();
  artifact.value = { ...fixture(), id: 'b', save: { status: 'saved' } };
  await flush();
  resolve({ version: 2 });
  await flush();
  expect(updated).not.toHaveBeenCalled();
  button('29').click();
  await flush();
  expect(host.querySelector('textarea')?.disabled).toBe(true);
  expect(button('comparisonTable.save')).toBeUndefined();
});
