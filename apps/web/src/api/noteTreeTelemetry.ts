import {
  aiDurationBucket,
  recordAiProductEvent,
  type AiProductEventDimensions,
  type AiProductEventName,
} from '@/api/aiTelemetry';

export type NoteTreeProductEventName = Extract<
  AiProductEventName,
  | `note_tree_${string}`
  | 'note_branch_ai_selected'
  | 'note_branch_ai_answered'
>;

export type NoteTreeTelemetryInput = {
  surface: 'desktop' | 'mobile' | 'ai';
  depth?: number;
  childCount?: number;
  subtreeSize?: number;
  durationMs?: number;
  result?: NonNullable<AiProductEventDimensions['result']>;
};

export function noteTreeDepthBucket(depth: number): NonNullable<AiProductEventDimensions['depthBucket']> {
  const value = Math.max(0, Math.trunc(Number(depth) || 0));
  if (value === 0) return 'root';
  if (value <= 2) return '1_2';
  if (value <= 4) return '3_4';
  if (value <= 6) return '5_6';
  if (value <= 8) return '7_8';
  return 'overflow';
}

export function noteTreeChildCountBucket(
  count: number,
): NonNullable<AiProductEventDimensions['childCountBucket']> {
  const value = Math.max(0, Math.trunc(Number(count) || 0));
  if (value === 0) return '0';
  if (value <= 3) return '1_3';
  if (value <= 10) return '4_10';
  if (value <= 50) return '11_50';
  return '51_plus';
}

export function noteTreeSubtreeSizeBucket(
  count: number,
): NonNullable<AiProductEventDimensions['subtreeSizeBucket']> {
  const value = Math.max(0, Math.trunc(Number(count) || 0));
  if (value === 0) return '0';
  if (value === 1) return '1';
  if (value <= 10) return '2_10';
  if (value <= 50) return '11_50';
  if (value <= 200) return '51_200';
  return '201_plus';
}

export function recordNoteTreeProductEvent(event: NoteTreeProductEventName, input: NoteTreeTelemetryInput) {
  const dimensions: AiProductEventDimensions = { surface: input.surface };
  if (input.depth !== undefined) dimensions.depthBucket = noteTreeDepthBucket(input.depth);
  if (input.childCount !== undefined) dimensions.childCountBucket = noteTreeChildCountBucket(input.childCount);
  if (input.subtreeSize !== undefined) dimensions.subtreeSizeBucket = noteTreeSubtreeSizeBucket(input.subtreeSize);
  if (input.durationMs !== undefined) dimensions.durationBucket = aiDurationBucket(input.durationMs);
  if (input.result) dimensions.result = input.result;
  return recordAiProductEvent(event, dimensions);
}
