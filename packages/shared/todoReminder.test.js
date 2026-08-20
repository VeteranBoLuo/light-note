import { describe, expect, it } from "vitest";
import {
  resolveTodoConfiguredReminderAt,
  resolveTodoNextReminderAt,
  resolveTodoReminderAt,
} from "./todoReminder.js";

describe("共享待办提醒投影", () => {
  it("提醒已经投递后仍从周期实例规则还原原定时间", () => {
    const item = {
      occurrenceDate: "2026-08-20",
      reminder: {
        mode: "once_per_instance",
        trigger: { type: "fixed_time", fixedTime: "16:00" },
        nextAt: null,
      },
    };

    expect(resolveTodoNextReminderAt(item)).toBe("");
    expect(resolveTodoConfiguredReminderAt(item)).toBe("2026-08-20T16:00:00");
    expect(resolveTodoReminderAt(item)).toBe("2026-08-20T16:00:00");
  });

  it("有下一次实际投递时间时优先返回它，暂停时不返回", () => {
    const active = {
      reminder: {
        mode: "nudge",
        trigger: { type: "fixed_time", fixedTime: "16:00" },
        nextAt: "2026-08-20 17:00:00",
      },
      occurrenceDate: "2026-08-20",
    };
    expect(resolveTodoReminderAt(active)).toBe("2026-08-20 17:00:00");
    expect(
      resolveTodoReminderAt({
        ...active,
        reminder: { ...active.reminder, paused: true },
      }),
    ).toBe("");
  });
});
