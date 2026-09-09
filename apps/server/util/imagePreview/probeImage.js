import { createDeflate } from 'node:zlib';
import { once } from 'node:events';
function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const name = Buffer.from(type);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([name, data])));
  return Buffer.concat([length, name, data, crc]);
}
/** Deterministic true-color PNG, generated row-by-row without a full decoded image allocation. */
export async function makeProbePng(width, height) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 2;
  const deflate = createDeflate();
  const chunks = [];
  deflate.on('data', (data) => chunks.push(data));
  const finished = once(deflate, 'end');
  for (let y = 0; y < height; y++) {
    const row = Buffer.alloc(1 + width * 3);
    for (let x = 0; x < width; x++) {
      row[x * 3 + 1] = Math.floor((x * 255) / width);
      row[x * 3 + 2] = Math.floor((y * 255) / height);
      row[x * 3 + 3] = 120;
    }
    if (!deflate.write(row)) await once(deflate, 'drain');
  }
  deflate.end();
  await finished;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', header),
    chunk('IDAT', Buffer.concat(chunks)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}
