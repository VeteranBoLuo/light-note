import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = (relativePath: string) => readFileSync(resolve(process.cwd(), relativePath), 'utf8');

const chatContainerSource = source('src/view/aiAssistant/ChatContainer.vue');
const chatInputSource = source('src/components/aiAssistant/ChatInputSection.vue');
const materialHubSource = source('src/components/aiAssistant/AiMaterialHub.vue');
const childSources = [
  source('src/components/aiAssistant/AiInteractionCard.vue'),
  source('src/components/aiAssistant/AiActivitySummary.vue'),
  source('src/components/aiAssistant/AiResultActions.vue'),
];

describe('ChatContainer narrow responsive styles', () => {
  it('keeps cross-component narrow rules under the scoped chat container', () => {
    expect(chatContainerSource).toContain('.chat-wrapper.is-narrow-520 :deep(.ai-interaction-card)');
    expect(chatContainerSource).toContain('.chat-wrapper.is-narrow-520 :deep(.ai-activity)');
    expect(chatContainerSource).toContain('.chat-wrapper.is-narrow-520 :deep(.ai-result-actions)');
  });

  it('does not declare chat-wrapper selectors from child scoped styles', () => {
    childSources.forEach((childSource) => {
      expect(childSource).not.toContain(':global(.chat-wrapper.is-narrow-520)');
    });
  });

  it('keeps all mobile composer actions at the same compact height', () => {
    expect(chatInputSource).toContain('--ai-composer-action-height: 40px');
    expect(chatInputSource).toContain('.input-actions :deep(.b_btn)');
    expect(chatInputSource).not.toContain('.input-actions :deep(.b_btn:not(.send-btn))');
    expect(chatInputSource).toMatch(
      /\.input-actions :deep\(\.b_btn\)\s*\{[\s\S]*?min-height:\s*var\(--ai-composer-action-height\)[\s\S]*?height:\s*var\(--ai-composer-action-height\)/,
    );
  });

  it('keeps selected materials and the fixed add action in independent grid columns', () => {
    expect(materialHubSource).toContain('grid-template-columns: minmax(0, 1fr) auto');
    expect(materialHubSource).toContain('.ai-material-hub__chips');
    expect(materialHubSource).toContain('.ai-material-hub__trigger');
    expect(materialHubSource).not.toContain('display: contents');
    expect(materialHubSource).toMatch(
      /@media \(max-width: 767px\)[\s\S]*?\.ai-material-hub__trigger\s*\{[\s\S]*?min-height:\s*34px;/,
    );
  });
});
