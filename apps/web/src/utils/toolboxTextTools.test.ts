import { describe, expect, it } from 'vitest';
import { parseDelimitedTable, serializeTable } from './toolboxTextTools';

describe('工具箱文本与表格本地内核', () => {
  it('正确解析包含逗号、换行和双引号的 CSV', () => {
    expect(parseDelimitedTable('名称,说明\n"轻笺,工具箱","第一行\n第二行"\n"双""引号",完成', ',')).toEqual([
      ['名称', '说明'],
      ['轻笺,工具箱', '第一行\n第二行'],
      ['双"引号', '完成'],
    ]);
  });

  it('序列化时转义分隔符，并为重复或空表头生成稳定字段名', () => {
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
  });
});
