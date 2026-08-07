import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const source = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

describe('AI 后台回复生命周期契约', () => {
  it('路由视图卸载只解绑视图，不再停止或中止当前回答', () => {
    const chatSource = source('src/view/aiAssistant/ChatContainer.vue');
    const unmountBlock = chatSource.slice(
      chatSource.indexOf('onBeforeUnmount(() => {'),
      chatSource.indexOf('</script>'),
    );

    expect(unmountBlock).toContain('aiAssistant.detachView(aiViewId)');
    expect(unmountBlock).not.toContain("finalizeAiRound('stopped'");
    expect(unmountBlock).not.toContain('aiAssistant.abortActiveRequest()');
  });

  it('应用根层持续同步 AI owner 身份，账号切换不依赖 AI 页面是否挂载', () => {
    const appSource = source('src/App.vue');

    expect(appSource).toContain('aiRuntimeIdentityKey');
    expect(appSource).toContain('if (!aiAssistant.initialized) return');
    expect(appSource).toContain("aiAssistant.abortActiveRequest('app_shutdown')");
  });

  it('移动端底栏展示生成与终态提示，进入 AI 工作区后确认已读', () => {
    const navSource = source('src/components/mobile/MobileBottomNav.vue');
    const workspaceSource = source('src/view/aiAssistant/MobileAiWorkspace.vue');

    expect(navSource).toContain('mobile-bottom-nav__ai-status');
    expect(navSource).toContain("aiEdgeStatus === 'generating'");
    expect(workspaceSource).toContain('aiAssistant.acknowledgeEdgeStatus()');
  });
});
