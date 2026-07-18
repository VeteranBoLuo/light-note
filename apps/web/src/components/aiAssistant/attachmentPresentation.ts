import type { AiAttachmentStatus } from '@/api/aiAttachmentApi';

export type AiAttachmentTone = 'neutral' | 'processing' | 'success' | 'warning' | 'error';

export interface AiAttachmentPresentation {
  isProcessing: boolean;
  showOriginalReady: boolean;
  statusKey: string;
  tone: AiAttachmentTone;
}

const PRESENTATIONS: Record<AiAttachmentStatus, AiAttachmentPresentation> = {
  awaiting_upload: {
    isProcessing: false,
    showOriginalReady: false,
    statusKey: 'ai.attachmentStatus.awaiting_upload',
    tone: 'neutral',
  },
  queued: {
    isProcessing: true,
    showOriginalReady: true,
    statusKey: 'ai.attachmentStatus.queued',
    tone: 'processing',
  },
  parsing: {
    isProcessing: true,
    showOriginalReady: true,
    statusKey: 'ai.attachmentStatus.parsing',
    tone: 'processing',
  },
  ready: {
    isProcessing: false,
    showOriginalReady: true,
    statusKey: 'ai.attachmentStatus.ready',
    tone: 'success',
  },
  no_text: {
    isProcessing: false,
    showOriginalReady: true,
    statusKey: 'ai.attachmentStatus.no_text',
    tone: 'warning',
  },
  failed: {
    isProcessing: false,
    showOriginalReady: true,
    statusKey: 'ai.attachmentStatus.failed',
    tone: 'error',
  },
};

export function getAiAttachmentPresentation(status: AiAttachmentStatus): AiAttachmentPresentation {
  return PRESENTATIONS[status] || PRESENTATIONS.awaiting_upload;
}
