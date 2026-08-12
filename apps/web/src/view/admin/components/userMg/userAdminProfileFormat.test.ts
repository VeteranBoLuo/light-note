import { describe, expect, it } from 'vitest';
import { formatAdminLocation, resolveAdminLoginMethod } from './userAdminProfileFormat';

describe('后台用户资料展示格式', () => {
  it('将定位 JSON 收敛为行政区层级，不展示经纬度矩形', () => {
    expect(
      formatAdminLocation(
        JSON.stringify({
          city: '伊犁哈萨克自治州',
          province: '新疆维吾尔自治区',
          rectangle: '81.29983664,43.90819685;81.34675384,43.94030472',
        }),
      ),
    ).toEqual(['新疆维吾尔自治区', '伊犁哈萨克自治州']);
  });

  it('兼容普通地区文本、空值和重复层级', () => {
    expect(formatAdminLocation('广东省 深圳市')).toEqual(['广东省 深圳市']);
    expect(formatAdminLocation({ province: '北京市', city: '北京市' })).toEqual(['北京市']);
    expect(formatAdminLocation('')).toEqual([]);
  });

  it('把内部登录枚举转换为稳定的展示语义', () => {
    expect(resolveAdminLoginMethod('local')).toBe('password');
    expect(resolveAdminLoginMethod('github')).toBe('github');
    expect(resolveAdminLoginMethod('legacy')).toBe('unknown');
  });
});
