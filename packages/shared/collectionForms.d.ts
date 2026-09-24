export type QuestionType =
  "short" | "long" | "single" | "multiple" | "rating" | "number" | "date";
export interface FormQuestion {
  id: string;
  type: QuestionType;
  title: string;
  required: boolean;
  options: { id: string; label: string }[];
}
export interface FormDefinition {
  title: string;
  description: string;
  successMessage: string;
  submissionPolicy?: "multiple" | "replace";
  questions: FormQuestion[];
}
export type FormAnswers = Record<string, string | number | string[]>;
export const QUESTION_TYPES: QuestionType[];
export const FORM_LIMITS: Readonly<{
  questions: number;
  options: number;
  short: number;
  long: number;
}>;
export class FormError extends Error {
  status: number;
  field: string;
  constructor(message: string, status?: number, field?: string);
}
export function validateDefinition(input: unknown): FormDefinition;
export function validateAnswers(
  definition: FormDefinition,
  input: unknown,
): FormAnswers;
export function csvCell(value: unknown): string;
