-- 2026-08-19 方形手绘画布与手动历史版本帮助文档（MySQL 5.7 兼容、幂等）
-- 仅更新 knowledge_base 业务内容，不修改表结构，也不随部署脚本自动执行。

SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci;
START TRANSACTION;

SET @drawing_square_marker = 'data-ln-feature="drawing-square-v2"';
SET @drawing_square_section_start = '<section data-ln-feature="drawing-square-v2">';
SET @drawing_square_section_end = '</section>';
SET @drawing_square_section = '<section data-ln-feature="drawing-square-v2"><h3>方形手绘画布与保存版本</h3><p>手绘笔记现在使用正方形画纸。进入编辑时，宽屏默认以 100% 显示，窄屏才按当前窗口的可用宽度自动缩小并居中，不会产生横向滚动条；画纸高度超出时可使用手形工具平移查看四边，也可以在任意工具下按住鼠标中键或右键直接拖动画布。鼠标滚轮上下会以指针所在位置为中心连续缩放，横向滚动或 Shift+滚轮可以左右平移。工具栏问号会集中说明键盘和鼠标操作。</p><p>形状工具提供直线、箭头、矩形、圆角矩形、椭圆、三角形和菱形；拖动创建时按住 Shift 可以约束比例或角度。切换到选择工具后可移动形状，并通过端点或四角手柄缩放，Delete 删除；橡皮擦只局部擦除手绘笔画。颜色与尺寸合并在“样式”面板，提供常用色、完整色板、最近使用和自定义十六进制颜色。</p><p>文字工具完成输入后不会继续显示选择虚线；需要调整文字时再切换到选择工具。批量框选会显示一个组合边框，按住边框内部的空白区域也可以整体拖动全部已选内容。</p><p>旧的竖版手绘会自动居中显示在方形画纸中，不会缩放、拉伸或裁剪原有内容。编辑、预览、历史版本和分享页使用相同的方形比例。进入直接预览时会先把画纸中心对齐到阅读区中部，仍可上下滚动查看完整画纸。笔记库卡片会智能居中突出绘画内容，但取景最多放大到完整画纸缩略图的 3 倍，因此正常绘画更容易辨认，单个小点也不会被放大铺满预览区。</p><p>笔记会继续自动保存。如果希望立即留下一个可恢复的历史点，点击右上角“保存版本”，或按 Command/Ctrl+S。该操作会先保存当前修改，再将已保存内容加入历史版本。</p></section>';

UPDATE knowledge_base
SET content = CASE
      WHEN LOCATE(@drawing_square_marker, COALESCE(content, '')) = 0
        THEN CONCAT(COALESCE(content, ''), @drawing_square_section)
      WHEN LOCATE(@drawing_square_section_start, COALESCE(content, '')) > 0
       AND LOCATE(
             @drawing_square_section_end,
             COALESCE(content, ''),
             LOCATE(@drawing_square_section_start, COALESCE(content, ''))
           ) > 0
        THEN CONCAT(
          LEFT(
            content,
            LOCATE(@drawing_square_section_start, content) - 1
          ),
          @drawing_square_section,
          SUBSTRING(
            content,
            LOCATE(
              @drawing_square_section_end,
              content,
              LOCATE(@drawing_square_section_start, content)
            ) + CHAR_LENGTH(@drawing_square_section_end)
          )
        )
      ELSE content
    END,
    updated_by = NULL
WHERE id = '808f738e-3d5c-11f1-b2ac-fa163e50acdb' OR title = '笔记管理';

COMMIT;

SELECT id, title, status, type, CHAR_LENGTH(content) AS content_length
FROM knowledge_base
WHERE id = '808f738e-3d5c-11f1-b2ac-fa163e50acdb' OR title = '笔记管理';

-- 执行后需重启后端：知识检索有进程内缓存，新内容才会立即生效。
