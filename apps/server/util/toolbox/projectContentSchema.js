import crypto from 'node:crypto';
import {
  PRODUCTION_PROJECT_CHANGE_KINDS,
  PRODUCTION_PROJECT_CONFLICT_CODES,
  PRODUCTION_PROJECT_STATUSES,
  PRODUCTION_PROJECT_TYPES,
  ProductionProjectProtocolError,
  createEmptyProductionProjectContent,
  normalizeProductionProjectContent,
  normalizeProductionProjectCreateRequest,
  normalizeProductionProjectMetadata,
  normalizeProductionProjectRestoreRequest,
  normalizeProductionProjectRevisionRequest,
  normalizeProductionProjectType,
  normalizeProductionProjectUpdateRequest,
} from '@lightnote/shared/production-project-protocol';
import { toolboxError } from './errors.js';

export { PRODUCTION_PROJECT_CHANGE_KINDS as TOOLBOX_PROJECT_CHANGE_KINDS };
export { PRODUCTION_PROJECT_CONFLICT_CODES as TOOLBOX_PROJECT_CONFLICT_CODES };
export { PRODUCTION_PROJECT_STATUSES as TOOLBOX_PROJECT_STATUSES };
export { PRODUCTION_PROJECT_TYPES as TOOLBOX_PROJECT_TYPES };
export { normalizeProductionProjectType };

function mapProtocolError(error) {
  if (!(error instanceof ProductionProjectProtocolError)) throw error;
  throw toolboxError(error.code, '项目内容或参数格式无效', error.status || 400, { protocolMessage: error.message });
}

function mapped(normalizer, ...args) {
  try {
    return normalizer(...args);
  } catch (error) {
    return mapProtocolError(error);
  }
}

export function validateProductionProjectContent(projectType, value) {
  const source = value ?? mapped(createEmptyProductionProjectContent, projectType);
  const content = mapped(normalizeProductionProjectContent, source, projectType);
  const serialized = JSON.stringify(content);
  return {
    content,
    serialized,
    contentBytes: Buffer.byteLength(serialized, 'utf8'),
    contentHash: crypto.createHash('sha256').update(serialized).digest('hex'),
    schemaVersion: content.schemaVersion,
  };
}

export const normalizeProjectCreateRequest = (input) => mapped(normalizeProductionProjectCreateRequest, input);
export const normalizeProjectUpdateRequest = (input) => mapped(normalizeProductionProjectUpdateRequest, input);
export const normalizeProjectRevisionRequest = (input, projectType) =>
  mapped(normalizeProductionProjectRevisionRequest, input, projectType);
export const normalizeProjectRestoreRequest = (input) => mapped(normalizeProductionProjectRestoreRequest, input);
export const normalizeProjectMetadata = (input) => mapped(normalizeProductionProjectMetadata, input);
export const createEmptyProjectContent = (projectType) => mapped(createEmptyProductionProjectContent, projectType);
