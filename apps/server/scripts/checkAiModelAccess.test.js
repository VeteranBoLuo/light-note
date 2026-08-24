import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { scanAiModelAccess } from './checkAiModelAccess.js';

const temporaryDirectories = [];

function fixture(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'light-note-ai-gate-'));
  temporaryDirectories.push(root);
  for (const [relative, content] of Object.entries(files)) {
    const absolute = path.join(root, relative);
    fs.mkdirSync(path.dirname(absolute), { recursive: true });
    fs.writeFileSync(absolute, content);
  }
  return root;
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) fs.rmSync(directory, { recursive: true, force: true });
});

describe('checkAiModelAccess', () => {
  it('拒绝裸 Provider、未登记 Gateway 调用方和新的万能入口', () => {
    const root = fixture({
      'apps/server/util/bypass.js': "import { requestDeepSeek } from './agent/deepseekClient.js';",
      'apps/server/util/newFeature.js': "import { requestAi } from './agent/aiGateway.js';",
      'apps/web/src/view/NewFeature.vue': '<script setup>openAiAssistant({ intent: "ask" })</script>',
    });
    const report = scanAiModelAccess(root, { gatewayImporters: [], aiEntryCallers: [] });
    expect(report.violations).toHaveLength(3);
  });

  it('拒绝 Provider 别名、命名空间、动态导入和自建 chat completions 地址', () => {
    const root = fixture({
      'apps/server/util/alias.js': "import { requestDeepSeek as complete } from './agent/deepseekClient.js';",
      'apps/server/util/namespace.js': "import * as provider from './agent/deepseekClient.js';",
      'apps/server/util/dynamic.js': "const provider = await import('./agent/deepseekClient.js');",
      'apps/server/util/directFetch.js': "fetch('https://example.com/v1/chat/completions');",
    });
    const report = scanAiModelAccess(root, { gatewayImporters: [], aiEntryCallers: [] });
    expect(report.violations).toHaveLength(4);
  });

  it('Provider 信息读取只能使用白名单导出，不能借白名单文件调用模型', () => {
    const root = fixture({
      'apps/server/util/agent/aiGateway.js':
        "import { requestDeepSeek, requestDeepSeekStream } from './deepseekClient.js';",
      'apps/server/util/agent/aiGatewayGovernance.js': "import { requestDeepSeek } from './deepseekClient.js';",
      'apps/server/util/aiExecution/service.js': "import { getActiveProviderInfo } from '../agent/deepseekClient.js';",
    });
    const report = scanAiModelAccess(root, { gatewayImporters: [], aiEntryCallers: [] });
    expect(report.violations).toEqual([
      'apps/server/util/agent/aiGatewayGovernance.js: 禁止绕过 AI Gateway 直接导入 Provider 客户端',
    ]);
  });

  it('允许显式快照中的迁移期调用点', () => {
    const root = fixture({
      'apps/server/util/legacy.js': "import { requestAi } from './agent/aiGateway.js';",
      'apps/web/src/view/Legacy.vue': '<script setup>openAiAssistant({ intent: "ask" })</script>',
    });
    const report = scanAiModelAccess(root, {
      gatewayImporters: ['apps/server/util/legacy.js'],
      aiEntryCallers: ['apps/web/src/view/Legacy.vue'],
    });
    expect(report.violations).toEqual([]);
    expect(report.missingGatewaySnapshot).toEqual([]);
    expect(report.missingAiEntrySnapshot).toEqual([]);
  });
});
