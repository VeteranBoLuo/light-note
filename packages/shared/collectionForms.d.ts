export type QuestionType =
  "short" | "long" | "single" | "multiple" | "rating" | "number" | "date";
export interface FormQuestion {
  id: string;
  type: QuestionType;
  title: string;
  required: boolean;
  options: { id: string; label: string }[];
  allowOther?: boolean;
}
export interface FormDefinition {
  title: string;
  description: string;
  successMessage: string;
  notifyOnSubmission?: boolean;
  submissionPolicy?: "multiple" | "replace";
  membersOnly?: boolean;
  reward?: { points: number; maxRecipients: number } | null;
  questions: FormQuestion[];
}
export interface OtherChoiceAnswer {
  optionIds: string[];
  otherText: string;
}
export type FormAnswer = string | number | string[] | OtherChoiceAnswer;
export type FormAnswers = Record<string, FormAnswer>;
export const OTHER_OPTION_ID: string;
export function choiceAnswerParts(value: unknown): {
  optionIds: string[];
  otherText: string | null;
};
export const QUESTION_TYPES: QuestionType[];
export const FORM_LIMITS: Readonly<{
  questions: number;
  options: number;
  short: number;
  long: number;
  rewardPoints: number;
  rewardRecipients: number;
}>;
export class FormError extends Error {
  status: number;
  field: string;
  code?: string;
  constructor(message: string, status?: number, field?: string, code?: string);
}
export function validateDefinition(input: unknown): FormDefinition;
export function validateAnswers(
  definition: FormDefinition,
  input: unknown,
): FormAnswers;
export function csvCell(value: unknown): string;
