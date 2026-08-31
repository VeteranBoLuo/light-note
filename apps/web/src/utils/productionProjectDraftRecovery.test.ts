import { describe, expect, it, vi } from 'vitest';
import {
  createEmptyProductionProjectContent,
  type ProductionDocumentContentV1,
} from '@lightnote/shared/production-project-protocol';
import {
  MAX_PRODUCTION_PROJECT_DRAFT_BYTES,
  productionProjectDraftStorageKey,
  readProductionProjectDraft,
  removeProductionProjectDraft,
  replaceProductionProjectWithLatest,
  shouldOfferProductionProjectDraftRecovery,
  writeProductionProjectDraft,
} from './productionProjectDraftRecovery';

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  };
}

const content = createEmptyProductionProjectContent('document') as ProductionDocumentContentV1;

describe('生产项目本地草稿恢复', () => {
  it('按用户、项目类型和项目隔离，并记录服务端版本基线', () => {
    const storage = memoryStorage();
    expect(productionProjectDraftStorageKey('user/1', 'document', 'project/1')).not.toBe(
      productionProjectDraftStorageKey('user/2', 'document', 'project/1'),
    );
    expect(
      writeProductionProjectDraft(storage, 'user/1', {
        projectType: 'document',
        projectId: 'project/1',
        title: '草稿',
        content,
        baseVersion: 7,
        serverUpdatedAt: '2026-08-30T00:00:00.000Z',
        updatedAt: 100,
      }),
    ).toBe(true);
    expect(readProductionProjectDraft(storage, 'user/1', 'document', 'project/1')).toMatchObject({
      schemaVersion: 1,
      projectType: 'document',
      projectId: 'project/1',
      baseVersion: 7,
      content,
    });
    expect(readProductionProjectDraft(storage, 'user/2', 'document', 'project/1')).toBeNull();
  });

  it('只要本地草稿与服务端内容不同就交给用户决定是否恢复', () => {
    const draft = {
      schemaVersion: 1 as const,
      projectType: 'document' as const,
      projectId: 'p1',
      title: '本地',
      content,
      baseVersion: 3,
      serverUpdatedAt: new Date(100).toISOString(),
      updatedAt: 200,
    };
    expect(
      shouldOfferProductionProjectDraftRecovery(draft, {
        projectType: 'document',
        title: '服务端',
        content,
        version: 3,
        updatedAt: new Date(100).toISOString(),
      }),
    ).toBe(true);
    expect(
      shouldOfferProductionProjectDraftRecovery(draft, {
        projectType: 'document',
        title: '本地',
        content,
        version: 3,
        updatedAt: new Date(100).toISOString(),
      }),
    ).toBe(false);
  });

  it('同一服务端版本上的未保存正文不因标题 PATCH 更新时间较新而被清理', () => {
    const localContent = {
      ...content,
      body: { ...content.body, value: '正文 revision 尚未保存' },
    };
    const draft = {
      schemaVersion: 1 as const,
      projectType: 'document' as const,
      projectId: 'p1',
      title: '标题已保存',
      content: localContent,
      baseVersion: 8,
      serverUpdatedAt: new Date(300).toISOString(),
      updatedAt: 200,
    };
    expect(
      shouldOfferProductionProjectDraftRecovery(draft, {
        projectType: 'document',
        title: '标题已保存',
        content,
        version: 8,
        updatedAt: new Date(300).toISOString(),
      }),
    ).toBe(true);
    expect(
      shouldOfferProductionProjectDraftRecovery(draft, {
        projectType: 'document',
        title: '标题已保存',
        content,
        version: 9,
        updatedAt: new Date(300).toISOString(),
      }),
    ).toBe(true);
  });

  it('服务器后来产生新版本时也保留崩溃前落盘的不同本地稿', () => {
    const crashedDraft = {
      schemaVersion: 1 as const,
      projectType: 'document' as const,
      projectId: 'p1',
      title: '设备 A 未保存稿',
      content: {
        ...content,
        body: { ...content.body, value: '设备 A 在崩溃前已经落盘的正文' },
      },
      baseVersion: 3,
      serverUpdatedAt: new Date(100).toISOString(),
      updatedAt: 100,
    };
    expect(
      shouldOfferProductionProjectDraftRecovery(crashedDraft, {
        projectType: 'document',
        title: '设备 B 已保存版本',
        content,
        version: 4,
        updatedAt: new Date(500).toISOString(),
      }),
    ).toBe(true);
  });

  it('拒绝超限、损坏或类型不匹配的数据，并允许清理', () => {
    const storage = memoryStorage();
    const key = productionProjectDraftStorageKey('u1', 'document', 'p1');
    storage.setItem(key, '{bad json');
    expect(readProductionProjectDraft(storage, 'u1', 'document', 'p1')).toBeNull();
    storage.setItem(key, 'x'.repeat(MAX_PRODUCTION_PROJECT_DRAFT_BYTES + 1));
    expect(readProductionProjectDraft(storage, 'u1', 'document', 'p1')).toBeNull();
    removeProductionProjectDraft(storage, 'u1', 'document', 'p1');
    expect(readProductionProjectDraft(storage, 'u1', 'document', 'p1')).toBeNull();
  });

  it('配额或浏览器存储写入失败时显式返回 false', () => {
    const unavailableStorage = {
      setItem: () => {
        throw new Error('quota');
      },
    };
    expect(
      writeProductionProjectDraft(unavailableStorage, 'u1', {
        projectType: 'document',
        projectId: 'p1',
        title: '未保护草稿',
        content,
        baseVersion: 1,
        serverUpdatedAt: null,
        updatedAt: 1,
      }),
    ).toBe(false);

    const oversizedContent = {
      ...content,
      body: { ...content.body, value: 'x'.repeat(MAX_PRODUCTION_PROJECT_DRAFT_BYTES) },
    };
    expect(
      writeProductionProjectDraft(memoryStorage(), 'u1', {
        projectType: 'document',
        projectId: 'p1',
        title: '超限草稿',
        content: oversizedContent,
        baseVersion: 1,
        serverUpdatedAt: null,
        updatedAt: 1,
      }),
    ).toBe(false);
  });

  it('仅在最新项目获取并应用成功后清理本地草稿', async () => {
    const order: string[] = [];
    await expect(
      replaceProductionProjectWithLatest(
        async () => {
          order.push('fetch');
          return { version: 2 };
        },
        () => order.push('apply'),
        () => order.push('clear'),
      ),
    ).resolves.toEqual({ version: 2 });
    expect(order).toEqual(['fetch', 'apply', 'clear']);

    const apply = vi.fn();
    const clear = vi.fn();
    await expect(
      replaceProductionProjectWithLatest(async () => Promise.reject(new Error('offline')), apply, clear),
    ).rejects.toThrow('offline');
    expect(apply).not.toHaveBeenCalled();
    expect(clear).not.toHaveBeenCalled();

    await expect(
      replaceProductionProjectWithLatest(
        async () => ({ version: 3 }),
        () => {
          throw new Error('apply failed');
        },
        clear,
      ),
    ).rejects.toThrow('apply failed');
    expect(clear).not.toHaveBeenCalled();
  });
});
