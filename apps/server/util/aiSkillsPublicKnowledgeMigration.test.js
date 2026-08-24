import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const migrationUrl = new URL(
  '../migrations/20260824_ai_skills_public_knowledge_refresh.sql',
  import.meta.url,
);
const mobileSeedUrl = new URL('../scripts/seedMobileTodaySearchKnowledge.js', import.meta.url);

describe('模块化 AI 公开帮助知识迁移', () => {
  it('覆盖当前模块入口、材料边界和真实产品语义', async () => {
    const source = await readFile(fileURLToPath(migrationUrl), 'utf8');

    expect(source).toContain('不再提供跨模块自由聊天和操作的全局助手');
    expect(source).toContain('生成新笔记”成功后会立即创建并打开一篇已保存的笔记');
    expect(source).toContain('智能打标签');
    expect(source).toContain('网页存档免费保存完整正文；AI 摘要需在已有正文后由用户另行明确生成');
    expect(source).toContain('TXT、Markdown、CSV、PDF、DOCX、PNG、JPG/JPEG 和 WebP');
    expect(source).toContain('单张图片：提取并总结可识别文字');
    expect(source).toContain('简洁模式生成 3～5 步，详细模式生成 6～10 步');
    expect(source).toContain('帮助中心的“问问轻笺助手”只回答轻笺产品怎么使用');
    expect(source).toContain('今日等级额度');
    expect(source).toContain('永久加油余额');
    expect(source).toContain('当前总可用');
    expect(source).toContain('受限协议修复由平台承担');
    expect(source).not.toContain('不需要先抓取正文再单独点击 AI 摘要');
  });

  it('以固定目标、事务和幂等条件更新，并归档旧助手文档', async () => {
    const source = await readFile(fileURLToPath(migrationUrl), 'utf8');

    expect(source).toContain('START TRANSACTION;');
    expect(source).toContain('COMMIT;');
    expect(source).toContain('WHERE NOT EXISTS (SELECT 1 FROM knowledge_base WHERE id = @help_ai_id)');
    expect(source).toContain('WHERE id = @help_ai_target_id');
    expect(source).toContain("SET status = 'internal', admin_archived = 1");
    expect(source).toContain('de09dedf-e0d4-43d1-a80d-12986461c875');
    expect(source).toContain('4d3558be-d784-4d4c-8772-5cc690ce07fa');
    expect(source).toContain('95b7a657-9415-4a05-a899-8d5a033caa4f');
    expect(source).toContain('93aa8c5e-26ae-4201-8fa6-1701e47783ee');
    expect(source).toContain('82c256c3-a44c-4699-8d23-00b352e8ba0c');
    expect(source).toContain('ba1debba-8017-4922-bc90-0207593af5b7');
    expect(source).toContain('20bc9db9-5663-410b-a1df-a20c3b780e3a');
  });

  it('移动端种子脚本不会重新写回旧全局 AI 入口', async () => {
    const source = await readFile(fileURLToPath(mobileSeedUrl), 'utf8');

    expect(source).toContain('今日、资料、快速添加、待办、聊天室');
    expect(source).toContain('模块 AI 只在当前笔记、书签、文件、待办、资源中心或帮助中心内出现');
    expect(source).not.toContain('今日、资料、AI、待办、聊天室');
    expect(source).not.toContain('轻笺智域问答');
    expect(source).not.toContain('AI 仍在底部中间');
  });
});
