export const COMPARISON_CELL_MAX_CHARS = 1000;
export function comparisonCellNeedsReview(cell) {
  return cell.status !== "found" && !cell.reviewed;
}
const markdownCell = (value) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\|/g, "&#124;")
    .replace(/[\r\n]+/g, "<br>")
    .replace(/([\\`*_\[\]])/g, "\\$1");
export function comparisonTableMarkdown(table) {
  const statuses = {
    missing: "未提供",
    conflict: "不同说法待核对",
    unavailable: "资料未完整读取",
    format_error: "格式待核对",
  };
  const cellText = (cell) =>
    `${cell.value || (cell.edited ? "—" : statuses[cell.status] || "")}${cell.edited ? "（已修改）" : cell.reviewed ? "（已核对）" : cell.status === "conflict" || cell.status === "format_error" ? `（${statuses[cell.status]}）` : ""}`;
  const lines = [
    `| 来源资料 | ${table.columns.map((c) => markdownCell(c.label)).join(" | ")} |`,
    `| --- | ${table.columns.map(() => "---").join(" | ")} |`,
    ...table.rows.map(
      (row) =>
        `| ${markdownCell(row.title)} | ${row.cells.map((c) => markdownCell(cellText(c))).join(" | ")} |`,
    ),
    "",
    "## 原文依据",
    "",
  ];
  for (const row of table.rows) {
    lines.push(`### ${markdownCell(row.title)}`, "");
    row.cells.forEach((cell, index) => {
      if (cell.quotes.length)
        lines.push(
          `- **${markdownCell(table.columns[index].label)}**：${cell.quotes.map(markdownCell).join("；")}`,
        );
    });
    lines.push("");
  }
  return lines.join("\n");
}
