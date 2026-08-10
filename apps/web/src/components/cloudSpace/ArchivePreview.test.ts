import { createApp } from 'vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ArchivePreview from './ArchivePreview.vue';

const apiMocks = vi.hoisted(() => ({
  listOwnedArchivePreview: vi.fn(),
  listSharedArchivePreview: vi.fn(),
}));

vi.mock('@/api/filePreviewApi.ts', () => apiMocks);
vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (key: string) => key }) }));
vi.mock('@/config/icon.ts', () => ({
  default: { common: { important: 'important', folder: 'folder' }, cloudSpace: { fileIcon: { other: 'file' } } },
}));
vi.mock('@/components/base/BasicComponents/BButton.vue', () => ({
  default: { emits: ['click'], template: '<button type="button" @click="$emit(\'click\')"><slot /></button>' },
}));
vi.mock('@/components/base/BasicComponents/BInput.vue', () => ({
  default: { props: ['value'], template: '<div class="input-stub" />' },
}));
vi.mock('@/components/base/BasicComponents/BLoading.vue', () => ({
  default: { template: '<div class="loading-stub" />' },
}));
vi.mock('@/components/base/SvgIcon/src/SvgIcon.vue', () => ({
  default: { template: '<span class="icon-stub" />' },
}));

const emptySummary = {
  entryCount: 1,
  totalUncompressedSize: 120,
  containsEncrypted: false,
  suspiciousExpansion: false,
  skippedUnsafeEntries: 0,
};
let cleanup = () => {};

function mountArchive(props: { fileId: string; previewTicket?: string }) {
  const host = document.createElement('div');
  document.body.append(host);
  const app = createApp(ArchivePreview, props);
  app.mount(host);
  cleanup = () => {
    app.unmount();
    host.remove();
  };
}

describe('ArchivePreview', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => cleanup());

  it('loads an owner archive and navigates inferred directories without extracting content', async () => {
    apiMocks.listOwnedArchivePreview
      .mockResolvedValueOnce({
        directory: '',
        query: '',
        items: [
          {
            path: 'docs',
            name: 'docs',
            parentPath: '',
            isDirectory: true,
            size: 0,
            packedSize: 0,
            modifiedAt: '',
            encrypted: false,
          },
        ],
        total: 1,
        nextOffset: null,
        summary: emptySummary,
      })
      .mockResolvedValueOnce({
        directory: 'docs',
        query: '',
        items: [],
        total: 0,
        nextOffset: null,
        summary: emptySummary,
      });

    mountArchive({ fileId: '42' });
    await vi.waitFor(() => expect(document.body.querySelector('.archive-entry-action')).not.toBeNull());
    (document.body.querySelector('.archive-entry-action') as HTMLButtonElement).click();

    await vi.waitFor(() => expect(apiMocks.listOwnedArchivePreview).toHaveBeenCalledTimes(2));
    expect(apiMocks.listOwnedArchivePreview.mock.calls[1]).toEqual([
      '42',
      { directory: 'docs', query: '', offset: 0, limit: 200 },
    ]);
    expect(apiMocks.listSharedArchivePreview).not.toHaveBeenCalled();
  });

  it('uses the share preview ticket instead of the owner endpoint', async () => {
    apiMocks.listSharedArchivePreview.mockResolvedValue({
      directory: '',
      query: '',
      items: [],
      total: 0,
      nextOffset: null,
      summary: emptySummary,
    });

    mountArchive({ fileId: '42', previewTicket: 'ticket-1' });

    await vi.waitFor(() => expect(apiMocks.listSharedArchivePreview).toHaveBeenCalledTimes(1));
    expect(apiMocks.listSharedArchivePreview).toHaveBeenCalledWith('ticket-1', {
      directory: '',
      query: '',
      offset: 0,
      limit: 200,
    });
    expect(apiMocks.listOwnedArchivePreview).not.toHaveBeenCalled();
  });
});
