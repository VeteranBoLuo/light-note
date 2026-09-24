import { openSaveAsNote } from '@/composables/useSaveAsNote';
import { fetchToolboxArtifact, saveToolboxArtifact, createToolboxArtifactSaveRequestId } from '@/api/toolbox';
import { confirmNoteCreateShareExposure } from '@/utils/noteShareExposure';
export async function saveToolboxNote(input: {
  artifactId: string;
  version: number;
  title: string;
  projectId?: string;
  description?: string;
  action?: 'save' | 'recreate_missing_target';
  saveFormat?: 'translationOnly' | 'bilingual';
  isCurrent?: () => boolean;
}) {
  return openSaveAsNote({
    sourceKey: `artifact:${input.artifactId}:${input.version}:${input.action || 'save'}`,
    saveFormat: input.saveFormat,
    title: input.title,
    type: 'markdown',
    projectId: input.projectId,
    description: input.description,
    isCurrent: input.isCurrent,
    lookup: async () => {
      const artifact = await fetchToolboxArtifact(input.artifactId);
      if (artifact.save?.targetId && artifact.save.targetAvailability === 'available')
        return { noteId: artifact.save.targetId };
      if (artifact.save?.targetId && input.action !== 'recreate_missing_target')
        return { noteId: artifact.save.targetId, unavailable: true };
      return null;
    },
    save: async (options) => {
      const acknowledged = await confirmNoteCreateShareExposure(options.parentId || '');
      if (acknowledged === false) throw Object.assign(new Error('Cancelled'), { code: 'SAVE_NOTE_CANCELLED' });
      if (input.isCurrent && !input.isCurrent()) throw Object.assign(new Error('Source changed'), { status: 409 });
      const result = await saveToolboxArtifact(
        input.artifactId,
        createToolboxArtifactSaveRequestId(input.artifactId, input.version),
        input.action || 'save',
        {
          title: options.title,
          parentId: options.parentId,
          shareExposureAcknowledged: acknowledged === true,
          saveFormat: options.saveFormat,
        },
      );
      return { noteId: result.targetId };
    },
  });
}
