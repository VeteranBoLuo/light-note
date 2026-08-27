import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import JSZip from 'jszip';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(scriptDirectory, '..');
const sourceRoot = path.join(webRoot, 'dist-extension');
const manifest = JSON.parse(await fs.readFile(path.join(sourceRoot, 'manifest.json'), 'utf8'));
const outputRoot = path.join(webRoot, 'artifacts');
const outputPath = path.join(outputRoot, `light-note-browser-extension-${manifest.version}.zip`);
const zip = new JSZip();

async function addDirectory(directory, prefix = '') {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    const absolutePath = path.join(directory, entry.name);
    const archivePath = path.posix.join(prefix, entry.name);
    if (entry.isDirectory()) await addDirectory(absolutePath, archivePath);
    else zip.file(archivePath, await fs.readFile(absolutePath));
  }
}

await addDirectory(sourceRoot);
await fs.mkdir(outputRoot, { recursive: true });
const archive = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', compressionOptions: { level: 9 } });
await fs.writeFile(outputPath, archive);
const checksum = crypto.createHash('sha256').update(archive).digest('hex');
await fs.writeFile(`${outputPath}.sha256`, `${checksum}  ${path.basename(outputPath)}\n`);
console.log(`Extension package: ${outputPath}`);
console.log(`SHA-256: ${checksum}`);
