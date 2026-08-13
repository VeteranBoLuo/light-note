import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const detailSource = readFileSync(resolve(process.cwd(), 'src/view/noteLibrary/NoteDetail.vue'), 'utf8');
const headerSource = readFileSync(resolve(process.cwd(), 'src/components/noteLibrary/detail/NoteHeader.vue'), 'utf8');

describe('笔记详情待整理状态', () => {
  it('详情状态来自接口并进入短期详情快照', () => {
    expect(detailSource).toContain('isPending: Boolean(detailRecord.isPending)');
    expect(detailSource).toMatch(/function seedCurrentNoteDetail[\s\S]*isPending: Boolean\(note\.isPending\)/u);
  });

  it('编辑页切换状态后立即同步列表缓存并失效旧详情预取', () => {
    expect(detailSource).toContain('@toggle-inbox="toggleNoteInbox"');
    expect(detailSource).toMatch(
      /async function toggleNoteInbox[\s\S]*note\.isPending = nextPending;[\s\S]*invalidateNoteDetailPrefetch[\s\S]*updateNotePendingState/u,
    );
  });

  it('待整理操作只依赖真实状态，并复用面包屑行而不增加页面高度', () => {
    expect(detailSource).not.toContain('inbox-organize-banner');
    expect(detailSource).not.toContain('note-body--organizing');
    expect(detailSource).toContain('class="note-detail-complete-inbox"');
    expect(detailSource).toMatch(
      /showInboxOrganizer = computed\([\s\S]*!readonly\.value[\s\S]*Boolean\(note\.isPending\)/u,
    );
    expect(detailSource).not.toMatch(/showInboxOrganizer = computed\([\s\S]{0,160}isOrganizingFromInbox/u);
    expect(detailSource).toMatch(
      /async function saveAndCompleteInbox[\s\S]*note\.isPending = false;[\s\S]*updateNotePendingState/u,
    );
  });

  it('普通入口完成后留在当前页，只有待整理入口返回待整理页', () => {
    expect(detailSource).toContain('const shouldReturnToInbox = isOrganizingFromInbox.value');
    expect(detailSource).toContain("if (shouldReturnToInbox) router.push('/inbox')");
  });

  it('编辑顶栏展示待整理胶囊并为桌面和移动端提供切换入口', () => {
    expect(headerSource).toContain('<InboxPendingBadge v-if="note?.id && note?.isPending"');
    expect(headerSource).toContain("key: 'toggleInbox'");
    expect(headerSource).toContain("toggleInbox: () => emit('toggleInbox')");
    expect(headerSource).toContain("function: () => emit('toggleInbox')");
  });
});
