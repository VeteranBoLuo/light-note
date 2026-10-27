import type { ToolboxJob } from '@/api/toolbox';
import type { ComposerTranslation } from 'vue-i18n';

export function toolboxTaskTitle(job: ToolboxJob, t: ComposerTranslation, locale: string) {
  if (job.title || job.extraction?.title || job.artifact?.title)
    return job.title || job.extraction?.title || job.artifact!.title;
  const date = new Date(job.createdAt);
  const label = Number.isFinite(date.getTime())
    ? new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(
        date,
      )
    : '';
  return [t(`toolbox.tool.${job.toolId}.name`), label].filter(Boolean).join(' · ');
}
export function toolboxTaskReady(job: ToolboxJob) {
  return job.artifactState === 'ready' && ['unsaved', 'save_failed'].includes(job.save.status);
}
export function toolboxTaskStateLabel(job: ToolboxJob, t: ComposerTranslation) {
  if (job.extraction) return t(`extraction.statuses.${job.extraction.status}`);
  if (job.save.status === 'save_failed') return t('toolbox.taskList.saveFailedStatus');
  return toolboxTaskReady(job) ? t('toolbox.home.resultReady') : t(`toolbox.task.${job.status}`);
}
export function toolboxTaskCanDismiss(job: ToolboxJob) {
  return (
    !job.extraction &&
    !job.dismissed &&
    ['succeeded', 'partial_succeeded', 'failed', 'cancelled', 'expired'].includes(job.status) &&
    job.save.status !== 'saving'
  );
}
