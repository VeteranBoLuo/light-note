/** One deterministic chart representation for the preview and exported image. */
export function buildToolboxChart(
  points: readonly { label: string; value: number }[],
  direction: 'horizontal' | 'vertical',
  title: string,
) {
  const items = points.filter((point) => Number.isFinite(point.value)).slice(0, 20);
  const min = Math.min(0, ...items.map((point) => point.value));
  const max = Math.max(0, ...items.map((point) => point.value));
  const range = max - min || 1;
  const horizontal = direction === 'horizontal';
  const width = 1400;
  const height = horizontal ? Math.max(400, items.length * 40 + 160) : 820;
  const left = horizontal ? 240 : 90;
  const top = 110;
  const plotWidth = width - left - 90;
  const plotHeight = height - top - 120;
  const scale = (value: number) =>
    horizontal ? left + ((value - min) / range) * plotWidth : top + ((max - value) / range) * plotHeight;
  const zero = scale(0);
  const escape = (value: string) =>
    value.replace(
      /[&<>"']/g,
      (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[char]!,
    );
  const text = (x: number, y: number, value: string, anchor = 'start', rotation = 0) =>
    `<text x="${x}" y="${y}" text-anchor="${anchor}" transform="rotate(${rotation} ${x} ${y})" fill="#171824" font-size="18">${escape(value)}</text>`;
  const bars = items
    .map((point, index) => {
      const cell = (horizontal ? plotHeight : plotWidth) / Math.max(1, items.length);
      const thickness = cell * 0.65;
      const coordinate = (horizontal ? top : left) + cell * (index + 0.175);
      const end = scale(point.value);
      const start = Math.min(zero, end);
      const length = Math.abs(zero - end);
      const rectangle = horizontal
        ? `<rect x="${start}" y="${coordinate}" width="${length}" height="${thickness}" fill="#615ced"/>`
        : `<rect x="${coordinate}" y="${start}" width="${thickness}" height="${length}" fill="#615ced"/>`;
      return `<g><title>${escape(point.label)}: ${point.value}</title>${rectangle}${
        horizontal
          ? text(left - 15, coordinate + thickness * 0.7, point.label.slice(0, 18), 'end') +
            text(
              end + (point.value < 0 ? -8 : 8),
              coordinate + thickness * 0.7,
              String(point.value),
              point.value < 0 ? 'end' : 'start',
            )
          : text(coordinate + thickness / 2, height - 90, point.label.slice(0, 7), 'end', -35) +
            text(coordinate + thickness / 2, end + (point.value < 0 ? 24 : -10), String(point.value), 'middle')
      }</g>`;
    })
    .join('');
  const axis = horizontal
    ? `<path d="M${zero} ${top}V${top + plotHeight}" stroke="#8b8d98"/>`
    : `<path d="M${left} ${zero}H${left + plotWidth}" stroke="#8b8d98"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img"><title>${escape(title)}</title><rect width="100%" height="100%" fill="white"/>${text(40, 55, title)}${axis}${bars}</svg>`;
}
