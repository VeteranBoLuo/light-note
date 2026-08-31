import {
  validateProductionProjectContent,
  type ProductionProjectContent,
  type ProductionProjectType,
} from '@lightnote/shared/production-project-protocol';

export const MAX_PRODUCTION_PROJECT_DRAFT_BYTES = 2 * 1024 * 1024;
const STORAGE_PREFIX = 'lightnote:production-project-draft';

export interface ProductionProjectLocalDraft<TContent extends ProductionProjectContent = ProductionProjectContent> {
  schemaVersion: 1;
  projectType: ProductionProjectType;
  projectId: string;
  title: string;
  content: TContent;
  baseVersion: number;
  serverUpdatedAt: string | null;
  updatedAt: number;
}

export function productionProjectDraftStorageKey(
  ownerId: string,
  projectType: ProductionProjectType,
  projectId: string,
) {
  const owner = String(ownerId || '').trim();
  const project = String(projectId || '').trim();
  if (!owner || !project) return '';
  return `${STORAGE_PREFIX}:${encodeURIComponent(owner)}:${projectType}:${encodeURIComponent(project)}`;
}

function byteLength(value: string) {
  return new TextEncoder().encode(value).byteLength;
}

export function readProductionProjectDraft<TContent extends ProductionProjectContent>(
  storage: Pick<Storage, 'getItem'>,
  ownerId: string,
  projectType: TContent['type'],
  projectId: string,
): ProductionProjectLocalDraft<TContent> | null {
  const key = productionProjectDraftStorageKey(ownerId, projectType, projectId);
  if (!key) return null;
  try {
    const serialized = storage.getItem(key);
    if (!serialized || byteLength(serialized) > MAX_PRODUCTION_PROJECT_DRAFT_BYTES) return null;
    const parsed = JSON.parse(serialized) as Partial<ProductionProjectLocalDraft<TContent>> | null;
    if (
      !parsed ||
      parsed.schemaVersion !== 1 ||
      parsed.projectType !== projectType ||
      parsed.projectId !== projectId ||
      typeof parsed.title !== 'string' ||
      !Number.isInteger(parsed.baseVersion) ||
      Number(parsed.baseVersion) < 0 ||
      (parsed.serverUpdatedAt !== null && typeof parsed.serverUpdatedAt !== 'string') ||
      !Number.isFinite(parsed.updatedAt) ||
      !validateProductionProjectContent(parsed.content, projectType)
    ) {
      return null;
    }
    return parsed as ProductionProjectLocalDraft<TContent>;
  } catch {
    return null;
  }
}

export function writeProductionProjectDraft<TContent extends ProductionProjectContent>(
  storage: Pick<Storage, 'setItem'>,
  ownerId: string,
  draft: Omit<ProductionProjectLocalDraft<TContent>, 'schemaVersion'>,
) {
  const key = productionProjectDraftStorageKey(ownerId, draft.projectType, draft.projectId);
  if (!key || !validateProductionProjectContent(draft.content, draft.projectType)) return false;
  try {
    const serialized = JSON.stringify({ schemaVersion: 1, ...draft } satisfies ProductionProjectLocalDraft<TContent>);
    if (byteLength(serialized) > MAX_PRODUCTION_PROJECT_DRAFT_BYTES) return false;
    storage.setItem(key, serialized);
    return true;
  } catch {
    return false;
  }
}

export function removeProductionProjectDraft(
  storage: Pick<Storage, 'removeItem'>,
  ownerId: string,
  projectType: ProductionProjectType,
  projectId: string,
) {
  const key = productionProjectDraftStorageKey(ownerId, projectType, projectId);
  if (!key) return;
  try {
    storage.removeItem(key);
  } catch {
    // 浏览器可能禁用本地存储；清理失败不应阻断服务端保存。
  }
}

export function shouldOfferProductionProjectDraftRecovery<TContent extends ProductionProjectContent>(
  draft: ProductionProjectLocalDraft<TContent> | null,
  server: {
    projectType: TContent['type'];
    title: string;
    content: TContent;
    version: number;
    updatedAt: string | null;
  },
) {
  if (!draft || draft.projectType !== server.projectType) return false;
  const isDifferent = draft.title !== server.title || JSON.stringify(draft.content) !== JSON.stringify(server.content);
  return isDifferent;
}

export async function replaceProductionProjectWithLatest<TDetail>(
  fetchLatest: () => Promise<TDetail>,
  applyLatest: (detail: TDetail) => void,
  clearDraft: () => void,
) {
  const detail = await fetchLatest();
  applyLatest(detail);
  clearDraft();
  return detail;
}
