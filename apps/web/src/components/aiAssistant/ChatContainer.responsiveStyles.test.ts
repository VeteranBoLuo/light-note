import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = (relativePath: string) => readFileSync(resolve(process.cwd(), relativePath), 'utf8');

const chatContainerSource = source('src/view/aiAssistant/ChatContainer.vue');
const chatInputSource = source('src/components/aiAssistant/ChatInputSection.vue');
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

  it('keeps the mobile send action compact without shrinking the neighboring touch controls', () => {
    expect(chatInputSource).toContain('.input-actions :deep(.b_btn:not(.send-btn))');
    expect(chatInputSource).toMatch(/\.send-btn\s*\{\s*min-width:\s*54px;\s*min-height:\s*40px;\s*height:\s*40px;/);
  });

  it('keeps the mobile material entry aligned with the compact send action', () => {
    expect(chatInputSource).toMatch(
      /\.mobile-context-toggle\s*\{[\s\S]*?height:\s*40px\s*!important;\s*min-height:\s*40px;/,
    );
    expect(chatInputSource).toMatch(
      /\.mobile-context-toggle__icon\s*\{[\s\S]*?flex:\s*0 0 28px;\s*width:\s*28px;\s*height:\s*28px;/,
    );
  });
});
