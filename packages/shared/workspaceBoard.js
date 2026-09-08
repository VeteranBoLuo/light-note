export const BOARD_LANES = ["inbox", "knowledge", "action"];
export function boardConversion(from, to) {
  if (!BOARD_LANES.includes(from) || !BOARD_LANES.includes(to) || from === to)
    return null;
  if (to === "action") return "derive";
  if (from === "action" && to === "knowledge") return "result";
  return "move";
}
const fail = (code) => {
  throw Object.assign(new Error(code), { code, status: 400 });
};
function text(value, max, required = false) {
  if (
    typeof value !== "string" ||
    value.length > max ||
    (required && !value.trim())
  )
    fail("BOARD_INVALID_CONTENT");
  return required ? value.trim() : value;
}
function fields(input, fallback = {}) {
  const dueOn =
    input.dueOn === undefined ? fallback.dueOn || null : input.dueOn;
  if (
    dueOn !== null &&
    (typeof dueOn !== "string" ||
      !/^\d{4}-\d{2}-\d{2}$/.test(dueOn) ||
      !Number.isFinite(Date.parse(dueOn)) ||
      new Date(dueOn).toISOString().slice(0, 10) !== dueOn)
  )
    fail("BOARD_INVALID_DATE");
  return {
    title: text(input.title ?? fallback.title, 255, true),
    content: text(input.content ?? fallback.content ?? "", 5000),
    dueOn,
  };
}
export function applyBoardOperation(items, command, { id, now }) {
  const rows = structuredClone(items);
  const find = (key) => {
    const item = rows.find((x) => x.id === key && x.status !== "archived");
    if (!item) fail("BOARD_ITEM_UNAVAILABLE");
    return item;
  };
  const status = (item, value) => {
    item.status = value;
    item.completedAt = value === "done" ? item.completedAt || now : null;
  };
  const append = (lane, input, source) => {
    if (!BOARD_LANES.includes(lane)) fail("BOARD_INVALID_LANE");
    if (rows.filter((x) => x.status !== "archived").length >= 500)
      fail("BOARD_ITEM_LIMIT");
    const item = {
      id,
      lane,
      ...fields(input),
      status: lane === "knowledge" ? "done" : "open",
      position: rows.filter((x) => x.lane === lane).length,
      createdAt: now,
      updatedAt: now,
      completedAt: lane === "knowledge" ? now : null,
      sourceItemId: source?.id || null,
      sourceTitle: source?.title || "",
      sourceContent: source?.content || "",
    };
    rows.push(item);
    return item;
  };
  let focusItemId = command.itemId || null;
  if (command.type === "create") focusItemId = append(command.lane, command).id;
  else if (command.type === "reorder") {
    const lane = command.lane;
    if (!BOARD_LANES.includes(lane)) fail("BOARD_INVALID_LANE");
    const current = rows.filter(
      (x) => x.lane === lane && x.status !== "archived",
    );
    if (
      !Array.isArray(command.ids) ||
      new Set(command.ids).size !== current.length ||
      command.ids.length !== current.length ||
      current.some((x) => !command.ids.includes(x.id))
    )
      fail("BOARD_INVALID_ORDER");
    command.ids.forEach((key, index) => {
      find(key).position = index;
    });
  } else {
    const item = find(command.itemId);
    if (command.type === "edit") Object.assign(item, fields(command, item));
    else if (command.type === "status") {
      if (!["open", "in_progress", "done", "archived"].includes(command.status))
        fail("BOARD_INVALID_STATUS");
      if (item.lane === "knowledge" && command.status !== "archived")
        fail("BOARD_INVALID_STATUS");
      status(item, command.status);
    } else if (command.type === "convert") {
      const mode = boardConversion(item.lane, command.lane);
      if (!mode) fail("BOARD_INVALID_CONVERSION");
      if (mode === "move") {
        Object.assign(item, fields(command, item), {
          lane: command.lane,
          position: rows.filter((x) => x.lane === command.lane).length,
        });
        status(item, command.lane === "knowledge" ? "done" : "open");
      } else {
        focusItemId = append(
          command.lane,
          { ...fields(command, item), dueOn: command.dueOn ?? null },
          item,
        ).id;
        if (mode === "result") status(item, "done");
      }
    } else if (command.type === "repeat") {
      if (item.lane !== "action" || item.status !== "done")
        fail("BOARD_INVALID_CONVERSION");
      focusItemId = append(
        "action",
        { ...fields(command, item), dueOn: command.dueOn ?? null },
        item,
      ).id;
    } else fail("BOARD_INVALID_OPERATION");
  }
  if (
    command.targetIndex !== undefined &&
    ["convert", "repeat"].includes(command.type)
  ) {
    if (!Number.isInteger(command.targetIndex) || command.targetIndex < 0)
      fail("BOARD_INVALID_ORDER");
    const focused = rows.find((x) => x.id === focusItemId);
    const target = rows
      .filter(
        (x) =>
          x.lane === focused.lane &&
          x.status !== "archived" &&
          x.id !== focused.id,
      )
      .sort((a, b) => a.position - b.position);
    if (command.targetIndex > target.length) fail("BOARD_INVALID_ORDER");
    target.splice(command.targetIndex, 0, focused);
    target.forEach((x, i) => {
      x.position = i;
    });
  }
  for (const lane of BOARD_LANES)
    rows
      .filter((x) => x.lane === lane && x.status !== "archived")
      .sort(
        (a, b) =>
          a.position - b.position ||
          a.createdAt.localeCompare(b.createdAt) ||
          a.id.localeCompare(b.id),
      )
      .forEach((x, i) => {
        x.position = i;
      });
  for (const row of rows) {
    const old = items.find((x) => x.id === row.id);
    if (!old || JSON.stringify(old) !== JSON.stringify(row))
      row.updatedAt = now;
  }
  return { items: rows, focusItemId };
}
