import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const pageSource = readFileSync(resolve(process.cwd(), 'src/view/cloudSpace/cloudSpace.vue'), 'utf8');
const listSource = readFileSync(resolve(process.cwd(), 'src/components/cloudSpace/fieldList.vue'), 'utf8');

describe('云空间待整理目标删除同步', () => {
  it('单删和批量删除成功后都回传已删除文件 ID', () => {
    expect(listSource).toContain("'filesDeleted'");
    expect(listSource).toContain("emit('filesDeleted', [String(file.id)])");
    expect(listSource).toContain("emit('filesDeleted', deletingIds)");
  });

  it('已删除当前待整理文件时立即隐藏提示并清理路由上下文', () => {
    expect(pageSource).toContain('@files-deleted="handleFilesDeleted"');
    expect(pageSource).toContain('v-if="showInboxFileOrganizer"');
    expect(pageSource).toMatch(
      /function handleFilesDeleted[\s\S]*deletedOrganizingFileId\.value = currentId[\s\S]*delete query\.fileId[\s\S]*delete query\.fileName[\s\S]*delete query\.organize[\s\S]*delete query\.from[\s\S]*router\.replace/u,
    );
  });
});
