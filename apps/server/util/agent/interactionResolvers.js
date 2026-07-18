import { createAgentInteraction, AgentInteractionError } from './interactionStore.js';

function normalizedArgsFromError(error, fallbackArgs = {}) {
  const args = error?.normalizedToolArgs || fallbackArgs;
  return args && typeof args === 'object' && !Array.isArray(args) ? { ...args } : {};
}

export function canResolveFolderInteraction(error, toolName, fallbackArgs = {}) {
  if (toolName !== 'save_attachment_to_cloud') return false;
  if (!['FOLDER_NOT_FOUND', 'FOLDER_AMBIGUOUS'].includes(String(error?.code || ''))) return false;
  const args = normalizedArgsFromError(error, fallbackArgs);
  return Boolean(String(args.folderName || '').trim() || String(args.folderId || '').trim());
}

function folderOptions({ canCreate }) {
  const options = [];
  if (canCreate) {
    options.push({
      id: 'create_and_save',
      label: '新建文件夹并保存',
      description: '如果该文件夹仍不存在，将自动创建后保存文件。',
      i18nKey: 'ai.interaction.folderMissing.options.create',
      recommended: true,
    });
  }
  options.push(
    {
      id: 'save_to_root',
      label: '改存云空间根目录',
      description: '不创建文件夹，直接把文件保存到云空间根目录。',
      i18nKey: 'ai.interaction.folderMissing.options.root',
    },
    {
      id: 'choose_other_folder',
      label: '选择其他文件夹',
      description: '返回文件设置，从已有文件夹中重新选择。',
      i18nKey: 'ai.interaction.folderMissing.options.other',
    },
  );
  return options;
}

export async function createFolderResolutionInteraction({
  error,
  toolName,
  fallbackArgs,
  ownerKey,
  sessionId,
  context,
}) {
  if (!canResolveFolderInteraction(error, toolName, fallbackArgs)) return null;
  const args = normalizedArgsFromError(error, fallbackArgs);
  const folderName = String(args.folderName || '').trim();
  const ambiguous = error.code === 'FOLDER_AMBIGUOUS';
  const canCreate = Boolean(folderName) && !ambiguous;
  const title = ambiguous ? `存在多个“${folderName}”文件夹` : `没有找到“${folderName || '目标'}”文件夹`;
  const description = ambiguous
    ? '为了避免保存到错误位置，请重新选择目标。'
    : '请选择接下来如何处理，选择本身不会立即修改数据。';
  return createAgentInteraction({
    ownerKey,
    sessionId,
    context,
    spec: {
      code: ambiguous ? 'cloud_folder_ambiguous' : 'cloud_folder_missing',
      type: 'single_choice',
      purpose: 'choice_confirmation',
      title,
      description,
      i18nKey: ambiguous ? 'ai.interaction.folderAmbiguous' : 'ai.interaction.folderMissing',
      i18nParams: { folderName: folderName || '目标' },
      options: folderOptions({ canCreate }).map((option) => ({
        ...option,
        i18nParams: { folderName: folderName || '目标' },
      })),
      minSelections: 1,
      maxSelections: 1,
    },
    action: {
      resolver: 'save_attachment_folder_resolution',
      toolName,
      args,
      folderName,
    },
  });
}

export function canResolveBookmarkUrlInteraction(error, toolName) {
  const candidates = error?.data?.urlResolution?.candidates;
  return (
    toolName === 'create_bookmark' &&
    String(error?.code || '') === 'CANDIDATE_CONFIRMATION_REQUIRED' &&
    Array.isArray(candidates) &&
    candidates.length > 0
  );
}

export async function createBookmarkUrlResolutionInteraction({
  error,
  toolName,
  fallbackArgs,
  ownerKey,
  sessionId,
  context,
}) {
  if (!canResolveBookmarkUrlInteraction(error, toolName)) return null;
  const args = normalizedArgsFromError(error, fallbackArgs);
  const candidates = error.data.urlResolution.candidates.slice(0, 5);
  return createAgentInteraction({
    ownerKey,
    sessionId,
    context,
    spec: {
      code: 'bookmark_url_candidate_selection',
      type: 'single_choice',
      purpose: 'choice_confirmation',
      title: '确认要收藏的网址',
      description: '输入内容中识别到了候选地址。请选择正确的网址，选择本身不会立即创建书签。',
      i18nKey: 'ai.interaction.bookmarkUrl',
      options: candidates.map((candidate, index) => ({
        id: `candidate_${index + 1}`,
        label: candidate.url,
        description: candidate.source === 'explicit' ? '从完整网址识别' : '从域名识别并补全为 HTTPS',
        i18nKey:
          candidate.source === 'explicit'
            ? 'ai.interaction.bookmarkUrl.options.explicit'
            : 'ai.interaction.bookmarkUrl.options.domain',
        recommended: candidates.length === 1,
      })),
      minSelections: 1,
      maxSelections: 1,
    },
    action: {
      resolver: 'create_bookmark_url_resolution',
      toolName,
      args,
      candidates: candidates.map((candidate, index) => ({ id: `candidate_${index + 1}`, url: candidate.url })),
    },
  });
}

export async function createToolResolutionInteraction(input) {
  return (
    (await createFolderResolutionInteraction(input)) ||
    (await createBookmarkUrlResolutionInteraction(input))
  );
}

export function resolveAgentInteractionAction(interaction, response) {
  if (response.cancelled) return { state: 'cancelled' };
  const action = interaction?.action || {};
  if (action.resolver === 'create_bookmark_url_resolution' && action.toolName === 'create_bookmark') {
    const choice = response.selectedIds[0];
    const selected = Array.isArray(action.candidates)
      ? action.candidates.find((candidate) => candidate.id === choice)
      : null;
    if (!selected?.url) {
      throw new AgentInteractionError('AGENT_INTERACTION_RESPONSE_INVALID', '请选择一个可用的网址。');
    }
    return {
      state: 'confirmation_required',
      toolName: action.toolName,
      args: { ...(action.args || {}), url: selected.url },
    };
  }
  if (action.resolver !== 'save_attachment_folder_resolution' || action.toolName !== 'save_attachment_to_cloud') {
    throw new AgentInteractionError('AGENT_INTERACTION_RESOLVER_INVALID', '该交互暂时无法继续，请重新发起。');
  }
  const choice = response.selectedIds[0];
  const args = { ...(action.args || {}) };
  if (choice === 'choose_other_folder') {
    return {
      state: 'edit_required',
      toolName: action.toolName,
      args: { ...args, folderId: '', folderName: '', folderStrategy: 'existing' },
    };
  }
  if (choice === 'save_to_root') {
    return {
      state: 'confirmation_required',
      toolName: action.toolName,
      args: { ...args, folderId: '', folderName: '', folderStrategy: 'root' },
    };
  }
  if (choice === 'create_and_save' && action.folderName) {
    return {
      state: 'confirmation_required',
      toolName: action.toolName,
      args: {
        ...args,
        folderId: '',
        folderName: action.folderName,
        folderStrategy: 'create_if_missing',
      },
    };
  }
  throw new AgentInteractionError('AGENT_INTERACTION_RESPONSE_INVALID', '请选择一个可用的处理方式。');
}
