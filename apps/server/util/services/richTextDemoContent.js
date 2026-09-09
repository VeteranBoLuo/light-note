/** Shared, sanitizer-compatible rich text demonstration. */
export function buildRichTextDemoContent({
  referencesHtml = '<ul><li>书签：{{ref:bookmark:help}}、{{ref:bookmark:co-build}}</li><li>笔记：{{ref:note:welcome}}、{{ref:note:first-note}}</li></ul>',
} = {}) {
  return (
    '<h1 class="ln-text-gradient" data-ln-text-gradient="true" style="--ln-gradient-from:#615ced;--ln-gradient-to:#00a884;--ln-gradient-angle:90deg;text-align:center;">富文本样式示例</h1>' +
    '<p style="text-align: center; color: #6b7280;">这一篇演示轻笺富文本的进阶排版：自定义渐变、发光、动画与配色。</p>' +
    '<hr>' +
    '<h2 class="ln-text-gradient" data-ln-text-gradient="true" style="--ln-gradient-from:#615ced;--ln-gradient-to:#ec4899;--ln-gradient-angle:90deg;">渐变与发光</h2>' +
    '<p><span class="ln-text-gradient" data-ln-text-gradient="true" style="--ln-gradient-from:#615ced;--ln-gradient-to:#00a884;--ln-gradient-angle:135deg;font-size:22px;font-weight:bold;">渐变文字：在「更多格式 → 渐变文字」中自定义两端颜色与方向</span></p>' +
    '<p><span class="ln-rich-text-glow" style="color:#615ced;font-size:20px;font-weight:bold;">发光文字：像霓虹灯一样亮起来</span></p>' +
    '<h2>渐变卡片</h2>' +
    '<p class="ln-rich-card" style="--ln-gradient-from:#615ced;--ln-gradient-to:#764ba2;--ln-gradient-angle:135deg;color:#ffffff;padding:20px 24px;"><strong style="font-size:18px;">紫色渐变卡片</strong><br>白字配深色渐变底，圆角加柔和投影，内容区立刻有了层次。</p>' +
    '<p class="ln-rich-card" style="--ln-gradient-from:#00a884;--ln-gradient-to:#0d9488;--ln-gradient-angle:135deg;color:#ffffff;padding:20px 24px;"><strong style="font-size:18px;">绿色渐变卡片</strong><br>同一套排版换一个配色，就是完全不同的气质。</p>' +
    '<h2>动画效果</h2>' +
    '<p>呼吸发光：<span class="ln-rich-effect-breathe" style="--ln-gradient-from:#615ced;--ln-gradient-to:#00a884;--ln-gradient-angle:90deg;color:#ffffff;padding:6px 18px;font-weight:bold;">同步进行中</span></p>' +
    '<p>旋转指示：<span class="ln-rich-effect-spin">&nbsp;</span>　加载中的转圈也能这样画</p>' +
    '<p>漂浮移动：<span class="ln-rich-effect-float" style="font-size:26px;">🪁</span>　风筝在页面里慢慢飘</p>' +
    '<h2>渐变边框</h2>' +
    '<p class="ln-rich-gradient-border" style="padding:16px 20px;">受控语义样式负责画边框，浅色深色主题都能稳定显示。</p>' +
    '<h2>引用资源</h2>' +
    '<p>正文里输入 @ 或点工具栏「引用资源」，就能把书签、笔记嵌进文字，点击直达：</p>' +
    referencesHtml +
    '<h2>彩色列表</h2>' +
    '<ul><li><span style="color: #615ced; font-weight: bold;">书签</span> — 一键收藏，自动提取摘要与截图</li><li><span style="color: #00a884; font-weight: bold;">笔记</span> — 富文本 / Markdown 双模式</li><li><span style="color: #ff8a00; font-weight: bold;">云空间</span> — 文件直传直看</li></ul>' +
    '<h2>渐变表格</h2>' +
    '<table style="width:100%;border-collapse:collapse;"><thead><tr><th class="ln-rich-gradient-fill" style="--ln-gradient-from:#615ced;--ln-gradient-to:#764ba2;--ln-gradient-angle:135deg;color:#ffffff;padding:10px;">效果</th><th class="ln-rich-gradient-fill" style="--ln-gradient-from:#615ced;--ln-gradient-to:#764ba2;--ln-gradient-angle:135deg;color:#ffffff;padding:10px;">实现方式</th></tr></thead><tbody><tr><td style="border:1px solid #d1d5db;padding:10px;">渐变文字</td><td style="border:1px solid #d1d5db;padding:10px;">受控颜色与方向</td></tr><tr><td style="border:1px solid #d1d5db;padding:10px;">呼吸与旋转</td><td style="border:1px solid #d1d5db;padding:10px;">应用内置动画</td></tr></tbody></table>' +
    '<h2>彩色引用</h2>' +
    '<blockquote class="ln-rich-quote" style="border-left:4px solid #615ced;background-color:#f3f1ff;padding:12px 16px;margin:0;">把每一次收藏与记录都留在这里，在你需要的时候重新派上用场。</blockquote>' +
    '<hr>' +
    '<p style="text-align:center;"><span class="ln-text-gradient" data-ln-text-gradient="true" style="--ln-gradient-from:#ff8a00;--ln-gradient-to:#ec4899;--ln-gradient-angle:90deg;font-size:18px;font-weight:bold;">—— 富文本的想象力，远不止黑白 ——</span></p>'
  );
}
