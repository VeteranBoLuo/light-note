import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const directory = dirname(fileURLToPath(import.meta.url));
const settings = readFileSync(resolve(directory, 'Settings.vue'), 'utf8');
const source = readFileSync(resolve(directory, '../../components/notification/BrowserPushQuietHoursSettings.vue'), 'utf8');

describe('设置页时间输入', () => {
  it('免打扰起止时间复用共享时间组件，不再唤起浏览器原生时间面板', () => {
    expect(settings).toContain('<BrowserPushQuietHoursSettings');
    expect(source.match(/<BTimePicker/g)).toHaveLength(2);
    expect(source).toContain("setNotificationTime('notificationsDndStart'");
    expect(source).toContain("setNotificationTime('notificationsDndEnd'");
    expect(source).not.toContain('type="time"');
  });
});
