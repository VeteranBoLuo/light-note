import { describe, expect, it } from 'vitest';
import { buildArchiveDirectoryPage, parseSevenZipListing, validateArchiveSignature } from './archive.js';

const limits = {
  archiveMaxEntries: 10,
  archiveMaxPathLength: 1024,
};

const listing = `Path = docs/readme.txt
Folder = -
Size = 120
Packed Size = 80
Modified = 2026-08-08 12:00:00
Encrypted = -

Path = docs/private.txt
Folder = -
Size = 50
Packed Size = 40
Encrypted = +

Path = top.txt
Folder = -
Size = 10
Packed Size = 8
Encrypted = -

Path = ../unsafe.txt
Folder = -
Size = 1
Packed Size = 1
Encrypted = -

Path = /absolute.txt
Folder = -
Size = 1
Packed Size = 1
Encrypted = -`;

function createTarHeader() {
  const header = Buffer.alloc(512);
  header.write('sample.txt', 0, 'ascii');
  header.write('0000644\0', 100, 'ascii');
  header.write('0000000\0', 108, 'ascii');
  header.write('0000000\0', 116, 'ascii');
  header.write('00000000000\0', 124, 'ascii');
  header.write('00000000000\0', 136, 'ascii');
  header.fill(0x20, 148, 156);
  header[156] = '0'.charCodeAt(0);
  header.write('ustar\0', 257, 'ascii');
  const checksum = header.reduce((sum, value) => sum + value, 0);
  header.write(`${checksum.toString(8).padStart(6, '0')}\0 `, 148, 'ascii');
  return header;
}

describe('archive manifest parser', () => {
  it('builds a safe, bounded manifest and hides traversal paths', () => {
    const manifest = parseSevenZipListing(listing, limits);
    expect(manifest.entryCount).toBe(3);
    expect(manifest.totalUncompressedSize).toBe(180);
    expect(manifest.containsEncrypted).toBe(true);
    expect(manifest.skippedUnsafeEntries).toBe(2);
  });

  it('infers directories and supports path navigation and search without extraction', () => {
    const manifest = parseSevenZipListing(listing, limits);
    const root = buildArchiveDirectoryPage(manifest);
    expect(root.items.map((item) => [item.name, item.isDirectory])).toEqual([
      ['docs', true],
      ['top.txt', false],
    ]);
    const docs = buildArchiveDirectoryPage(manifest, { directory: 'docs' });
    expect(docs.items.map((item) => item.name)).toEqual(['private.txt', 'readme.txt']);
    const search = buildArchiveDirectoryPage(manifest, { query: 'READ' });
    expect(search.items.map((item) => item.path)).toEqual(['docs/readme.txt']);
    expect(() => buildArchiveDirectoryPage(manifest, { directory: '../docs' })).toThrow('ARCHIVE_PATH_INVALID');
    expect(() => buildArchiveDirectoryPage(manifest, { directory: './docs' })).toThrow('ARCHIVE_PATH_INVALID');
  });

  it('validates signatures before handing data to 7-Zip', () => {
    expect(() => validateArchiveSignature(Buffer.from('not a zip'), 'zip')).toThrow('FILE_CONTENT_INVALID');
    expect(() => validateArchiveSignature(Buffer.from([0x50, 0x4b, 0x03, 0x04]), 'zip')).not.toThrow();
    expect(() => validateArchiveSignature(Buffer.from([0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c]), '7z')).not.toThrow();
    expect(() => validateArchiveSignature(Buffer.alloc(512), 'tar')).toThrow('FILE_CONTENT_INVALID');
    expect(() => validateArchiveSignature(createTarHeader(), 'tar')).not.toThrow();
  });

  it('counts unsafe entries toward the archive entry limit', () => {
    expect(() => parseSevenZipListing(listing, { ...limits, archiveMaxEntries: 4 })).toThrow(
      'ARCHIVE_ENTRY_LIMIT_EXCEEDED',
    );
  });
});
