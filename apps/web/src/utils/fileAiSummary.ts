import { getCloudFileCategory } from '@/constants/cloudFileCategory';

export interface FileAiSummaryPresentation {
  isImage: boolean;
  labelKey: 'cloudSpace.aiExtractAndSummarizeImage' | 'cloudSpace.aiSummarizeFile';
  instructionKey: 'cloudSpace.aiExtractAndSummarizeImageInstruction' | 'cloudSpace.aiSummarizeInstruction';
}

export function resolveFileAiSummaryPresentation(file?: {
  category?: string;
  fileName?: string;
  fileType?: string;
  ext?: string;
}): FileAiSummaryPresentation {
  const isImage = getCloudFileCategory(file) === 'image';
  return {
    isImage,
    labelKey: isImage ? 'cloudSpace.aiExtractAndSummarizeImage' : 'cloudSpace.aiSummarizeFile',
    instructionKey: isImage ? 'cloudSpace.aiExtractAndSummarizeImageInstruction' : 'cloudSpace.aiSummarizeInstruction',
  };
}
