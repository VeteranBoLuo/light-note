import { describe, expect, it } from 'vitest';
import {
  compareTextLines,
  convertMarkup,
  convertTable,
  parseDelimitedTable,
  parseTable,
  serializeTable,
  ToolboxTextError,
} from './toolboxTextTools';

describe('工具箱文本与表格本地内核', () => {
  it('按行对比文本，并把相邻删除和新增配对为修改', () => {
    const result = compareTextLines('标题\n旧结论\n保留', '标题\n新结论\n保留\n补充', {
      ignoreCase: false,
      ignoreWhitespace: false,
    });

    expect(result.rows.map((row) => row.kind)).toEqual(['equal', 'changed', 'equal', 'added']);
    expect(result.rows[1]).toMatchObject({ leftLine: 2, rightLine: 2, left: '旧结论', right: '新结论' });
    expect(result.stats).toEqual({ unchanged: 2, changed: 1, added: 1, removed: 0 });
  });

  it('可忽略大小写与多余空白，并限制过于复杂的对比', () => {
    const result = compareTextLines('Light   Note', ' light note ', {
      ignoreCase: true,
      ignoreWhitespace: true,
    });
    expect(result.stats.unchanged).toBe(1);

    const large = Array.from({ length: 1_500 }, (_, index) => `line-${index}`).join('\n');
    expect(() => compareTextLines(large, large, { ignoreCase: false, ignoreWhitespace: false })).toThrowError(
      expect.objectContaining<ToolboxTextError>({ code: 'DIFF_TOO_COMPLEX' }),
    );
  });

  it('正确解析包含逗号、换行和双引号的 CSV', () => {
    expect(parseDelimitedTable('名称,说明\n"轻笺,工具箱","第一行\n第二行"\n"双""引号",完成', ',')).toEqual([
      ['名称', '说明'],
      ['轻笺,工具箱', '第一行\n第二行'],
      ['双"引号', '完成'],
    ]);
  });

  it('在 CSV、JSON 与 Markdown 表格间转换并保留结构', () => {
    const markdown = convertTable('名称,状态\n研究简报,完成\n需求清单,待核验', 'csv', 'markdown');
    expect(markdown).toMatchObject({ rows: 2, columns: 2 });
    expect(markdown.output).toContain('| 研究简报 | 完成 |');

    const json = convertTable(markdown.output, 'markdown', 'json');
    expect(JSON.parse(json.output)).toEqual([
      { 名称: '研究简报', 状态: '完成' },
      { 名称: '需求清单', 状态: '待核验' },
    ]);
    expect(parseTable('[{"名称":"轻笺","标签":["知识","工具"]}]', 'json')).toEqual([
      ['名称', '标签'],
      ['轻笺', '["知识","工具"]'],
    ]);
  });

  it('序列化时转义分隔符，并拒绝无效输入或相同格式', () => {
    expect(
      serializeTable(
        [
          ['标题', '说明'],
          ['轻笺', '包含,逗号'],
        ],
        'csv',
      ),
    ).toBe('标题,说明\n轻笺,"包含,逗号"');
    expect(
      JSON.parse(
        serializeTable(
          [
            ['状态', '状态', ''],
            ['完成', '待核验', '备注'],
          ],
          'json',
        ),
      ),
    ).toEqual([{ 状态: '完成', 状态_2: '待核验', column_3: '备注' }]);
    expect(() => parseTable('{"not":"array"}', 'json')).toThrowError(
      expect.objectContaining<ToolboxTextError>({ code: 'INVALID_JSON' }),
    );
    expect(() => convertTable('a,b', 'csv', 'csv')).toThrowError(
      expect.objectContaining<ToolboxTextError>({ code: 'SAME_FORMAT' }),
    );
  });

  it('Markdown 转 HTML 复用统一清洗管线，HTML 也可转回 Markdown', async () => {
    const html = await convertMarkup('# 标题\n\n<script>alert(1)</script>\n\n- 条目', 'markdown_to_html');
    expect(html).toContain('<h1');
    expect(html).toContain('条目');
    expect(html).not.toContain('<script');

    const markdown = await convertMarkup('<h2>结论</h2><p><strong>保留</strong>结构</p>', 'html_to_markdown');
    expect(markdown).toContain('## 结论');
    expect(markdown).toContain('**保留**');
  });
});
