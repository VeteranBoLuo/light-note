export function publicResourceErrorKey(error: unknown): string {
  const code = typeof error === 'string' ? error : (error as { code?: string })?.code;
  return (
    'publicResources.' +
    ({
      PUBLIC_RESOURCE_MATERIAL_CHANGED: 'materialChanged',
      PUBLIC_RESOURCE_VERSION_CONFLICT: 'versionConflict',
      PUBLIC_RESOURCE_TEXT_ONLY: 'textOnly',
      PUBLIC_RESOURCE_EMPTY: 'emptyContent',
      PUBLIC_RESOURCE_TOO_LARGE: 'tooLarge',
      PUBLIC_RESOURCE_INVALID_URL: 'invalidUrl',
      PUBLIC_RESOURCE_REMOVED: 'removedHint',
      PUBLIC_RESOURCE_SOURCE_UNAVAILABLE: 'sourceUnavailable',
      PUBLIC_RESOURCE_RATE_LIMITED: 'batch.rateLimited',
      PUBLIC_RESOURCE_READ_ONLY: 'batch.submissionsClosed',
      PUBLIC_RESOURCE_CLOSED: 'closed',
      PUBLIC_RESOURCE_BATCH_STOPPED: 'batch.stopped',
      PUBLIC_RESOURCE_BATCH_LIMIT: 'batch.limitError',
      PUBLIC_RESOURCE_BATCH_UNCONFIRMED: 'batch.unknown',
      PUBLIC_RESOURCE_BATCH_SELECTION_CHANGED: 'batch.selectionChanged',
    }[code || ''] || 'error')
  );
}
