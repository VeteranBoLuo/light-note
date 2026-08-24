import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const SOURCE_EXTENSIONS = new Set(['.js', '.mjs', '.cjs', '.ts', '.tsx', '.vue']);
const EXCLUDED_DIRECTORIES = new Set(['node_modules', 'dist', 'coverage', '.git']);

export const ALLOWED_GATEWAY_IMPORTERS = Object.freeze([
  'apps/server/util/aiOrganize.js',
  'apps/server/util/snapshot.js',
  'apps/server/util/tagIconService.js',
  'apps/server/util/aiSkill/model.js',
  'apps/server/util/aiSkill/structuredModel.js',
]);

export const ALLOWED_AI_ENTRY_CALLERS = Object.freeze([]);
const RAW_PROVIDER_IMPORTERS = Object.freeze({
  'apps/server/util/agent/aiGateway.js': new Set(['requestDeepSeek', 'requestDeepSeekStream']),
  'apps/server/util/agent/aiGatewayGovernance.js': new Set(['getActiveProviderInfo']),
  'apps/server/util/aiExecution/service.js': new Set(['getActiveProviderInfo']),
});

function importsModule(source, fileName) {
  const escaped = fileName.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
  return new RegExp(`(?:from\\s*|import\\s*\\(\\s*|require\\s*\\(\\s*)['\"][^'\"]*${escaped}['\"]`, 'u').test(source);
}

function importedProviderBindings(source) {
  const bindings = new Set();
  const matcher = /import\s*\{([^}]*)\}\s*from\s*['"][^'"]*deepseekClient\.js['"]/gu;
  for (const match of source.matchAll(matcher)) {
    for (const item of match[1].split(',')) {
      const original = item.trim().split(/\s+as\s+/u)[0];
      if (original) bindings.add(original);
    }
  }
  return bindings;
}

function walkFiles(directory, output = []) {
  if (!fs.existsSync(directory)) return output;
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory() && EXCLUDED_DIRECTORIES.has(entry.name)) continue;
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) walkFiles(absolute, output);
    else if (entry.isFile() && SOURCE_EXTENSIONS.has(path.extname(entry.name))) output.push(absolute);
  }
  return output;
}

function normalizeRelative(root, file) {
  return path.relative(root, file).split(path.sep).join('/');
}

function isTestOrEvaluation(relative) {
  return /(?:^|\/)(?:__tests__|evaluation|e2e)(?:\/|$)/u.test(relative) || /\.(?:test|spec)\.[^.]+$/u.test(relative);
}

export function scanAiModelAccess(
  root = REPO_ROOT,
  { gatewayImporters = ALLOWED_GATEWAY_IMPORTERS, aiEntryCallers = ALLOWED_AI_ENTRY_CALLERS } = {},
) {
  const allowedGateway = new Set(gatewayImporters);
  const allowedAiEntry = new Set(aiEntryCallers);
  const violations = [];
  const gatewayImportSnapshot = [];
  const aiEntrySnapshot = [];
  const serverFiles = walkFiles(path.join(root, 'apps/server'));
  for (const file of serverFiles) {
    const relative = normalizeRelative(root, file);
    if (isTestOrEvaluation(relative)) continue;
    const source = fs.readFileSync(file, 'utf8');
    const importsRawProvider = importsModule(source, 'deepseekClient.js');
    if (importsRawProvider) {
      const allowedBindings = RAW_PROVIDER_IMPORTERS[relative];
      const bindings = importedProviderBindings(source);
      const unsupportedBinding = [...bindings].find((binding) => !allowedBindings?.has(binding));
      if (!allowedBindings || unsupportedBinding || bindings.size === 0) {
        violations.push(`${relative}: 禁止绕过 AI Gateway 直接导入 Provider 客户端`);
      }
    }
    if (relative !== 'apps/server/util/agent/deepseekClient.js' && /\/chat\/completions/u.test(source)) {
      violations.push(`${relative}: Provider 地址只能由 deepseekClient.js 维护`);
    }
    const importsGateway = importsModule(source, 'aiGateway.js');
    if (importsGateway) {
      gatewayImportSnapshot.push(relative);
      if (!allowedGateway.has(relative)) {
        violations.push(`${relative}: 新增 AI Gateway 调用必须通过 Skill/AI Execution 评审`);
      }
    }
  }

  const webFiles = walkFiles(path.join(root, 'apps/web/src'));
  for (const file of webFiles) {
    const relative = normalizeRelative(root, file);
    if (isTestOrEvaluation(relative) || relative === 'apps/web/src/utils/aiEntry.ts') continue;
    const source = fs.readFileSync(file, 'utf8');
    if (/\bopenAiAssistant\s*\(/u.test(source)) {
      aiEntrySnapshot.push(relative);
      if (!allowedAiEntry.has(relative)) {
        violations.push(`${relative}: 禁止新增万能 AI 助手入口，请实现模块 Skill`);
      }
    }
  }

  const missingGatewaySnapshot = [...allowedGateway].filter((relative) => !gatewayImportSnapshot.includes(relative));
  const missingAiEntrySnapshot = [...allowedAiEntry].filter((relative) => !aiEntrySnapshot.includes(relative));
  return {
    violations,
    gatewayImportSnapshot: gatewayImportSnapshot.sort(),
    aiEntrySnapshot: aiEntrySnapshot.sort(),
    missingGatewaySnapshot: missingGatewaySnapshot.sort(),
    missingAiEntrySnapshot: missingAiEntrySnapshot.sort(),
  };
}

export function assertAiModelAccess(root = REPO_ROOT, options) {
  const report = scanAiModelAccess(root, options);
  if (report.violations.length) {
    const error = new Error(`AI 模型访问门禁失败：\n${report.violations.map((item) => `- ${item}`).join('\n')}`);
    error.code = 'AI_MODEL_ACCESS_GATE_FAILED';
    error.report = report;
    throw error;
  }
  return report;
}

export const aiModelAccessInternals = Object.freeze({
  importsModule,
  importedProviderBindings,
  RAW_PROVIDER_IMPORTERS,
});

const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  try {
    const report = assertAiModelAccess();
    console.log(
      'AI 模型访问门禁通过：Gateway 调用方 %d，旧助手业务入口 %d',
      report.gatewayImportSnapshot.length,
      report.aiEntrySnapshot.length,
    );
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
